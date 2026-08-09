/**
 * Turns medicine movement into a per-disease demand signal, then compares it against
 * what ASHA workers reported for the same area.
 *
 * Why this is worth doing: an ASHA can only report the houses she visits, and a sick
 * person who never gets visited is invisible. But that person still walks into a
 * medical shop. So the sources fail in different directions, and the interesting
 * information is in where they disagree:
 *
 *   CONFIRMED       field reports AND medicine      -> highest confidence, act on it
 *   ASHA_ONLY       field reports, no medicine      -> may be early, or over-reported
 *   MEDICINE_ONLY   medicine moving, no reports     -> likely UNDER-REPORTING, investigate
 *
 * There are three independent sources, not two:
 *
 *   1. ASHA field reports          — households actually visited
 *   2. JanSetu pickups             — booked in the app, collected with a code
 *   3. Over-the-counter sales      — the shop's own shelf dropping with no booking
 *
 * (2) and (3) are kept apart on purpose. A pickup already decrements the shelf, so
 * folding both into one number would count the same strip of tablets twice and let a
 * single sale masquerade as agreement between two sources.
 *
 * A medicine only contributes as strongly as its `weight` says. Paracetamol moving does
 * not mean dengue; the papaya-leaf extract or an ACT kit moving very nearly does.
 */

/** Units of a medicine that count as roughly one patient's course. */
const UNITS_PER_PATIENT = 10;

/**
 * Weighted demand below one patient-equivalent is treated as background noise.
 * Broad-use medicines carry small weights against many diseases, so without this
 * floor a single fever purchase would register a faint signal for malaria, influenza
 * and four other things at once.
 */
const MIN_MEDICINE_DEMAND = 1;

/**
 * Evidence needed before volume stops holding confidence down. Roughly "twenty
 * patients' worth of signal, from any mix of sources" — below that we are reading tea
 * leaves and the score should say so.
 */
const FULL_EVIDENCE = 20;

/** A medicine total this many times the reported caseload counts as disagreement. */
const MAGNITUDE_TOLERANCE = 2;

/**
 * MEDICINE_ONLY sends a health worker into a village to survey it. That costs a real
 * day of a real person's time, so it is held to a stricter bar than the other statuses:
 * twice the demand, AND at least one medicine that genuinely points at this disease.
 *
 * The second condition is the important one. Demand is a weighted sum, so ten different
 * broad-spectrum medicines each contributing 0.1 to DENGUE add up to 1.0 and cleared the
 * old floor — an "under-reporting, go survey this village" alert raised by nothing but
 * paracetamol. Validation caught this precisely: on borderline noise the engine raised
 * false alarms 53 times out of 60, specificity 0.56. Requiring one specific medicine
 * costs nothing on real clusters, where a dengue-specific product is always moving too.
 */
const MEDICINE_ONLY_MIN_DEMAND = 2;
const MEDICINE_ONLY_MIN_WEIGHT = 0.4;
/** However specific the medicine, this much demand is always required. */
const MEDICINE_ONLY_FLOOR_DEMAND = 1;

/**
 * How much demand a medicine-only survey alert needs, given how specific the strongest
 * medicine behind it is.
 *
 * A flat "two patients' worth" bar was too blunt in both directions. It let nothing
 * through on noise (good) but also swallowed small real clusters: validation showed 23
 * genuine under-reported outbreaks missed at 1.8 patient-equivalents — with a
 * dengue-specific product moving. A papaya-leaf extract selling is worth acting on
 * sooner than twice as much paracetamol, so the bar drops as specificity rises, and
 * never below the floor.
 */
