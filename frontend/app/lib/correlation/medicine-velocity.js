/**
 * How fast each medicine is moving, and what that says about disease risk.
 *
 * The dashboard could already say "risk score 93, 84% outbreak probability" — a number
 * with no way to argue with it. This module builds the chain underneath it:
 *
 *     kitni tez biki  ->  wo dawai kis liye hai  ->  kis bimari ka ishara  ->  kitna risk
 *
 * The whole thing turns on one distinction: **how specific a medicine is**. Paracetamol
 * doubling means almost nothing — it is given for every fever there is, and the catalog
 * says so in its own description. A papaya-leaf extract doubling means dengue, because
 * nobody buys it for anything else. A risk model that treats those two jumps alike will
 * send health workers chasing flu seasons, so specificity is weighted everywhere here:
 * in the score, in the ranking, and in the sentence the admin reads.
 */
import { translatorFor } from "@/app/lib/i18n/locale";

/** Units of a medicine that count as roughly one patient's course. */
const UNITS_PER_PATIENT = 10;

/** A medicine this specific to one disease is treated as near-diagnostic. */
const HIGHLY_SPECIFIC = 0.7;
/** Below this, a medicine is broad-spectrum: it points at half the catalog. */
const BROAD_SPECTRUM = 0.4;

/** Recent movement below this is too small to read a trend from. */
const MIN_RECENT_UNITS = 3;

function unitsOf(event) {
  return event.quantity !== undefined
    ? Number(event.quantity) || 0
    : Math.abs(Number(event.delta) || 0);
}

function dateOf(event) {
  return new Date(event.pickedUpAt || event.occurredAt || event.createdAt);
}

/**
 * Week-over-week movement per medicine.
 *
 * @param {Array} events      picked-up orders and counter sales, mixed
 * @param {object} options
 * @param {number} options.windowDays  length of each half of the comparison
 * @param {Date}   options.asOf        end of the recent window (defaults to now)
 * @returns {Array} one row per SKU, newest-volume first
 */
export function medicineVelocity(events, { windowDays = 7, asOf = new Date() } = {}) {
  const recentStart = new Date(asOf);
  recentStart.setDate(recentStart.getDate() - windowDays);
  const baselineStart = new Date(recentStart);
  baselineStart.setDate(baselineStart.getDate() - windowDays);

  const bySku = new Map();

  for (const event of events) {
    const sku = event.sku;
    if (!sku) continue;

    const when = dateOf(event);
    const units = unitsOf(event);
    if (units <= 0) continue;

    if (!bySku.has(sku)) {
      bySku.set(sku, {
        sku,
        brand: event.brand || sku,
        recentUnits: 0,
        baselineUnits: 0,
        diseaseSignals: event.diseaseSignals || [],
      });
    }

    const row = bySku.get(sku);
    if (when >= recentStart && when <= asOf) row.recentUnits += units;
    else if (when >= baselineStart && when < recentStart) row.baselineUnits += units;

    // Keep the richest signal list seen for this SKU — an older event may predate a
    // catalog retune and carry fewer entries.
    if ((event.diseaseSignals || []).length > row.diseaseSignals.length) {
      row.diseaseSignals = event.diseaseSignals;
    }
  }

  return [...bySku.values()]
    .map((row) => {
      const peakWeight = Math.max(
        0,
        ...row.diseaseSignals.map((signal) => Number(signal.weight) || 0)
      );

      // A jump from nothing has no percentage — reporting it as +Infinity or +100% both
      // lie. It is flagged as new movement and judged on volume instead.
      const isNew = row.baselineUnits === 0 && row.recentUnits > 0;
      const changePercent = isNew
        ? null
        : row.baselineUnits > 0
          ? Number((((row.recentUnits - row.baselineUnits) / row.baselineUnits) * 100).toFixed(1))
          : 0;

      return {
        ...row,
        peakWeight: Number(peakWeight.toFixed(2)),
        specificity:
          peakWeight >= HIGHLY_SPECIFIC
            ? "SPECIFIC"
            : peakWeight >= BROAD_SPECTRUM
              ? "MODERATE"
              : "BROAD",
        isNew,
        changePercent,
        patientEquivalents: Number((row.recentUnits / UNITS_PER_PATIENT).toFixed(2)),
        // Too little movement to read anything into, however dramatic the percentage.
        isReadable: row.recentUnits >= MIN_RECENT_UNITS,
      };
    })
    .sort((left, right) => right.recentUnits - left.recentUnits);
}

