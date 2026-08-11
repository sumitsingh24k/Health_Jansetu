import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import HealthData from "@/app/lib/schema/healthDataSchema";
import MedicineOrder from "@/app/lib/schema/medicineOrderSchema";
import StockMovement from "@/app/lib/schema/stockMovementSchema";
import Medicine from "@/app/lib/schema/medicineSchema";
import { logServerError } from "@/app/lib/server-log";
import { localeFromRequest } from "@/app/lib/i18n/server";
import {
  diseaseRiskFromVelocity,
  explainDiseaseRisk,
  explainMedicine,
  explainZoneReason,
  medicineVelocity,
} from "@/app/lib/correlation/medicine-velocity";
import { buildOutbreakPrediction } from "@/app/lib/outbreak-rules";
import {
  correlateSignals,
  dailyDemandSeries,
  diseaseDemandFromMovements,
  diseaseDemandFromOrders,
  diseaseSpecificity,
  medicineRiskContribution,
  spikeStrength,
} from "@/app/lib/correlation/medicine-signal";

const ALLOWED_ROLES = ["ADMIN", "ASHA", "MEDICAL"];
const TREND_DAYS = 14;
/**
 * Each half of the week-over-week comparison. Two of these fit inside TREND_DAYS, so
 * velocity reads from the medicine events already fetched for the correlation.
 */
const VELOCITY_WINDOW_DAYS = 7;

