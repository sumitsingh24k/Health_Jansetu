/**
 * Does the correlation engine actually work?
 *
 * This is the honest answer to that question, and honesty is the hard part. There is no
 * ground truth in this system: ASHA reports and medicine movement are two noisy
 * observers of the same reality, and neither is "the truth". Scoring one against the
 * other would be worse than useless — the engine's headline feature is finding cases
 * ASHAs *missed*, so treating ASHA reports as truth would count every real
 * under-reporting catch as a false positive and reward an engine that never looks.
 *
 * So three separate things are measured, and they are never mixed up:
 *
 *   1. SYNTHETIC ACCURACY  — labelled scenarios built from a known truth, run through
 *      the real engine. This is a genuine confusion matrix with genuine accuracy,
 *      precision and recall, because here we *do* know what the answer should be.
 *      It measures whether the rules behave as designed. It says nothing about whether
 *      the real world matches the scenarios.
 *
 *   2. AGREEMENT MATRIX    — how often the two real sources agree, on real data.
 *      Reported with Cohen's kappa. This is agreement, NOT accuracy, and every label
 *      here says so. A cell is not a "false positive"; it is a disagreement, and
 *      disagreements are the output the system exists to produce.
 *
 *   3. BACKTEST            — the only true accuracy measure: predict today, check
 *      against what was reported two days later. Needs history the deployment may not
 *      have yet, so it returns INSUFFICIENT_DATA with the shortfall spelled out rather
 *      than a number computed from four data points.
 */

import { correlateSignals } from "@/app/lib/correlation/medicine-signal";

/* ------------------------------------------------------------------ *
 * Deterministic randomness
 * ------------------------------------------------------------------ */

/**
 * Seeded generator, so a validation run is reproducible.
 *
 * An accuracy figure that changes every refresh cannot be argued with or regression
 * tested — the same seed must always produce the same matrix.
 */
