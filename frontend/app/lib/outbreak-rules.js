/**
 * Outbreak risk scoring — JS port of the retired Python `ai/services/rules_engine.py`.
 *
 * The Python service scored against fabricated environmental inputs (the client
 * hard-coded temperature 30 / humidity 60 / rainfall 10 / density 1000 on every
 * call), which added a constant ~13 point bias to every area. Those terms are gone.
 * Scoring is now driven only by data we actually hold: case counts, growth trend,
 * anomaly vs. the area's own baseline, and medicine sales signal.
 */

const SYMPTOM_TO_DISEASES = {
  fever: ["Dengue", "Malaria", "Viral Fever", "Typhoid"],
  rash: ["Dengue", "Chikungunya", "Measles"],
  "joint pain": ["Chikungunya", "Dengue"],
  "body pain": ["Dengue", "Viral Fever"],
  cough: ["Influenza", "COVID-like Illness", "Viral Fever"],
  "sore throat": ["Influenza", "COVID-like Illness"],
  vomiting: ["Gastroenteritis", "Food Poisoning", "Typhoid"],
  diarrhea: ["Gastroenteritis", "Cholera", "Food Poisoning"],
  headache: ["Dengue", "Viral Fever", "Influenza"],
};

const MEDICINE_DISEASE_HINTS = [
  { match: "paracetamol", note: "Fever syndrome signal" },
  { match: "dolo", note: "Fever syndrome signal" },
  { match: "ors", note: "Dehydration/diarrhea signal" },
  { match: "azithromycin", note: "Respiratory infection signal" },
  { match: "iv fluid", note: "Severe dehydration signal" },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, item) => sum + (item - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function movingAverage(values, window) {
  if (!values.length) return 0;
  return mean(values.slice(-window));
}

function inferDiseasesFromSymptoms(symptoms) {
  const scores = new Map();

  for (const raw of symptoms) {
    const symptom = String(raw || "").trim().toLowerCase();
    const matches = SYMPTOM_TO_DISEASES[symptom];
    if (!matches?.length) continue;
    for (const disease of matches) {
      scores.set(disease, (scores.get(disease) || 0) + 1 / matches.length);
    }
  }

  const total = [...scores.values()].reduce((sum, item) => sum + item, 0) || 1;
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([disease, score]) => ({
      disease,
      score: roundTo(score, 3),
      probability: roundTo(score / total, 3),
    }));
}

function medicineSignalScore(medicineSales) {
  let signalScore = 0;
  const factors = [];

  for (const row of medicineSales) {
    const medicine = String(row?.medicine || "").trim().toLowerCase();
    const units = Number(row?.unitsSold) || 0;
    if (units <= 0) continue;

    const hint = MEDICINE_DISEASE_HINTS.find((entry) => medicine.includes(entry.match));
    if (!hint) continue;

    signalScore += Math.min(8, units / 30);
    factors.push(`${row.medicine || "Medicine"} sales rise (${hint.note})`);
  }

  return { signalScore, factors: factors.slice(0, 3) };
}

function buildMedicineDemand(medicineSales, probabilityNext3Days) {
  if (!medicineSales.length) {
    const baseline = Math.round(35 + probabilityNext3Days * 45);
    return [
      {
        medicine: "Paracetamol",
        expected_units_next_3_days: baseline,
        confidence: roundTo(clamp(0.55 + probabilityNext3Days * 0.3, 0, 1)),
      },
      {
        medicine: "ORS",
        expected_units_next_3_days: Math.round(baseline * 0.7),
        confidence: roundTo(clamp(0.5 + probabilityNext3Days * 0.28, 0, 1)),
      },
    ];
  }

  return medicineSales.slice(0, 6).map((sale) => {
    const units = Number(sale?.unitsSold) || 0;
    return {
      medicine: sale?.medicine || "Unknown",
      expected_units_next_3_days: Math.max(0, Math.round(units * (1 + probabilityNext3Days * 0.9))),
      confidence: roundTo(clamp(0.55 + units / 250, 0.35, 0.92)),
    };
  });
}