function startOfWindow(days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Daily case totals, oldest first, with gap days filled as 0 so trends stay honest. */
function toDailySeries(reports, days) {
  const totals = new Map();
  for (const report of reports) {
    const key = dayKey(report.reportDate || report.createdAt);
    totals.set(key, (totals.get(key) || 0) + (Number(report.newCases) || 0));
  }

  const series = [];
  const cursor = startOfWindow(days);
  for (let index = 0; index < days; index += 1) {
    series.push(totals.get(dayKey(cursor)) || 0);
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
}

/** Medicine sales rolled up per medicine across the window. */
function aggregateMedicineSales(reports) {
  const totals = new Map();
  for (const report of reports) {
    for (const sale of report.medicineSales || []) {
      const medicine = String(sale?.medicine || "").trim();
      if (!medicine) continue;
      const existing = totals.get(medicine.toLowerCase());
      const unitsSold = Number(sale.unitsSold) || 0;
      if (existing) {
        existing.unitsSold += unitsSold;
      } else {
        totals.set(medicine.toLowerCase(), { medicine, unitsSold });
      }
    }
  }
  return [...totals.values()].sort((left, right) => right.unitsSold - left.unitsSold);
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  // Every sentence this route writes is shown to a person, so it answers in the
  // language they picked rather than in the one the engine happens to be written in.
  const locale = localeFromRequest(request);

  if (!session || !ALLOWED_ROLES.includes(role)) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Body is optional: with no override we score the signed-in user's own area.
  const body = await request.json().catch(() => ({}));

  const district = String(body?.district || session.user?.location?.district || "").trim();
  const village = String(body?.village || session.user?.location?.village || "").trim();

  if (!district) {
    return Response.json(
      { message: "District is required to score an area. Set it on your profile or pass it in the request." },
      { status: 400 }
    );
  }

  try {
    await dbConnect();

    const query = {
      "location.district": district,
      reportDate: { $gte: startOfWindow(TREND_DAYS) },
    };
    if (village) {
      query["location.village"] = village;
    }

    const orderQuery = {
      "location.district": district,
      status: "PICKED_UP",
      pickedUpAt: { $gte: startOfWindow(TREND_DAYS) },
    };
    if (village) {
      orderQuery["location.village"] = village;
    }

    // Over-the-counter sales are scoped to the shop's own area, which for a walk-in
    // sale is the buyer's area too — nobody crosses a district to buy fever tablets.
    const movementQuery = {
      "location.district": district,
      reason: "COUNTER_SALE",
      occurredAt: { $gte: startOfWindow(TREND_DAYS) },
    };
    if (village) {
      movementQuery["location.village"] = village;
    }

    const [reports, pickedUpOrders, counterSales] = await Promise.all([
      HealthData.find(query)
        .select("disease newCases criticalCases reportDate createdAt reporterRole medicineSales notes")
        .sort({ reportDate: 1 })
        .limit(500)
        .lean(),
      // Only confirmed pickups. A reservation that nobody collected is not evidence
      // that anyone is sick, which is the whole point of the two-step order flow.
      MedicineOrder.find(orderQuery)
        .select("sku brand quantity diseaseSignals pickedUpAt createdAt")
        .sort({ pickedUpAt: 1 })
        .limit(1000)
        .lean(),
      StockMovement.find(movementQuery)
        .select("sku brand delta reason diseaseSignals occurredAt")
        .sort({ occurredAt: 1 })
        .limit(1000)
        .lean(),
    ]);

    if (!reports.length && !pickedUpOrders.length && !counterSales.length) {
      return Response.json(
        { message: "No reports or medicine movement in the last 14 days for this area." },
        { status: 404 }
      );
    }

    const dailySeries = toDailySeries(reports, TREND_DAYS);
    // ASHAs in sparse areas do not report every day, so scoring "today" would read
    // a reporting gap as zero cases. Score the latest day that actually has data,
    // against the days before it. Units stay daily on both sides of the comparison.
    const latestReportedIndex = dailySeries.reduce(
      (found, value, index) => (value > 0 ? index : found),
      dailySeries.length - 1
    );

    // ---- Cross-check field reports against confirmed medicine pickups. ----
    const ashaCasesByDisease = new Map();
    for (const report of reports) {
      if (report.reporterRole !== "ASHA") continue;
      const disease = String(report.disease || "").toUpperCase();
      if (!disease) continue;
      ashaCasesByDisease.set(disease, (ashaCasesByDisease.get(disease) || 0) + (report.newCases || 0));
    }

    const orderDemand = diseaseDemandFromOrders(pickedUpOrders);
    const counterDemand = diseaseDemandFromMovements(counterSales);
    const medicineEvents = [...pickedUpOrders, ...counterSales];

    const specificity = diseaseSpecificity(medicineEvents);

    const correlation = correlateSignals(
      ashaCasesByDisease,
      orderDemand,
      counterDemand,
      specificity
    ).map(
      (row) => {
        const series = dailyDemandSeries(medicineEvents, row.disease, TREND_DAYS);
        const spike = spikeStrength(series);
        return { ...row, demandSeries: series, demandSpikePercent: spike.growthPercent };
      }
    );

    // ---- Which medicine is moving, why it is used, and what that points at. ----
    //
    // A single risk number with nothing under it cannot be argued with. This is the
    // chain the admin can actually read: sale speed -> what the medicine treats ->
    // which disease -> how strong the signal is.
    const velocity = medicineVelocity(medicineEvents, { windowDays: VELOCITY_WINDOW_DAYS });

    const catalog = velocity.length
      ? await Medicine.find({ sku: { $in: velocity.map((row) => row.sku) } })
          .select("sku brand description category schedule symptoms diseaseSignals")
          .lean()
      : [];
    const catalogBySku = new Map(catalog.map((row) => [row.sku, row]));

    const medicines = velocity.map((row) => {
      const entry = catalogBySku.get(row.sku);
      return {
        ...row,
        purpose: entry?.description || "",
        category: entry?.category || "",
        schedule: entry?.schedule || "",
        explanation: explainMedicine(row, entry, locale),
      };
    });

    const velocityRisk = diseaseRiskFromVelocity(velocity, ashaCasesByDisease).map((risk) => ({
      ...risk,
      explanation: explainDiseaseRisk(risk, locale),
    }));

    const prediction = buildOutbreakPrediction({
      cases: dailySeries[latestReportedIndex] || 0,
      historicalCases: dailySeries.slice(0, latestReportedIndex),
      symptoms: [...new Set(reports.map((report) => String(report.disease || "").toLowerCase()))],
      medicineSales: aggregateMedicineSales(reports),
      reportCount: reports.length,
      hasAshaSignal: reports.some((report) => report.reporterRole === "ASHA"),
      hasMedicalSignal:
        reports.some((report) => report.reporterRole === "MEDICAL") ||
        pickedUpOrders.length > 0 ||
        counterSales.length > 0,
    });

    // Medicine evidence raises the score but is capped, so verified pickups can
    // strengthen a real cluster without inventing one on their own.
    const medicineBonus = medicineRiskContribution(correlation);
    const boostedScore = Math.min(100, Number((prediction.risk_score + medicineBonus).toFixed(2)));
    const boostedLevel = boostedScore >= 70 ? "HIGH" : boostedScore >= 40 ? "MEDIUM" : "LOW";

    const underReported = correlation.filter((row) => row.status === "MEDICINE_ONLY");

    return Response.json({
      data: {
        ...prediction,
        risk_score: boostedScore,
        risk_level: boostedLevel,
        medicine_risk_bonus: medicineBonus,
        correlation,
        under_reporting_alerts: underReported.map((row) => ({
          disease: row.disease,
          medicineDemand: row.medicineDemand,
          message: row.note,
        })),
        recommended_action: [
          ...prediction.recommended_action,
          ...underReported
            .slice(0, 2)
            .map(
              (row) =>
                `${row.disease}: medicine bik rahi hai par field report nahi — is area me ASHA survey karwaiye.`
            ),
        ].slice(0, 6),
        area: { district, village: village || null },
        window_days: TREND_DAYS,
        daily_cases: dailySeries,
        medicine_velocity: {
          window_days: VELOCITY_WINDOW_DAYS,
          medicines,
          disease_risk: velocityRisk,
          // The map's answer to "ye area laal kyun hai?" — named medicines, not a score.
          zone_reason: explainZoneReason(village || district, velocityRisk, locale),
          has_history: medicines.some((row) => row.baselineUnits > 0),
        },
      },
    });
  } catch (caught) {
    logServerError("api/predictions/outbreak", caught);
    return Response.json({ message: "Could not score outbreak risk." }, { status: 500 });
  }
}