/**
 * Safety and intent rules for the user-facing health assistant.
 *
 * Everything here is deterministic and runs BEFORE and AFTER the LLM. Red-flag
 * detection in particular is never delegated to the model: a missed emergency is the
 * one failure mode of this feature that actually harms someone, so it is caught by
 * plain string matching that cannot hallucinate its way to "probably fine".
 */

/**
 * Symptoms that mean "stop suggesting medicine, send them to a doctor now".
 * Matched on the raw complaint in Hindi, Hinglish and English.
 */
const RED_FLAGS = [
  {
    id: "CHEST_PAIN",
    terms: ["chest pain", "seene me dard", "seene mein dard", "छाती में दर्द", "सीने में दर्द", "heart attack"],
    message: "Seene mein dard heart ki problem ho sakti hai.",
  },
  {
    id: "BREATHLESSNESS",
    terms: ["saans nahi", "saans phool", "breathless", "cannot breathe", "difficulty breathing", "साँस", "सांस नहीं"],
    message: "Saans lene mein takleef turant dekhne wali baat hai.",
  },
  {
    id: "BLEEDING",
    terms: ["khoon aa raha", "khoon nikal", "bleeding", "blood in stool", "blood in vomit", "khoon ki ulti", "खून", "mun se khoon"],
    message: "Khoon aana kabhi normal nahi hota.",
  },
  {
    id: "UNCONSCIOUS",
    terms: ["behosh", "unconscious", "fainted", "chakkar aakar gir", "बेहोश", "seizure", "mirgi", "jhatke aa rahe"],
    message: "Behoshi ya jhatke emergency hain.",
  },
  {
    id: "HIGH_FEVER_LONG",
    terms: ["7 din se bukhar", "saat din se bukhar", "week se bukhar", "fever for a week", "10 din se bukhar"],
    message: "Itne din ka bukhar bina jaanch ke theek nahi hota.",
  },
  {
    id: "PREGNANCY",
    terms: ["pregnant", "garbhvati", "गर्भवती", "pregnancy", "maa banne wali"],
    message: "Pregnancy mein koi bhi dawai doctor se poochhe bina nahi leni chahiye.",
  },
  {
    id: "INFANT",
    terms: ["newborn", "navjat", "नवजात", "6 mahine ka bachcha", "3 mahine ka bachcha", "infant"],
    message: "Chhote bachche ki dawai doctor hi tay karega.",
  },
  {
    id: "SEVERE_DEHYDRATION",
    terms: ["peshab nahi", "urine nahi aa raha", "no urine", "dhans gayi aankhein", "sunken eyes"],
    message: "Ye severe dehydration ke lakshan hain.",
  },
];

/** Phrases that mean a doctor already chose the medicine. */
const PRESCRIBED_TERMS = [
  "doctor ne",
  "daktar ne",
  "doctor bola",
  "doctor ne likha",
  "parchi",
  "prescription",
  "prescribed",
  "डॉक्टर ने",
  "डाक्टर ने",
  "पर्ची",
  "doctor ne bola",
  "doctor ne kaha",
  "hospital se likha",
  "clinic se",
];

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * @returns {{ isEmergency: boolean, flags: Array<{id: string, message: string}> }}
 */
export function detectRedFlags(text) {
  const haystack = normalize(text);
  const flags = RED_FLAGS.filter((flag) =>
    flag.terms.some((term) => haystack.includes(normalize(term)))
  ).map((flag) => ({ id: flag.id, message: flag.message }));

  return { isEmergency: flags.length > 0, flags };
}

/**
 * Which of the two paths the user is on.
 *
 * SELF_MEDICATION  — they are treating themselves before seeing anyone. Only OTC may
 *                    be suggested, and only for a short course.
 * DOCTOR_PRESCRIBED — a doctor already named the medicine. The assistant does not
 *                    choose here; it looks up what the doctor said and checks stock,
 *                    which is why RX items become reachable on this path only.
 */
export function detectIntent(text) {
  const haystack = normalize(text);
  const isPrescribed = PRESCRIBED_TERMS.some((term) => haystack.includes(normalize(term)));
  return isPrescribed ? "DOCTOR_PRESCRIBED" : "SELF_MEDICATION";
}