/**
 * @param {object} input
 * @param {number} input.cases            Total cases in the scoring window.
 * @param {number[]} input.historicalCases Daily case counts, oldest first.
 * @param {string[]} input.symptoms
 * @param {Array<{medicine: string, unitsSold: number}>} input.medicineSales
 */
export function applyOutbreakRules(input = {}) {
  const cases = Math.max(0, Number(input.cases) || 0);
  const historicalCases = (input.historicalCases || [])
    .map((item) => Number(item) || 0)
    .filter((item) => item >= 0);
  const symptoms = input.symptoms || [];
  const medicineSales = input.medicineSales || [];

  const contributingFactors = [];

  const latestAvg = movingAverage(historicalCases, 3);
  const previousAvg =
    historicalCases.length > 3 ? movingAverage(historicalCases.slice(0, -3), 3) : latestAvg;
  const growthPct = previousAvg > 0 ? ((latestAvg - previousAvg) / previousAvg) * 100 : 0;

  const historyMean = historicalCases.length ? mean(historicalCases) : cases;
  const historyStd = historicalCases.length ? stdDev(historicalCases) : 0;
  const isAnomaly = cases > historyMean + Math.max(6, 1.5 * historyStd);

  const inferredDiseases = inferDiseasesFromSymptoms(symptoms);
  const { signalScore: medicineSignal, factors: medicineFactors } = medicineSignalScore(medicineSales);

  if (cases >= 90) contributingFactors.push("High case count");
  else if (cases >= 45) contributingFactors.push("Moderate case count");

  if (growthPct >= 20) contributingFactors.push("Rapid growth trend detected");
  else if (growthPct >= 8) contributingFactors.push("Rising trend detected");

  if (isAnomaly) contributingFactors.push("Abnormal increase above historical baseline");

  contributingFactors.push(...medicineFactors);

  const caseScore = Math.min(36, cases * 0.42);
  const trendScore = Math.max(0, growthPct) * 0.45;
  const anomalyScore = isAnomaly ? 18 : 0;

  const riskScore = roundTo(clamp(caseScore + trendScore + anomalyScore + medicineSignal, 0, 100));

  let baseRisk = "LOW";
  let outbreakStatus = "NO OUTBREAK";
  if (riskScore >= 70) {
    baseRisk = "HIGH";
    outbreakStatus = "OUTBREAK LIKELY";
  } else if (riskScore >= 40) {
    baseRisk = "MEDIUM";
    outbreakStatus = "POSSIBLE OUTBREAK";
  }

  const probabilityNext3Days = clamp(1 / (1 + Math.exp(-((riskScore - 45) / 12))), 0.03, 0.98);
  const growthMultiplier = 1 + Math.max(0, growthPct / 100) * 0.7 + probabilityNext3Days * 0.22;

  return {
    base_risk: baseRisk,
    risk_score: riskScore,
    outbreak_probability_next_3_days: roundTo(probabilityNext3Days, 3),
    outbreak_status: outbreakStatus,
    predicted_next_week: Math.round(cases * growthMultiplier),
    predicted_next_3_days: Math.round(cases * (0.32 + probabilityNext3Days * 0.35)),
    inferred_diseases: inferredDiseases,
    medicine_demand_next_3_days: buildMedicineDemand(medicineSales, probabilityNext3Days),
    contributing_factors: [...new Set(contributingFactors)].slice(0, 8),
    metrics: {
      cases,
      historical_mean_cases: roundTo(historyMean),
      historical_std_cases: roundTo(historyStd),
      growth_percent: roundTo(growthPct),
      anomaly_flag: isAnomaly,
      medical_signal_score: roundTo(medicineSignal),
    },
  };
}