/* ------------------------------------------------------------------ *
 * Velocity -> disease risk
 * ------------------------------------------------------------------ */

/**
 * The four things that make medicine movement worth acting on, and what each is worth.
 *
 * Written as explicit points rather than a fitted model because there is no training
 * data to fit against — and a score whose parts an admin can read ("40 for volume, 20
 * because a dengue-specific product is moving") can be argued with, which a single
 * opaque probability cannot. It is deliberately NOT called a probability: it is not one.
 */
const POINTS = {
  /** Sheer volume of medicine pointing at this disease. 5 patient-equivalents maxes it. */
  demandMax: 40,
  demandPerPatientEquivalent: 8,
  /** Acceleration against last week. +300% maxes it. */
  growthMax: 30,
  growthPerPercent: 0.1,
  /** A medicine that means only this disease. */
  specific: 20,
  moderate: 10,
  /** Field reports saying the same thing. */
  ashaAgreement: 10,
};

const BAND_HIGH = 65;
const BAND_MEDIUM = 35;

function bandFor(score) {
  if (score >= BAND_HIGH) return "HIGH";
  if (score >= BAND_MEDIUM) return "MEDIUM";
  return "LOW";
}

/**
 * Rolls medicine velocity up into a per-disease signal.
 *
 * @param {Array} velocities            output of {@link medicineVelocity}
 * @param {Map<string, number>} ashaCasesByDisease  what the field reported, for agreement
 * @returns {Array} one row per disease, strongest first
 */
export function diseaseRiskFromVelocity(velocities, ashaCasesByDisease = new Map()) {
  const byDisease = new Map();

  for (const row of velocities) {
    if (!row.isReadable) continue;

    for (const signal of row.diseaseSignals || []) {
      const weight = Number(signal.weight) || 0;
      if (weight <= 0) continue;

      if (!byDisease.has(signal.disease)) {
        byDisease.set(signal.disease, {
          disease: signal.disease,
          patientEquivalents: 0,
          peakWeight: 0,
          contributors: [],
          growthNumerator: 0,
          growthDenominator: 0,
        });
      }

      const entry = byDisease.get(signal.disease);
      const contribution = row.patientEquivalents * weight;

      entry.patientEquivalents += contribution;
      entry.peakWeight = Math.max(entry.peakWeight, weight);
      entry.contributors.push({
        sku: row.sku,
        brand: row.brand,
        weight,
        recentUnits: row.recentUnits,
        baselineUnits: row.baselineUnits,
        changePercent: row.changePercent,
        isNew: row.isNew,
        specificity: row.specificity,
        contribution: Number(contribution.toFixed(2)),
      });

      // Growth averaged across medicines, weighted by how much each contributes — so a
      // big jump in a bit-part medicine cannot drag the whole disease's score up.
      if (row.changePercent !== null) {
        entry.growthNumerator += row.changePercent * contribution;
        entry.growthDenominator += contribution;
      }
    }
  }

  const rows = [];

  for (const entry of byDisease.values()) {
    const patientEquivalents = Number(entry.patientEquivalents.toFixed(2));
    const growthPercent =
      entry.growthDenominator > 0
        ? Number((entry.growthNumerator / entry.growthDenominator).toFixed(1))
        : null;

    const demandPoints = Math.min(
      POINTS.demandMax,
      patientEquivalents * POINTS.demandPerPatientEquivalent
    );
    const growthPoints =
      growthPercent === null
        ? 0
        : Math.min(POINTS.growthMax, Math.max(0, growthPercent) * POINTS.growthPerPercent);
    const specificityPoints =
      entry.peakWeight >= HIGHLY_SPECIFIC
        ? POINTS.specific
        : entry.peakWeight >= BROAD_SPECTRUM
          ? POINTS.moderate
          : 0;

    const ashaCases = ashaCasesByDisease.get(entry.disease) || 0;
    const ashaPoints = ashaCases > 0 ? POINTS.ashaAgreement : 0;

    const score = Math.min(
      100,
      Math.round(demandPoints + growthPoints + specificityPoints + ashaPoints)
    );

    const contributors = entry.contributors
      .sort((left, right) => right.contribution - left.contribution)
      .slice(0, 5);

    rows.push({
      disease: entry.disease,
      score,
      band: bandFor(score),
      patientEquivalents,
      growthPercent,
      peakWeight: Number(entry.peakWeight.toFixed(2)),
      ashaCases,
      breakdown: {
        demand: Math.round(demandPoints),
        growth: Math.round(growthPoints),
        specificity: specificityPoints,
        ashaAgreement: ashaPoints,
      },
      contributors,
    });
  }

  return rows.sort((left, right) => right.score - left.score);
}

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