function createRandom(seed = 42) {
  let state = seed >>> 0 || 1;
  return () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/* ------------------------------------------------------------------ *
 * 1. Synthetic accuracy
 * ------------------------------------------------------------------ */

/**
 * The four situations the engine has to tell apart, and what it should say about each.
 *
 * `truth` is what is really happening in the village. `outbreakPresent` is the binary
 * question the confusion matrix scores: is there a real disease event here that
 * deserves attention?
 */
export const SCENARIO_TYPES = {
  OUTBREAK: {
    label: "OUTBREAK",
    outbreakPresent: true,
    description: "Asli outbreak, ASHA ne bhi dekha aur dawai bhi chali",
    expectedStatus: "CONFIRMED",
  },
  UNDER_REPORTED: {
    label: "UNDER_REPORTED",
    outbreakPresent: true,
    description: "Asli outbreak par ASHA survey me nahi aaya — sirf dawai chal rahi hai",
    expectedStatus: "MEDICINE_ONLY",
  },
  OVER_REPORTED: {
    label: "OVER_REPORTED",
    outbreakPresent: false,
    description: "ASHA ne case likhe par koi dawai nahi chali — count zyada lag raha hai",
    expectedStatus: "ASHA_ONLY",
  },
  NOISE: {
    label: "NOISE",
    outbreakPresent: false,
    description: "Kuch nahi — thodi si aam bukhar ki dawai, koi report nahi",
    expectedStatus: null,
  },
};

const DISEASE = "DENGUE";

/**
 * How separable the scenario is.
 *
 * CLEAR cases sit well away from every threshold, and an engine that got those wrong
 * would be broken outright. BORDERLINE cases sit right where the noise floor is, which
 * is where a real village actually lives: a five-case outbreak in a hamlet moves about
 * as much medicine as a bad flu week. Reporting only the CLEAR number would be marking
 * our own homework with questions we wrote to be easy.
 */
export const DIFFICULTIES = ["CLEAR", "BORDERLINE"];

/** One labelled village-week, shaped exactly like what the engine reads from Mongo. */
function buildScenario(type, difficulty, random) {
  const asha = new Map();
  const orders = new Map();
  const counter = new Map();
  const specificity = new Map();

  const jitter = (base, spread) => Math.max(0, base + (random() - 0.5) * spread);
  const borderline = difficulty === "BORDERLINE";

  // What is actually on the counter. A real dengue cluster pulls a dengue-specific
  // product (papaya-leaf extract, weight ~0.85); a quiet week pulls nothing but
  // broad-spectrum fever medicine, which points weakly at half the catalog.
  //
  // Whether that specific product moved has to be *drawn*, not assumed from the label.
  // It used to be set as `realEvent ? 0.85 : 0.2`, and since the engine's survey-alert
  // gate refuses any peak weight below MEDICINE_ONLY_MIN_WEIGHT (0.4), a NOISE week
  // could never be flagged however much medicine moved — the answer was being handed to
  // the engine inside its own input. That is why every scenario, every difficulty and
  // every seed scored a clean 100%: the one variable that decides was noise-free.
  //
  // Real events usually pull the specific product and quiet weeks usually do not, but
  // both sometimes do the opposite — a shop out of stock during a real cluster, one
  // traveller buying it during a quiet one. That overlap is the only reason this test
  // is capable of failing, and BORDERLINE is where it overlaps most.
  const realEvent = type === "OUTBREAK" || type === "UNDER_REPORTED";
  const specificProductChance = realEvent ? (borderline ? 0.6 : 0.85) : borderline ? 0.3 : 0.1;
  specificity.set(DISEASE, random() < specificProductChance ? 0.85 : 0.2);

  if (type === "OUTBREAK") {
    // Borderline: a small hamlet cluster, a handful of cases and barely a patient's
    // worth of medicine on each side of the ledger.
    const cases = borderline ? Math.round(jitter(3, 3)) : Math.round(jitter(14, 10));
    asha.set(DISEASE, cases);
    // Medicine roughly tracks the caseload, which is what a real outbreak looks like.
    orders.set(DISEASE, jitter(cases * 0.8, cases * 0.5));
    counter.set(DISEASE, jitter(cases * 0.5, cases * 0.4));
  } else if (type === "UNDER_REPORTED") {
    // Nobody filed a report. The medicine still moved.
    orders.set(DISEASE, borderline ? jitter(1.2, 1.2) : jitter(9, 6));
    counter.set(DISEASE, borderline ? jitter(0.8, 0.8) : jitter(6, 5));
  } else if (type === "OVER_REPORTED") {
    asha.set(DISEASE, borderline ? Math.round(jitter(2, 2)) : Math.round(jitter(12, 8)));
    // Below the noise floor on purpose: a couple of strips, nothing more.
    orders.set(DISEASE, borderline ? jitter(0.7, 0.6) : jitter(0.3, 0.4));
  } else {
    // Broad-spectrum fever medicine dribbling out, close to the floor when borderline.
    orders.set(DISEASE, borderline ? jitter(0.75, 0.7) : jitter(0.35, 0.5));
    counter.set(DISEASE, borderline ? jitter(0.6, 0.6) : jitter(0.3, 0.4));
  }

  return { type, difficulty, asha, orders, counter, specificity };
}

/** What the engine concluded about a scenario, reduced to the binary question. */
function engineVerdict(scenario) {
  const rows = correlateSignals(
    scenario.asha,
    scenario.orders,
    scenario.counter,
    scenario.specificity
  );
  const row = rows.find((entry) => entry.disease === DISEASE) || null;

  // The engine "flags" an area when it says a real event is present — either both
  // sources agree, or medicine is moving with nobody reporting it. ASHA_ONLY is
  // deliberately NOT a flag: unbacked report counts are exactly what it cannot confirm.
  const flagged = Boolean(row && (row.status === "CONFIRMED" || row.status === "MEDICINE_ONLY"));

  return { row, flagged, status: row?.status ?? "NONE" };
}

function emptyMatrix() {
  return { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
}

function metricsFrom(matrix) {
  const { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn } = matrix;
  const total = tp + fp + tn + fn;
  const safe = (numerator, denominator) =>
    denominator > 0 ? Number((numerator / denominator).toFixed(3)) : null;

  const precision = safe(tp, tp + fp);
  const recall = safe(tp, tp + fn);
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? Number(((2 * precision * recall) / (precision + recall)).toFixed(3))
      : null;

  return {
    total,
    accuracy: safe(tp + tn, total),
    precision,
    recall,
    specificity: safe(tn, tn + fp),
    f1,
  };
}

/**
 * Runs labelled scenarios through the real engine and scores it.
 *
 * @param {object} options
 * @param {number} options.perType  scenarios generated per scenario type
 * @param {number} options.seed     fixed so the report is reproducible
 */
/**
 * Seeds the report is re-run on.
 *
 * The thresholds inside the engine were tuned while watching these scenarios, so the
 * headline seed flatters itself. Re-running on seeds that took no part in that tuning
 * is the closest thing to a held-out set available here, and it is reported next to the
 * headline rather than hidden.
 */
const SEED_SWEEP = [1, 7, 99, 2024];

/** The scenario loop itself, so the seed sweep can reuse it without recursing. */
function runScenarios({ perType, seed }) {
  const random = createRandom(seed);
  const overall = emptyMatrix();
  const byDifficulty = { CLEAR: emptyMatrix(), BORDERLINE: emptyMatrix() };

  // Predicted status vs true scenario — shows *how* it fails, not just how often.
  const byScenario = {};
  const misses = [];

  const noteMiss = (scenario, verdict, meta) => {
    if (misses.length >= 6) return;
    misses.push({
      scenario: scenario.type,
      difficulty: scenario.difficulty,
      got: verdict.status,
      expected: meta.expectedStatus,
      ashaCases: scenario.asha.get(DISEASE) || 0,
      medicineDemand: Number(
        ((scenario.orders.get(DISEASE) || 0) + (scenario.counter.get(DISEASE) || 0)).toFixed(2)
      ),
    });
  };

  for (const type of Object.keys(SCENARIO_TYPES)) {
    const meta = SCENARIO_TYPES[type];
    byScenario[type] = {
      label: meta.label,
      description: meta.description,
      expectedStatus: meta.expectedStatus,
      total: 0,
      correct: 0,
      statusCounts: {},
      correctByDifficulty: { CLEAR: 0, BORDERLINE: 0 },
      totalByDifficulty: { CLEAR: 0, BORDERLINE: 0 },
    };

    for (const difficulty of DIFFICULTIES) {
      for (let index = 0; index < perType; index += 1) {
        const scenario = buildScenario(type, difficulty, random);
        const verdict = engineVerdict(scenario);

        const bucket = byScenario[type];
        bucket.total += 1;
        bucket.totalByDifficulty[difficulty] += 1;
        bucket.statusCounts[verdict.status] = (bucket.statusCounts[verdict.status] || 0) + 1;

        const statusCorrect = meta.expectedStatus
          ? verdict.status === meta.expectedStatus
          : verdict.status === "NONE" || verdict.status === "ASHA_ONLY";
        if (statusCorrect) {
          bucket.correct += 1;
          bucket.correctByDifficulty[difficulty] += 1;
        }

        const cell = meta.outbreakPresent
          ? verdict.flagged
            ? "truePositive"
            : "falseNegative"
          : verdict.flagged
            ? "falsePositive"
            : "trueNegative";

        overall[cell] += 1;
        byDifficulty[difficulty][cell] += 1;

        if (cell === "falseNegative" || cell === "falsePositive") {
          noteMiss(scenario, verdict, meta);
        }
      }
    }
  }

  return { overall, byDifficulty, byScenario, misses };
}

/**
 * Runs labelled scenarios through the real engine and scores it.
 *
 * @param {object} options
 * @param {number} options.perType  scenarios generated per type per difficulty
 * @param {number} options.seed     fixed so the report is reproducible
 */
export function syntheticValidation({ perType = 60, seed = 42 } = {}) {
  const { overall, byDifficulty, byScenario, misses } = runScenarios({ perType, seed });

  return {
    kind: "SYNTHETIC_ACCURACY",
    seed,
    perType,
    matrix: overall,
    metrics: metricsFrom(overall),
    byDifficulty: {
      CLEAR: { matrix: byDifficulty.CLEAR, metrics: metricsFrom(byDifficulty.CLEAR) },
      BORDERLINE: {
        matrix: byDifficulty.BORDERLINE,
        metrics: metricsFrom(byDifficulty.BORDERLINE),
      },
    },
    byScenario,
    sampleMisses: misses,
    caveat:
      "Ye accuracy banaye gaye (synthetic) scenarios par hai, jinka sach pehle se pata hai. Isse pata chalta hai ki engine ke rules apne design ke mutabik chal rahe hain — ye nahi ki asli zameen par kitne sahi hain. BORDERLINE waala number zyada matlab rakhta hai: wahi asli gaon jaisa haal hai.",
    honesty:
      "Engine ke threshold inhi scenarios ko dekh kar tune kiye gaye the, isliye ye score andar ki consistency naapta hai, generalisation nahi. Alag seed par number thoda girta hai — wahi zyada bharosemand hai. Asli accuracy sirf backtest degi, jab kaafi din ka data jama ho jaye.",
    seedSweep: SEED_SWEEP.map((sweepSeed) => {
      const swept = runScenarios({ perType: Math.min(perType, 30), seed: sweepSeed });
      return { seed: sweepSeed, metrics: metricsFrom(swept.overall) };
    }),
  };
}

/* ------------------------------------------------------------------ *
 * 2. Agreement on real data
 * ------------------------------------------------------------------ */

/**
 * How often do the two real sources agree, and is that more than chance?
 *
 * Every field here is named "agreement", never "accuracy". `medicineOnly` is not an
 * error — it is the output this whole system was built to produce.
 */
export function agreementMatrix(rows) {
  const cells = { bothAgree: 0, ashaOnly: 0, medicineOnly: 0 };

  for (const row of rows) {
    if (row.status === "CONFIRMED") cells.bothAgree += 1;
    else if (row.status === "ASHA_ONLY") cells.ashaOnly += 1;
    else if (row.status === "MEDICINE_ONLY") cells.medicineOnly += 1;
  }

  const total = cells.bothAgree + cells.ashaOnly + cells.medicineOnly;

  // Cohen's kappa over the observed disease rows: both-positive vs one-sided. With no
  // "neither" cell (rows only exist when a source fired) this is a lower bound, and is
  // reported as such rather than dressed up.
  const observedAgreement = total > 0 ? cells.bothAgree / total : null;

  const ashaPositive = (cells.bothAgree + cells.ashaOnly) / (total || 1);
  const medicinePositive = (cells.bothAgree + cells.medicineOnly) / (total || 1);
  const chanceAgreement = ashaPositive * medicinePositive;
  const kappa =
    total > 0 && chanceAgreement < 1
      ? Number(((observedAgreement - chanceAgreement) / (1 - chanceAgreement)).toFixed(3))
      : null;

  const magnitude = { aligned: 0, ashaHeavy: 0, medicineHeavy: 0, singleSource: 0 };
  for (const row of rows) {
    if (row.magnitudeAgreement === "ALIGNED") magnitude.aligned += 1;
    else if (row.magnitudeAgreement === "ASHA_HEAVY") magnitude.ashaHeavy += 1;
    else if (row.magnitudeAgreement === "MEDICINE_HEAVY") magnitude.medicineHeavy += 1;
    else magnitude.singleSource += 1;
  }

  return {
    kind: "SOURCE_AGREEMENT",
    cells,
    total,
    observedAgreement: observedAgreement === null ? null : Number(observedAgreement.toFixed(3)),
    kappa,
    magnitude,
    caveat:
      "Ye agreement hai, accuracy nahi. Yahan koi source 'sach' nahi hai — MEDICINE_ONLY galti nahi, wahi to system ka asli output hai (under-reporting pakadna).",
  };
}

/* ------------------------------------------------------------------ *
 * 3. Backtest
 * ------------------------------------------------------------------ */

/** Minimum history before a backtest number means anything at all. */
export const BACKTEST_REQUIREMENTS = {
  distinctDays: 21,
  medicineEvents: 100,
  reports: 60,
};

/**
 * Predict on day T, score against what was reported on T+2.
 *
 * Returns INSUFFICIENT_DATA — with the exact shortfall — rather than a number derived
 * from a handful of rows. A made-up accuracy figure on a health dashboard is worse than
 * no figure, because somebody will act on it.
 */
export function backtest({ reports = [], medicineEvents = [], horizonDays = 2 } = {}) {
  const days = new Set();
  for (const report of reports) {
    days.add(new Date(report.reportDate || report.createdAt).toISOString().slice(0, 10));
  }

  const have = {
    distinctDays: days.size,
    medicineEvents: medicineEvents.length,
    reports: reports.length,
  };

  const shortfall = Object.entries(BACKTEST_REQUIREMENTS)
    .filter(([key, need]) => have[key] < need)
    .map(([key, need]) => ({ metric: key, need, have: have[key] }));

  if (shortfall.length) {
    return {
      kind: "BACKTEST",
      status: "INSUFFICIENT_DATA",
      horizonDays,
      have,
      need: BACKTEST_REQUIREMENTS,
      shortfall,
      message:
        "Backtest ke liye abhi itna data nahi hai. Jab tak itihaas nahi banta, koi bhi accuracy number banawati hoga — isliye yahan number nahi dikhaya ja raha.",
    };
  }

  // Enough history: score each day's flag against the caseload that followed.
  const casesByDay = new Map();
  for (const report of reports) {
    const key = new Date(report.reportDate || report.createdAt).toISOString().slice(0, 10);
    casesByDay.set(key, (casesByDay.get(key) || 0) + (Number(report.newCases) || 0));
  }

  const sortedDays = [...casesByDay.keys()].sort();
  const values = sortedDays.map((day) => casesByDay.get(day));
  const average = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
  // "A real surge" = a day at least half again as busy as the period's average.
  const surgeThreshold = average * 1.5;

  const matrix = emptyMatrix();

  for (let index = 0; index < sortedDays.length - horizonDays; index += 1) {
    const day = sortedDays[index];
    const futureDay = sortedDays[index + horizonDays];

    const medicineThatDay = medicineEvents.filter((event) => {
      const stamp = new Date(event.pickedUpAt || event.occurredAt || event.createdAt)
        .toISOString()
        .slice(0, 10);
      return stamp === day;
    });

    const flagged = medicineThatDay.length > 0 && casesByDay.get(day) >= surgeThreshold;
    const actuallySurged = casesByDay.get(futureDay) >= surgeThreshold;

    if (actuallySurged && flagged) matrix.truePositive += 1;
    else if (actuallySurged) matrix.falseNegative += 1;
    else if (flagged) matrix.falsePositive += 1;
    else matrix.trueNegative += 1;
  }

  return {
    kind: "BACKTEST",
    status: "OK",
    horizonDays,
    have,
    matrix,
    metrics: metricsFrom(matrix),
    surgeThreshold: Number(surgeThreshold.toFixed(2)),
  };
}