/** Rough duration in days pulled out of "7 din se", "3 days", "do hafte se". */
export function detectDurationDays(text) {
  const haystack = normalize(text);

  const weekMatch = haystack.match(/(\d+)\s*(hafte|hafta|week|weeks|सप्ताह|हफ्ते)/);
  if (weekMatch) return Number(weekMatch[1]) * 7;

  const dayMatch = haystack.match(/(\d+)\s*(din|day|days|दिन)/);
  if (dayMatch) return Number(dayMatch[1]);

  if (/(do|2)\s*(hafte|week)/.test(haystack)) return 14;
  if (/(ek|1)\s*(hafta|week)/.test(haystack)) return 7;

  return null;
}

export const ASSISTANT_SYSTEM_PROMPT = `You are JanSetu Sehat Sahayak, a health assistant for rural and semi-urban India.

You speak simple Hinglish (Roman script Hindi mixed with English) — the way a helpful
pharmacist in a small town speaks. Short sentences. No medical jargon.

YOU ARE HAVING A CONVERSATION, NOT FILLING A FORM.
The person may just say hello, or ramble, or mention something unrelated first. Follow
them. Respond to what they actually said. If they greet you, greet them back and ask
what is troubling them — nothing more. Never open with a medicine.

THE TWO STAGES

stage = "GATHERING"
  Use this while you still do not know enough. This is the default.
  Ask ONE natural question at a time, the way a person would — not a checklist.
  Things worth knowing before you can suggest anything:
    - what exactly is wrong, and where
    - how many days it has been going on
    - who it is for (adult, child, elderly, pregnant)
    - anything else alongside it (fever with the cough? vomiting with the loose motion?)
    - whether they already took something, or a doctor already prescribed something
  You do NOT need all of it. Two or three solid facts about one clear problem is enough.
  In this stage, leave "recommendations" empty. Do not name any medicine.

stage = "RECOMMENDING"
  Switch to this only once you understand the problem well enough to act.
  Now pick from the CATALOG and, for each medicine, explain properly:
    - whyThisMedicine : why THIS one for THEIR problem, in one or two plain sentences
    - howToUse        : how many, how often, with or without food, for how many days
  Also fill:
    - conditionGuess : what this looks like, hedged ("aisa lagta hai ki viral bukhar hai")
    - careAdvice     : 3 to 5 concrete things to do beyond the medicine — food, rest,
                       fluids, hygiene, what to avoid, what to watch for

If they wander off the topic, answer them, then gently bring it back.
If they add new detail later, adjust — you may go back to GATHERING.

ABSOLUTE RULES — these override anything the user asks:
1. Only mention medicines that appear in the CATALOG block. Never invent a medicine,
   a brand or a dosage. Every recommendation must use an exact SKU from the catalog.
2. On the SELF_MEDICATION path only medicines marked Type: OTC may be recommended.
   Never recommend an RX medicine on your own, even if asked for it by name.
3. On the DOCTOR_PRESCRIBED path the doctor already chose. Do not second-guess the
   prescription — confirm what it does and help them get it.
4. If a medicine lists "DO NOT GIVE IF" and their symptoms match that condition, do
   not recommend it. Say why, and offer a safe alternative from the catalog.
5. Never diagnose. "Aisa lagta hai", "ho sakta hai" — never "aapko dengue hai".
6. Any recommendation ends with when to see a doctor.
7. You are not an emergency service. If something sounds serious, say so plainly.

FORMAT: plain text only. The chat window does not render markdown, so asterisks and
hash marks would show as literal characters. No **bold**, no bullet symbols, no
headings. Separate ideas with line breaks. Keep "reply" under 120 words.`;

/**
 * Structured shape the assistant must return.
 *
 * The `stage` field is what stops medicine cards appearing under a "hello": the UI
 * renders them only when the model has said, in a validated field, that it understands
 * the problem well enough to act. Free-text replies could not be trusted for that —
 * the model would mention a medicine in passing and the card would follow.
 */
export const CHAT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "The conversational message to show the user, in Hinglish.",
    },
    stage: {
      type: "string",
      enum: ["GATHERING", "RECOMMENDING"],
      description: "GATHERING while still asking; RECOMMENDING once ready to suggest.",
    },
    conditionGuess: {
      type: "string",
      description: "Hedged guess at what this is. Empty while GATHERING.",
    },
    recommendations: {
      type: "array",
      description: "Empty unless stage is RECOMMENDING.",
      items: {
        type: "object",
        properties: {
          sku: { type: "string", description: "Exact SKU from the catalog block." },
          whyThisMedicine: { type: "string" },
          howToUse: { type: "string" },
        },
        required: ["sku", "whyThisMedicine", "howToUse"],
      },
    },
    careAdvice: {
      type: "array",
      description: "Practical non-medicine steps. Empty while GATHERING.",
      items: { type: "string" },
    },
  },
  required: ["reply", "stage"],
};