function movementPhrase(row, locale) {
  const t = translatorFor(locale);
  if (row.isNew) {
    return t(
      `${row.recentUnits} units sold, none at all last week`,
      `${row.recentUnits} unit biki, pichhle hafte ek bhi nahi`
    );
  }
  if (row.changePercent === null) {
    return t(`${row.recentUnits} units sold`, `${row.recentUnits} unit biki`);
  }
  if (row.changePercent > 0) {
    return t(
      `+${row.changePercent}% (${row.baselineUnits} to ${row.recentUnits} units)`,
      `+${row.changePercent}% (${row.baselineUnits} se ${row.recentUnits} unit)`
    );
  }
  if (row.changePercent < 0) {
    return t(
      `${row.changePercent}% (${row.baselineUnits} to ${row.recentUnits} units)`,
      `${row.changePercent}% (${row.baselineUnits} se ${row.recentUnits} unit)`
    );
  }
  return t(`${row.recentUnits} units, no change`, `${row.recentUnits} unit, koi badlaav nahi`);
}

/**
 * One medicine explained: how fast it moved, what it is for, and — the part that
 * matters — whether a jump in *this* medicine actually means anything.
 *
 * @param {object} row       a velocity row
 * @param {object} catalog   the catalog entry, for its description
 */
export function explainMedicine(row, catalog, locale) {
  const t = translatorFor(locale);
  const lines = [`${row.brand}: ${movementPhrase(row, locale)}.`];

  if (catalog?.description) lines.push(catalog.description);

  if (row.specificity === "SPECIFIC") {
    const target = (row.diseaseSignals || []).reduce(
      (best, signal) => ((signal.weight || 0) > (best?.weight || 0) ? signal : best),
      null
    );
    lines.push(
      t(
        `This medicine is used almost only for ${target?.disease || "a single illness"}, so a jump in it is a direct signal.`,
        `Ye dawai lagbhag sirf ${target?.disease || "ek hi bimari"} me chalti hai, isliye iski tezi seedha ishara hai.`
      )
    );
  } else if (row.specificity === "BROAD") {
    lines.push(
      t(
        `It is used for ${(row.diseaseSignals || []).length} illnesses, so a jump in it alone settles nothing — it needs a specific medicine alongside.`,
        `Ye ${(row.diseaseSignals || []).length} bimariyon me chalti hai, isliye akele iski tezi se kuch pakka nahi hota — kisi specific dawai ka saath chahiye.`
      )
    );
  } else {
    lines.push(
      t(
        "It is used for only a few illnesses — a signal, but not proof on its own.",
        "Ye kuch hi bimariyon me chalti hai — ishara hai, par akela sabooot nahi."
      )
    );
  }

  if (!row.isReadable) {
    lines.push(
      t(
        `Only ${row.recentUnits} units — a percentage misleads at that volume, so this was left out of the count.`,
        `Sirf ${row.recentUnits} unit — itni kam bikri par percentage bhramak hota hai, isliye ise ginti me nahi liya gaya.`
      )
    );
  }

  return lines.join(" ");
}