function requiredDemandFor(peakWeight) {
  if (peakWeight < MEDICINE_ONLY_MIN_WEIGHT) return Infinity;
  const scaled = MEDICINE_ONLY_MIN_DEMAND * (MEDICINE_ONLY_MIN_WEIGHT / peakWeight);
  return Math.max(MEDICINE_ONLY_FLOOR_DEMAND, scaled);
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function startOfWindow(days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function addWeighted(demand, signals, patientEquivalents) {
  for (const signal of signals || []) {
    const weighted = patientEquivalents * (Number(signal.weight) || 0);
    if (weighted <= 0) continue;
    demand.set(signal.disease, (demand.get(signal.disease) || 0) + weighted);
  }
}

/**
 * Weighted disease demand from confirmed pickups.
 *
 * @param {Array} orders  PICKED_UP MedicineOrder docs with `diseaseSignals` and `quantity`.
 * @returns {Map<string, number>} disease code -> weighted patient-equivalents
 */
export function diseaseDemandFromOrders(orders) {
  const demand = new Map();

  for (const order of orders) {
    const patientEquivalents = (Number(order.quantity) || 0) / UNITS_PER_PATIENT;
    if (patientEquivalents <= 0) continue;
    addWeighted(demand, order.diseaseSignals, patientEquivalents);
  }

  return demand;
}

/**
 * Weighted disease demand from over-the-counter sales.
 *
 * Only COUNTER_SALE rows are read. PICKUP rows describe the very same tablets as
 * {@link diseaseDemandFromOrders}, and counting them here would turn one sale into two
 * agreeing sources — the exact false confidence this split exists to prevent.
 *
 * @param {Array} movements  StockMovement docs.
 * @returns {Map<string, number>} disease code -> weighted patient-equivalents
 */
export function diseaseDemandFromMovements(movements) {
  const demand = new Map();

  for (const movement of movements) {
    if (movement.reason !== "COUNTER_SALE") continue;
    const unitsOut = Math.abs(Number(movement.delta) || 0);
    const patientEquivalents = unitsOut / UNITS_PER_PATIENT;
    if (patientEquivalents <= 0) continue;
    addWeighted(demand, movement.diseaseSignals, patientEquivalents);
  }

  return demand;
}

/**
 * The strongest single link any one medicine makes to each disease.
 *
 * Demand alone cannot distinguish "one dengue-specific product moved" from "a lot of
 * paracetamol moved", because both are just a weighted sum. This keeps the peak weight
 * so the engine can require a *specific* medicine before raising a survey alert.
 *
 * @param {Array} events  orders and/or stock movements
 * @returns {Map<string, number>} disease code -> highest signal weight seen
 */
export function diseaseSpecificity(events) {
  const peak = new Map();

  for (const event of events) {
    const units =
      event.quantity !== undefined ? Number(event.quantity) || 0 : Math.abs(Number(event.delta) || 0);
    if (units <= 0) continue;

    for (const signal of event.diseaseSignals || []) {
      const weight = Number(signal.weight) || 0;
      if (weight > (peak.get(signal.disease) || 0)) peak.set(signal.disease, weight);
    }
  }

  return peak;
}

/**
 * Daily weighted demand series for one disease, oldest first, gaps filled with 0.
 * Used to detect a spike rather than just a high total.
 *
 * Accepts orders and stock movements together: `quantity`/`pickedUpAt` for the first,
 * `delta`/`occurredAt` for the second.
 */
export function dailyDemandSeries(events, disease, days) {
  const totals = new Map();

  for (const event of events) {
    const signal = (event.diseaseSignals || []).find((entry) => entry.disease === disease);
    if (!signal) continue;

    const units =
      event.quantity !== undefined ? Number(event.quantity) || 0 : Math.abs(Number(event.delta) || 0);
    const weighted = (units / UNITS_PER_PATIENT) * (Number(signal.weight) || 0);
    if (weighted <= 0) continue;

    const key = dayKey(event.pickedUpAt || event.occurredAt || event.createdAt);
    totals.set(key, (totals.get(key) || 0) + weighted);
  }

  const series = [];
  const cursor = startOfWindow(days);
  for (let index = 0; index < days; index += 1) {
    series.push(Number((totals.get(dayKey(cursor)) || 0).toFixed(2)));
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
}

/**
 * Spike strength: how much the recent window exceeds the earlier baseline.
 * Returns a 0..1 score plus the raw percentage, so the UI can show "+180%".
 */
export function spikeStrength(series, recentDays = 3) {
  if (series.length <= recentDays) return { score: 0, growthPercent: 0 };

  const recent = series.slice(-recentDays);
  const baseline = series.slice(0, -recentDays);

  const recentAvg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const baselineAvg = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;

  if (baselineAvg <= 0) {
    // No history to compare against: treat any real movement as a moderate spike
    // rather than an infinite one.
    return { score: recentAvg > 0 ? 0.5 : 0, growthPercent: recentAvg > 0 ? 100 : 0 };
  }

  const growthPercent = ((recentAvg - baselineAvg) / baselineAvg) * 100;
  // 100% growth maps to ~0.5, 300% saturates near 1.
  const score = Math.max(0, Math.min(1, growthPercent / 300));

  return { score: Number(score.toFixed(3)), growthPercent: Number(growthPercent.toFixed(1)) };
}

/**
 * Do the two sides agree on *how big* this is, not merely that it exists?
 *
 * Presence agreement alone was the engine's weakest point: 74 reported cases backed by
 * 1.9 patient-equivalents of medicine scored exactly the same "both sources agree,
 * confidence 0.9" as five cases backed by five. A 39x gap is not agreement — it means
 * one of the two sides is badly off, and the admin needs to be told which.
 */
function magnitudeAgreement(ashaCases, medicineTotal) {
  if (ashaCases <= 0 || medicineTotal <= 0) {
    return { label: "SINGLE_SOURCE", ratio: null };
  }

  const ratio = medicineTotal / ashaCases;
  if (ratio > MAGNITUDE_TOLERANCE) return { label: "MEDICINE_HEAVY", ratio };
  if (ratio < 1 / MAGNITUDE_TOLERANCE) return { label: "ASHA_HEAVY", ratio };
  return { label: "ALIGNED", ratio };
}

/**
 * Confidence from the evidence, not from a lookup table.
 *
 * The old version returned a hardcoded 0.9 / 0.6 / 0.5 by status, so one twenty-unit
 * purchase carried the same weight as a hundred, and nothing an admin did could tell a
 * thin signal from a thick one. Three things move it now:
 *
 *   sources  — independent sources agreeing is the strongest evidence available
 *   volume   — a handful of data points cannot support a confident call
 *   magnitude— sources that disagree on scale are only partly agreeing
 */
function confidenceFor({ sourceCount, ashaCases, medicineTotal, agreement }) {
  const base = sourceCount >= 3 ? 0.78 : sourceCount === 2 ? 0.6 : 0.35;

  const evidence = ashaCases + medicineTotal;
  const volumeFactor = 0.6 + 0.4 * Math.min(1, evidence / FULL_EVIDENCE);

  const agreementFactor =
    agreement.label === "ALIGNED"
      ? 1
      : agreement.label === "MEDICINE_HEAVY"
        ? 0.85
        : agreement.label === "ASHA_HEAVY"
          ? 0.8
          : 1;

  const score = base * volumeFactor * agreementFactor;
  return Number(Math.max(0.1, Math.min(0.95, score)).toFixed(2));
}

/** Plain-language account of how this row was decided, built from the same numbers. */
function reasoningFor({ status, disease, ashaCases, orderDemand, counterDemand, agreement, confidence }) {
  const lines = [];
  const medicineTotal = orderDemand + counterDemand;

  const evidence = [];
  if (ashaCases > 0) evidence.push(`ASHA ne ${ashaCases} case report kiye`);
  if (orderDemand > 0) evidence.push(`JanSetu pickup se ${orderDemand.toFixed(2)} patient-equivalent dawai gayi`);
  if (counterDemand > 0)
    evidence.push(`counter par ${counterDemand.toFixed(2)} patient-equivalent dawai bini`);
  lines.push(`Evidence: ${evidence.join(", ")}.`);

  if (status === "CONFIRMED") {
    lines.push(
      "Do alag-alag source ek hi bimari par ishara kar rahe hain — field report aur asli dawai ki bikri. Ye sabse mazboot sabooot hai."
    );
  } else if (status === "MEDICINE_ONLY") {
    lines.push(
      `Dawai chal rahi hai par is area se ${disease} ki koi ASHA report nahi aayi. Iska matlab aksar under-reporting hota hai — log bimaar hain par survey me nahi aa rahe.`
    );
  } else {
    lines.push(
      "ASHA ne case bataye hain par utni dawai nahi bik rahi. Ya to abhi bahut naya hai, ya log dawai kahin aur se le rahe hain, ya report me count zyada ho gaya."
    );
  }

  if (agreement.label === "ASHA_HEAVY") {
    lines.push(
      `Dhyan dijiye: ${ashaCases} case ke hisaab se sirf ${medicineTotal.toFixed(2)} patient-equivalent dawai movement hai — lagbhag ${Math.round(ashaCases / Math.max(medicineTotal, 0.01))}x ka farq. Dono aankde ek doosre se mel nahi kha rahe, isliye confidence ghata di gayi.`
    );
  } else if (agreement.label === "MEDICINE_HEAVY") {
    lines.push(
      `Dhyan dijiye: dawai ki demand (${medicineTotal.toFixed(2)}) report kiye gaye ${ashaCases} case se ${agreement.ratio.toFixed(1)}x zyada hai. Report kiye gaye case shayad poori tasveer nahi hain.`
    );
  } else if (agreement.label === "ALIGNED") {
    lines.push(
      `Dono aankde paimane par bhi mel khate hain (${medicineTotal.toFixed(2)} patient-equivalent vs ${ashaCases} case), isliye confidence poori rakhi gayi.`
    );
  }

  lines.push(
    `Confidence ${confidence} — source ki ginti, evidence ki maatra aur dono aankdon ke mel, teeno se banaya gaya.`
  );

  return lines.join(" ");
}

/**
 * Cross-checks field reports against medicine demand, per disease.
 *
 * @param {Map<string, number>} ashaCasesByDisease  disease -> reported new cases
 * @param {Map<string, number>} orderDemand         disease -> patient-equivalents from pickups
 * @param {Map<string, number>} counterDemand       disease -> patient-equivalents from OTC sales
 * @returns {Array} one row per disease seen by any source
 */
export function correlateSignals(
  ashaCasesByDisease,
  orderDemand,
  counterDemand = new Map(),
  specificity = new Map()
) {
  const diseases = new Set([
    ...ashaCasesByDisease.keys(),
    ...orderDemand.keys(),
    ...counterDemand.keys(),
  ]);
  const rows = [];

  for (const disease of diseases) {
    const ashaCases = ashaCasesByDisease.get(disease) || 0;
    const fromOrders = Number((orderDemand.get(disease) || 0).toFixed(2));
    const fromCounter = Number((counterDemand.get(disease) || 0).toFixed(2));
    const medicineTotal = Number((fromOrders + fromCounter).toFixed(2));

    // Demand below this is background noise — a couple of strips of Paracetamol.
    const hasOrderSignal = fromOrders >= MIN_MEDICINE_DEMAND;
    const hasCounterSignal = fromCounter >= MIN_MEDICINE_DEMAND;
    const hasMedicineSignal = hasOrderSignal || hasCounterSignal || medicineTotal >= MIN_MEDICINE_DEMAND;
    const hasAshaSignal = ashaCases >= 1;

    // A disease can land in the demand map from a weak side-signal alone: ten
    // Paracetamol strips put 0.15 patient-equivalents against MALARIA. Reporting that
    // as MEDICINE_ONLY would raise an "under-reporting, go survey this village" alert
    // off one person's fever tablets. If no source clears its floor, this disease has
    // no evidence in this area and does not belong in the output at all.
    if (!hasAshaSignal && !hasMedicineSignal) continue;

    // Raising a survey alert off medicine alone needs a specific medicine behind it,
    // not an accumulation of broad-spectrum trace weights.
    const peakWeight = specificity.get(disease) ?? 1;
    const canRaiseSurveyAlert = medicineTotal >= requiredDemandFor(peakWeight);

    if (!hasAshaSignal && !canRaiseSurveyAlert) continue;

    const sourceCount =
      (hasAshaSignal ? 1 : 0) + (hasOrderSignal ? 1 : 0) + (hasCounterSignal ? 1 : 0);
    const agreement = magnitudeAgreement(ashaCases, medicineTotal);

    const status = hasAshaSignal
      ? hasMedicineSignal
        ? "CONFIRMED"
        : "ASHA_ONLY"
      : "MEDICINE_ONLY";

    const confidence = confidenceFor({ sourceCount, ashaCases, medicineTotal, agreement });

    rows.push({
      disease,
      ashaCases,
      medicineDemand: medicineTotal,
      orderDemand: fromOrders,
      counterDemand: fromCounter,
      sources: {
        asha: hasAshaSignal,
        pickups: hasOrderSignal,
        counter: hasCounterSignal,
      },
      sourceCount,
      magnitudeAgreement: agreement.label,
      magnitudeRatio: agreement.ratio === null ? null : Number(agreement.ratio.toFixed(2)),
      status,
      confidence,
      note: reasoningFor({
        status,
        disease,
        ashaCases,
        orderDemand: fromOrders,
        counterDemand: fromCounter,
        agreement,
        confidence,
      }),
    });
  }

  return rows.sort((left, right) => {
    const weight = { CONFIRMED: 3, MEDICINE_ONLY: 2, ASHA_ONLY: 1 };
    const byStatus = weight[right.status] - weight[left.status];
    if (byStatus !== 0) return byStatus;
    return right.ashaCases + right.medicineDemand - (left.ashaCases + left.medicineDemand);
  });
}

/**
 * Bonus added to the outbreak risk score from medicine evidence.
 * Capped so medicine data can strengthen a case but never manufacture one on its own.
 */
export function medicineRiskContribution(correlationRows) {
  let contribution = 0;

  for (const row of correlationRows) {
    // Scaled by confidence, so a thin or self-contradictory signal moves the score
    // less than a thick consistent one.
    const weight = row.confidence ?? 0.6;

    if (row.status === "CONFIRMED") {
      contribution += Math.min(10, row.medicineDemand * 1.5) * weight;
    } else if (row.status === "MEDICINE_ONLY") {
      // Worth flagging, but a single unverified source should not dominate the score.
      contribution += Math.min(5, row.medicineDemand) * weight;
    }
  }

  return Number(Math.min(18, contribution).toFixed(2));
}