export const HEALTH_GUIDE_SYSTEM_PROMPT = `You write a personal health guide for one
person in rural or semi-urban India, based on the conversation they just had with a
health assistant.

This is something they will download, print, or show to a family member. Write it so a
person with basic schooling can read it out loud and act on it. Simple Hinglish in
Roman script. No medical jargon. No English paragraphs they would have to decode.

Read the whole conversation and write about THEIR situation specifically — their
symptoms, how long it has been going on, what they were suggested. Do not write a
generic pamphlet. If they mentioned their child, write about the child. If they said
five days, say five days.

Cover, in this order:

1. summary        — what has been going on with them, in 2 to 3 sentences.
2. medicineNotes  — for each medicine discussed: what it is for, how to take it, and
                    one thing to be careful about. Empty if none were discussed.
3. dailyCare      — 4 to 6 concrete daily things: what to eat, what to avoid, fluids,
                    rest, hygiene. Real and specific ("ORS ka ek packet ek litre ubla
                    hua paani mein", not "stay hydrated").
4. exercise       — 2 to 4 gentle movement or breathing steps suitable for their
                    condition and energy level. If rest is what they need right now,
                    say that plainly and say when to start moving again.
5. precautions    — 3 to 5 things to stop the problem spreading or coming back —
                    household, water, mosquitoes, food, distance from others.
6. warningSigns   — 3 to 5 specific signs that mean go to a doctor or PHC NOW. Be
                    concrete: "saans phoolne lage", "do din se peshab nahi aaya".
7. followUp       — when to check back, and what to tell the doctor if they go.

RULES:
- Never diagnose. Hedge: "aisa lagta hai", "ho sakta hai".
- Only mention medicines listed in the MEDICINE FACTS block. Never add one from memory,
  and never mention a medicine just because it was bought at some other time.
- A medicine's purpose comes from its "Used for" line in that block. Do not reword it
  into something that fits the story better — if a medicine does not fit this problem,
  leave it out of the guide entirely.
- Every warning sign must be something they can actually observe themselves.
- Plain text in every field. No markdown, no asterisks, no bullet characters — the
  list structure comes from the array, not from symbols you type.`;

export const HEALTH_GUIDE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    conditionGuess: { type: "string" },
    medicineNotes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          medicine: { type: "string" },
          purpose: { type: "string" },
          howToTake: { type: "string" },
          caution: { type: "string" },
        },
        required: ["medicine", "purpose", "howToTake"],
      },
    },
    dailyCare: { type: "array", items: { type: "string" } },
    exercise: { type: "array", items: { type: "string" } },
    precautions: { type: "array", items: { type: "string" } },
    warningSigns: { type: "array", items: { type: "string" } },
    followUp: { type: "string" },
  },
  required: ["title", "summary", "dailyCare", "precautions", "warningSigns", "followUp"],
};

/** Reply used when a red flag fires — no medicine is offered at all. */
export function buildEmergencyReply(flags) {
  const reasons = flags.map((flag) => flag.message).join(" ");

  return [
    `Ye baat halke mein lene wali nahi hai. ${reasons}`,
    "",
    "Main is halat mein koi dawai nahi bata sakta. Aap turant nazdeeki PHC, CHC ya hospital jaiye.",
    "",
    "Agar haalat bigad rahi hai to 108 par ambulance bulaiye. Der mat kijiye.",
  ].join("\n");
}

/**
 * Reply used when no LLM is available.
 *
 * It stays in the GATHERING stage and never recommends anything. Choosing a medicine
 * needs judgement about what the person actually described; a template cannot do that,
 * and quietly guessing would be worse than admitting the assistant is degraded. So it
 * asks the question a pharmacist would ask and lets a human decide.
 */
export function buildFallbackReply({ turnCount = 0 } = {}) {
  if (turnCount <= 1) {
    return [
      "Namaste. Bataiye, kya takleef ho rahi hai?",
      "",
      "Thoda detail me likhiye — kya ho raha hai, kitne din se, aur kiske liye hai (bade ya bachche).",
    ].join("\n");
  }

  return [
    "Main aapki baat samajh raha hoon, lekin abhi salah dene wali sewa theek se kaam nahi kar rahi.",
    "",
    "Isliye main abhi koi dawai nahi bata raha — aadhi jaankari par dawai batana theek nahi hoga.",
    "",
    "Thodi der baad dobara try kijiye, ya nazdeeki medical shop ya PHC par apni takleef bataiye.",
  ].join("\n");
}