/** Why this disease scored what it did, in the order the points were added. */
export function explainDiseaseRisk(risk, locale) {
  const t = translatorFor(locale);
  const specific = risk.contributors.filter((row) => row.specificity === "SPECIFIC");
  const broad = risk.contributors.filter((row) => row.specificity === "BROAD");

  const lines = [];

  if (specific.length) {
    const named = specific.map((row) => `${row.brand} (${movementPhrase(row, locale)})`).join(", ");
    lines.push(
      t(
        `${named} — ${specific.length > 1 ? "these medicines are" : "this medicine is"} specific to ${risk.disease}.`,
        `${named} — ye ${specific.length > 1 ? "dawaiyan" : "dawai"} khaas ${risk.disease} ke liye hai.`
      )
    );
  }
  if (broad.length) {
    const named = broad.map((row) => `${row.brand} (${movementPhrase(row, locale)})`).join(", ");
    lines.push(
      t(
        `Broad-spectrum medicine is moving too: ${named}.`,
        `Saath me aam dawaiyan bhi chal rahi hain: ${named}.`
      )
    );
  }

  if (specific.length && broad.length) {
    lines.push(
      t(
        "A specific medicine and a broad one accelerating together — that is the pattern a real outbreak makes.",
        "Ek specific dawai aur aam dawai dono ka ek saath tez hona — asli outbreak ka yehi pattern hota hai."
      )
    );
  } else if (!specific.length && broad.length) {
    lines.push(
      t(
        "Only broad-spectrum medicine rose, nothing specific. This could equally be a seasonal fever — so the score was deliberately held down.",
        "Sirf aam dawaiyan tez hui hain, koi specific dawai nahi. Ye mausami bukhar bhi ho sakta hai — isliye score jaan boojh kar neeche rakha gaya."
      )
    );
  }

  lines.push(
    risk.ashaAgreement
      ? t(
          "ASHA reports back this up, so the score was raised.",
          "ASHA ki report bhi iska saath deti hai, isliye score badhaya gaya."
        )
      : t(
          "No ASHA report has come in — if medicine is moving, this area deserves a survey.",
          "ASHA ki koi report nahi aayi — agar dawai chal rahi hai to yahan survey karwana chahiye."
        )
  );

  lines.push(
    t(
      `Score ${risk.score}/100 = ${risk.breakdown.demand} (how much medicine) + ${risk.breakdown.growth} (how fast) + ${risk.breakdown.specificity} (how specific) + ${risk.breakdown.ashaAgreement} (ASHA agreement). This is not a probability — it is a sum of evidence.`,
      `Score ${risk.score}/100 = ${risk.breakdown.demand} (kitni dawai) + ${risk.breakdown.growth} (kitni tezi) + ${risk.breakdown.specificity} (kitni khaas) + ${risk.breakdown.ashaAgreement} (ASHA ka saath). Ye probability nahi hai — sabooot ka jod hai.`
    )
  );

  return lines.join(" ");
}

/** The map's answer to "ye area laal kyun hai?", in medicine terms. */
export function explainZoneReason(village, risks, locale) {
  const t = translatorFor(locale);
  const top = risks[0];
  if (!top || top.band === "LOW") {
    return t(
      `${village}: no medicine is moving fast enough to point clearly at any illness.`,
      `${village}: koi dawai itni tez nahi bik rahi ki kisi bimari ka pakka ishara mile.`
    );
  }

  const drivers = top.contributors
    .slice(0, 2)
    .map((row) => `${row.brand} ${movementPhrase(row, locale)}`)
    .join(t(" and ", " aur "));

  return t(
    `${village} shows a ${top.band} signal for ${top.disease} — because: ${drivers}.`,
    `${village} par ${top.disease} ka ishara ${top.band} hai — wajah: ${drivers}.`
  );
}
