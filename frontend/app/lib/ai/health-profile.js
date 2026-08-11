/**
 * Builds the longitudinal health profile from a resident's own history.
 *
 * Design note — the model does not get raw transcripts to reason over. Counting how
 * many times someone had loose motion, or noticing that two of those fell in the same
 * month, is arithmetic; language models are unreliable at it and it costs tokens to
 * make them try. So the aggregates are computed here in plain code and handed over as
 * facts, and the model is left to do the part it is actually good at: turning
 * "diarrhoea x3, all monsoon, ORS collected twice" into advice a person can act on.
 *
 * Only the two most recent episodes contribute full transcripts. Older ones arrive as
 * compact summaries — enough to spot a pattern, small enough that ten of them still fit
 * comfortably in one prompt.
 */

const FULL_TRANSCRIPT_EPISODES = 2;
const MAX_TRANSCRIPT_TURNS = 12;

function monthName(date) {
  return new Date(date).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function dayStamp(date) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Turns raw episodes and orders into the countable facts the prompt needs.
 * Everything here is deterministic — the same history always yields the same numbers.
 */
export function summariseHistory(episodes, orders) {
  const symptomCounts = new Map();
  const conditionCounts = new Map();
  const monthCounts = new Map();

  for (const episode of episodes) {
    for (const symptom of episode.symptomHistory || []) {
      symptomCounts.set(symptom, (symptomCounts.get(symptom) || 0) + 1);
    }

    const condition = (episode.conditionGuess || "").trim();
    if (condition) {
      conditionCounts.set(condition, (conditionCounts.get(condition) || 0) + 1);
    }

    const month = monthName(episode.createdAt);
    monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
  }

  const medicineCounts = new Map();
  for (const order of orders) {
    const entry = medicineCounts.get(order.brand) || { brand: order.brand, times: 0, units: 0 };
    entry.times += 1;
    entry.units += order.quantity || 0;
    medicineCounts.set(order.brand, entry);
  }

  const sortByCount = (map) =>
    [...map.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8);

  const spanDays = episodes.length
    ? Math.max(
        1,
        Math.round(
          (new Date(episodes[0].createdAt) -
            new Date(episodes[episodes.length - 1].createdAt)) /
            86400000
        )
      )
    : 0;

  return {
    episodeCount: episodes.length,
    spanDays,
    repeatedSymptoms: sortByCount(symptomCounts).filter(([, count]) => count >= 2),
    repeatedConditions: sortByCount(conditionCounts).filter(([, count]) => count >= 2),
    busiestMonths: sortByCount(monthCounts).filter(([, count]) => count >= 2),
    // Repeatedly collecting the same medicine is a stronger signal than repeatedly
    // mentioning a symptom — they went out and paid for it.
    repeatedMedicines: [...medicineCounts.values()]
      .filter((entry) => entry.times >= 2)
      .sort((left, right) => right.times - left.times),
    allMedicines: [...medicineCounts.values()].sort((left, right) => right.times - left.times),
  };
}

/** Compact per-episode lines; full transcript only for the newest couple. */
function renderEpisodes(episodes) {
  return episodes
    .map((episode, index) => {
      const header = [
        `[${dayStamp(episode.createdAt)}] ${episode.title || "Bina naam"}`,
        episode.conditionGuess ? `  Lagta tha: ${episode.conditionGuess}` : "",
        episode.symptomHistory?.length
          ? `  Lakshan: ${episode.symptomHistory.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      if (index >= FULL_TRANSCRIPT_EPISODES) return header;

      const turns = (episode.messages || [])
        .slice(-MAX_TRANSCRIPT_TURNS)
        .map((message) => `    ${message.role === "user" ? "User" : "Bot"}: ${message.content}`)
        .join("\n");

      return `${header}\n  Baat-cheet:\n${turns}`;
    })
    .join("\n\n");
}

const PROFILE_SYSTEM_PROMPT_TEMPLATE = `You write a personal health profile for one person
in rural or semi-urban India, from their own history of illnesses.

This is not advice about one illness. It is the long view: what keeps happening to this
person, why it might keep happening, and what they can change so it happens less.

{{VOICE}} Short sentences. A person with basic schooling
should be able to read it aloud to their family and act on it.

WHAT MAKES THIS USEFUL

The numbers are already counted for you in the FACTS block — do not recount them, and
do not contradict them. Your job is to explain what they mean.

Look for the connection between episodes, not just the list:
- Same complaint returning: is there something in how they live that brings it back?
- Clustering in certain months: monsoon stomach trouble, winter chest trouble.
- Repeatedly buying the same medicine: a problem being suppressed, not treated.
- One thing leading to another: a cough that keeps coming back after every cold.

If there is genuinely no pattern — one or two unrelated episodes — say so plainly and
keep the advice general. Do not invent a trend from two data points. An honest "no pattern is visible yet" is more useful than a confident wrong story.

WHAT TO WRITE

headline       — one line summing them up, e.g. "Stomach trouble three times in the last four months."
overview       — 2 to 4 sentences on what has been happening overall.
patterns       — the repeating things. Each with the evidence it rests on and what it
                 means for them. Empty if there is honestly no pattern.
riskFactors    — what in their life or area makes recurrence likely. Ground it in what
                 they actually said, plus the area outbreak information if given.
preventionPlan — 4 to 6 concrete actions to stop it recurring. Specific, not slogans:
                 "peene ka paani 10 minute ubaal kar thanda karke rakhein", not
                 "hygiene ka dhyan rakhein".
exercisePlan   — 3 to 5 gentle, realistic steps. A farm labourer does not need a gym.
                 If their history suggests rest instead, say that.
dietAdvice     — 3 to 5 items, using food that is actually available to them.
warningSigns   — 3 to 5 signs that mean see a doctor, tuned to THEIR history.
homeKit        — 3 to 5 things worth keeping at home given what keeps happening.
doctorNotes    — what to tell a doctor at the next visit, including the repeat pattern.

RULES
- Never diagnose. Hedge ("it looks like", "it could be") — never "you have TB".
- Only name medicines that appear in their history.
- Do not promise cures or claim this prevents any specific disease.
- Plain text in every field. No markdown, no asterisks, no bullet characters.
- Spell these exactly: ORS (never "oal" or "ors ka pani"), PHC, ASHA, Paracetamol.
  These are the words people will look for on a packet or a signboard, so a garbled
  version makes the advice unusable.`;

export const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    overview: { type: "string" },
    patterns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          evidence: { type: "string" },
          whatItMeans: { type: "string" },
        },
        required: ["pattern"],
      },
    },
    riskFactors: { type: "array", items: { type: "string" } },
    preventionPlan: { type: "array", items: { type: "string" } },
    exercisePlan: { type: "array", items: { type: "string" } },
    dietAdvice: { type: "array", items: { type: "string" } },
    warningSigns: { type: "array", items: { type: "string" } },
    homeKit: { type: "array", items: { type: "string" } },
    doctorNotes: { type: "string" },
  },
  required: ["headline", "overview", "preventionPlan", "warningSigns"],
};

/**
 * @param {object} input
 * @param {object} input.user            name + location
 * @param {Array}  input.episodes        newest first, already capped
 * @param {Array}  input.orders          collected medicines
 * @param {object} input.areaRisk        current outbreak picture for their village
 */
export function buildProfilePrompt({ user, episodes, orders, areaRisk }) {
  const facts = summariseHistory(episodes, orders);

  const factLines = [
    `Total episodes on record (most recent ${episodes.length}): ${facts.episodeCount}`,
    facts.spanDays ? `Covering roughly ${facts.spanDays} days` : "",
    facts.repeatedSymptoms.length
      ? `Symptoms seen more than once: ${facts.repeatedSymptoms
          .map(([symptom, count]) => `${symptom} x${count}`)
          .join(", ")}`
      : "No symptom has repeated across episodes.",
    facts.repeatedConditions.length
      ? `Conditions guessed more than once: ${facts.repeatedConditions
          .map(([condition, count]) => `${condition} x${count}`)
          .join(", ")}`
      : "",
    facts.busiestMonths.length
      ? `Months with more than one episode: ${facts.busiestMonths
          .map(([month, count]) => `${month} (${count})`)
          .join(", ")}`
      : "",
    facts.repeatedMedicines.length
      ? `Medicines collected more than once: ${facts.repeatedMedicines
          .map((entry) => `${entry.brand} x${entry.times} (${entry.units} units total)`)
          .join(", ")}`
      : "",
    facts.allMedicines.length
      ? `All medicines collected: ${facts.allMedicines.map((entry) => entry.brand).join(", ")}`
      : "No medicine collected through the app yet.",
  ].filter(Boolean);

  const areaLines = areaRisk?.riskLevel
    ? [
        `Their area (${areaRisk.village}, ${areaRisk.district}) is currently ${areaRisk.riskLevel} risk.`,
        areaRisk.topDisease ? `Most reported there right now: ${areaRisk.topDisease}.` : "",
        `Cases reported in the last 14 days: ${areaRisk.cases}.`,
      ].filter(Boolean)
    : ["No current outbreak data for their area."];

  return [
    `PERSON: ${user.name || "User"}`,
    user.location?.village ? `AREA: ${user.location.village}, ${user.location.district}` : "",
    "",
    "FACTS (already counted — use these, do not recount):",
    ...factLines.map((line) => `- ${line}`),
    "",
    "AREA SITUATION:",
    ...areaLines.map((line) => `- ${line}`),
    "",
    "THEIR EPISODES (newest first):",
    renderEpisodes(episodes),
    "",
    "Write their health profile.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The profile is prose the person reads and shows a doctor, so it is written in the
 * language they chose for everything else rather than in one fixed for them.
 */
export function profileSystemPrompt(locale = "en") {
  const voice =
    locale === "hi"
      ? "Write in simple Hinglish (Roman script)."
      : "Write in simple, plain English. Do not use Hindi or Hinglish.";

  // Stated twice, once in place and once last. A single line early in a long prompt
  // loses to the examples that follow it; the closing line is the one nearest the
  // output the model is about to write.
  return `${PROFILE_SYSTEM_PROMPT_TEMPLATE.replace("{{VOICE}}", voice)}

LANGUAGE: ${voice}`;
}