/**
 * Confidence reflects how much evidence backs the score, not how bad the risk is.
 * Two independent sources (ASHA + medical shop) beat a longer run of one source.
 */
function confidenceScore({ reportCount, dayCount, hasAshaSignal, hasMedicalSignal }) {
  let confidence = 0.2;
  confidence += Math.min(0.25, reportCount * 0.03);
  confidence += Math.min(0.2, dayCount * 0.025);
  if (hasAshaSignal) confidence += 0.15;
  if (hasMedicalSignal) confidence += 0.15;
  if (hasAshaSignal && hasMedicalSignal) confidence += 0.1;
  return roundTo(clamp(confidence, 0.1, 0.95));
}

function recommendedActions(ruleOutput) {
  const actions = [];
  const { base_risk: risk, metrics } = ruleOutput;

  if (risk === "HIGH") {
    actions.push("Notify block health officer today; treat this area as an active cluster.");
    actions.push("Deploy an ASHA door-to-door sweep across the affected village.");
  } else if (risk === "MEDIUM") {
    actions.push("Increase ASHA reporting to daily for this area.");
  }

  if (metrics.anomaly_flag) {
    actions.push("Case count is well above this area's own baseline — verify on the ground.");
  }
  if (metrics.growth_percent >= 20) {
    actions.push("Pre-position medicine stock before the trend peaks.");
  }
  if (metrics.medical_signal_score > 0 && !ruleOutput.inferred_diseases.length) {
    actions.push("Medicine sales are rising without matching field reports — check for under-reporting.");
  }

  return actions.slice(0, 5);
}

function smartAlerts(ruleOutput) {
  const alerts = [];
  if (ruleOutput.risk_score >= 70) {
    alerts.push({
      severity: "HIGH",
      message: `Risk score ${ruleOutput.risk_score}/100 — ${ruleOutput.outbreak_status.toLowerCase()}.`,
    });
  }
  if (ruleOutput.metrics.growth_percent >= 20) {
    alerts.push({
      severity: "MEDIUM",
      message: `Cases growing ${ruleOutput.metrics.growth_percent}% vs. the previous window.`,
    });
  }
  if (ruleOutput.metrics.anomaly_flag) {
    alerts.push({
      severity: "MEDIUM",
      message: `Current load exceeds the area baseline of ${ruleOutput.metrics.historical_mean_cases} cases/day.`,
    });
  }
  return alerts;
}

/**
 * Assembles the response shape the workspace UI reads
 * (`risk_level`, `outbreak_status`, `cases.current`, `confidence_score`, ...).
 * Previously produced by the Python `predict_outbreak` + LLM pass.
 */
export function buildOutbreakPrediction(context = {}) {
  const ruleOutput = applyOutbreakRules(context);

  return {
    risk_level: ruleOutput.base_risk,
    risk_score: ruleOutput.risk_score,
    outbreak_status: ruleOutput.outbreak_status,
    outbreak_probability_next_3_days: ruleOutput.outbreak_probability_next_3_days,
    confidence_score: confidenceScore({
      reportCount: context.reportCount || 0,
      dayCount: (context.historicalCases || []).length,
      hasAshaSignal: Boolean(context.hasAshaSignal),
      hasMedicalSignal: Boolean(context.hasMedicalSignal),
    }),
    cases: {
      current: ruleOutput.metrics.cases,
      predicted_next_week: ruleOutput.predicted_next_week,
      predicted_next_3_days: ruleOutput.predicted_next_3_days,
    },
    disease_predictions: ruleOutput.inferred_diseases.map((item) => ({
      disease: item.disease,
      probability: item.probability,
      reason: "Rule-engine symptom inference",
    })),
    medicine_demand_next_3_days: ruleOutput.medicine_demand_next_3_days,
    contributing_factors: ruleOutput.contributing_factors,
    smart_alerts: smartAlerts(ruleOutput),
    recommended_action: recommendedActions(ruleOutput),
    rule_engine_assessment: ruleOutput,
  };
}