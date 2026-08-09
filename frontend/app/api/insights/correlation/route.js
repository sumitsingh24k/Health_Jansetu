import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import HealthData from "@/app/lib/schema/healthDataSchema";
import MedicineOrder from "@/app/lib/schema/medicineOrderSchema";
import MedicalStock from "@/app/lib/schema/medicalStockSchema";
import StockMovement from "@/app/lib/schema/stockMovementSchema";
import User from "@/app/lib/schema/userschema";
import { logServerError } from "@/app/lib/server-log";
import { canSeeAllAreas, canSeeSupplyInsights } from "@/app/lib/auth/role-home";
import {
  correlateSignals,
  dailyDemandSeries,
  diseaseDemandFromMovements,
  diseaseDemandFromOrders,
  diseaseSpecificity,
  spikeStrength,
} from "@/app/lib/correlation/medicine-signal";
import {
  explainArea,
  explainCorrelationRow,
  explainMap,
} from "@/app/lib/correlation/area-reasoning";
import {
  agreementMatrix,
  backtest,
  syntheticValidation,
} from "@/app/lib/correlation/validation";
import { narrateAreaSummary } from "@/app/lib/correlation/narrate";

/**
 * Everything an admin needs to judge one area: what the ASHAs reported, what the shops
 * actually moved, where the two agree, why the engine concluded what it did, and how
 * far the engine itself can be trusted.
 *
 * Deliberately one endpoint rather than five. The whole point is that these numbers are
 * only meaningful next to each other — a caseload without the medicine behind it, or a
 * correlation without the validation report, is exactly the half-picture that made the
 * old dashboard misleading.
 */

const WINDOW_DAYS = 14;

function startOfWindow(days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function dailySeries(reports, days) {
  const totals = new Map();
  for (const report of reports) {
    const key = dayKey(report.reportDate || report.createdAt);
    totals.set(key, (totals.get(key) || 0) + (Number(report.newCases) || 0));
  }

  const series = [];
  const cursor = startOfWindow(days);
  for (let index = 0; index < days; index += 1) {
    series.push({ day: dayKey(cursor), cases: totals.get(dayKey(cursor)) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
}

/** Risk banding for the map, from both sides rather than reports alone. */
function riskLevelFor(cases, medicineDemand) {
  const score = cases + medicineDemand * 2;
  if (score >= 25) return "HIGH";
  if (score >= 8) return "MEDIUM";
  return "LOW";
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (!session?.user || !canSeeSupplyInsights(role)) {
    return Response.json(
      { message: "Ye screen sirf ADMIN, ASHA aur MEDICAL ke liye hai." },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const ownDistrict = (session.user.location?.district || "").trim();
  const seesEverywhere = canSeeAllAreas(role);

  /**
   * An admin oversees every district and lives in none, so the query decides the area.
   * Everybody else is pinned to their own district here rather than merely defaulting
   * to it — the previous version took whatever `?district=` was passed, which let a shop
   * in Varanasi pull up Thane's caseload simply by editing the URL. Their village
   * choice is still honoured, because narrowing inside your own district is fine.
   */
  const district = seesEverywhere
    ? (url.searchParams.get("district") || "").trim()
    : ownDistrict;
  const village = (url.searchParams.get("village") || "").trim();

  if (!seesEverywhere && !district) {
    return Response.json(
      {
        message:
          "Aapke profile me district nahi hai, isliye area ka insight nahi bana sakte. Admin se apni location theek karwaiye.",
      },
      { status: 400 }
    );
  }

  try {
    await dbConnect();

    // With no district chosen, offer the districts that actually have data rather than
    // failing with "district is required" and leaving the admin nowhere to go.
    if (!district) {
      const [reportDistricts, stockDistricts] = await Promise.all([
        HealthData.distinct("location.district"),
        MedicalStock.distinct("location.district"),
      ]);

      const districts = [...new Set([...reportDistricts, ...stockDistricts])]
        .filter(Boolean)
        .sort();

      return Response.json({
        data: {
          needsArea: true,
          districts,
          message: "Kis district ko dekhna hai? Neeche se chuniye.",
        },
      });
    }

    const since = startOfWindow(WINDOW_DAYS);
    const areaFilter = { "location.district": district };
    if (village) areaFilter["location.village"] = village;

    const [reports, pickedUpOrders, counterSales, stock, shops, ashaWorkers] = await Promise.all([
      HealthData.find({ ...areaFilter, reportDate: { $gte: since } })
        .select("disease newCases criticalCases reportDate createdAt reporterRole location notes")
        .sort({ reportDate: 1 })
        .limit(1000)
        .lean(),
      MedicineOrder.find({ ...areaFilter, status: "PICKED_UP", pickedUpAt: { $gte: since } })
        .select("sku brand quantity diseaseSignals pickedUpAt location shopLocation")
        .sort({ pickedUpAt: 1 })
        .limit(1000)
        .lean(),
      StockMovement.find({ ...areaFilter, reason: "COUNTER_SALE", occurredAt: { $gte: since } })
        .select("sku brand delta diseaseSignals occurredAt location reason")
        .sort({ occurredAt: 1 })
        .limit(1000)
        .lean(),
      MedicalStock.find(areaFilter).select("sku brand quantity reorderLevel location medical").lean(),
      User.find({ role: "MEDICAL", ...areaFilter }).select("name location status").lean(),
      User.find({ role: "ASHA", ...areaFilter }).select("name workerId location").lean(),
    ]);

    /* ---------------- ASHA side ---------------- */

    const ashaReports = reports.filter((report) => report.reporterRole === "ASHA");
    const ashaCasesByDisease = new Map();
    for (const report of ashaReports) {
      const disease = String(report.disease || "").toUpperCase();
      if (!disease) continue;
      ashaCasesByDisease.set(
        disease,
        (ashaCasesByDisease.get(disease) || 0) + (Number(report.newCases) || 0)
      );
    }

    const ashaSide = {
      windowDays: WINDOW_DAYS,
      reportCount: ashaReports.length,
      workerCount: ashaWorkers.length,
      totalCases: ashaReports.reduce((sum, report) => sum + (Number(report.newCases) || 0), 0),
      criticalCases: ashaReports.reduce(
        (sum, report) => sum + (Number(report.criticalCases) || 0),
        0
      ),
      byDisease: [...ashaCasesByDisease.entries()]
        .map(([disease, cases]) => ({ disease, cases }))
        .sort((left, right) => right.cases - left.cases),
      dailyCases: dailySeries(ashaReports, WINDOW_DAYS),
      workers: ashaWorkers.map((worker) => ({
        name: worker.name,
        workerId: worker.workerId || null,
        village: worker.location?.village || "",
      })),
    };

    /* ---------------- Medical side ---------------- */

    const unitsBySku = new Map();
    const addUnits = (sku, brand, units, bucket) => {
      const existing = unitsBySku.get(sku) || { sku, brand, pickups: 0, counter: 0 };
      existing[bucket] += units;
      unitsBySku.set(sku, existing);
    };

    for (const order of pickedUpOrders) {
      addUnits(order.sku, order.brand, Number(order.quantity) || 0, "pickups");
    }
    for (const sale of counterSales) {
      addUnits(sale.sku, sale.brand, Math.abs(Number(sale.delta) || 0), "counter");
    }

    const movers = [...unitsBySku.values()]
      .map((row) => ({ ...row, total: row.pickups + row.counter }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 10);

    const medicalSide = {
      windowDays: WINDOW_DAYS,
      shopCount: shops.length,
      shops: shops.map((shop) => ({
        name: shop.name,
        village: shop.location?.village || "",
        status: shop.status,
      })),
      pickupCount: pickedUpOrders.length,
      counterSaleCount: counterSales.length,
      unitsMoved:
        pickedUpOrders.reduce((sum, order) => sum + (Number(order.quantity) || 0), 0) +
        counterSales.reduce((sum, sale) => sum + Math.abs(Number(sale.delta) || 0), 0),
      fastMovers: movers,
      stockedSkus: stock.length,
      lowStock: stock
        .filter((row) => row.quantity <= (row.reorderLevel ?? 10))
        .map((row) => ({ sku: row.sku, brand: row.brand, quantity: row.quantity }))
        .slice(0, 12),
      // Counter sales only exist from the day the ledger was added, so an empty number
      // here means "not recorded yet", not "nothing sold".
      counterSalesTracked: counterSales.length > 0,
    };

    /* ---------------- Correlation ---------------- */

    const orderDemand = diseaseDemandFromOrders(pickedUpOrders);
    const counterDemand = diseaseDemandFromMovements(counterSales);
    const medicineEvents = [...pickedUpOrders, ...counterSales];
    const specificity = diseaseSpecificity(medicineEvents);

    const correlation = correlateSignals(
      ashaCasesByDisease,
      orderDemand,
      counterDemand,
      specificity
    ).map((row) => {
      const series = dailyDemandSeries(medicineEvents, row.disease, WINDOW_DAYS);
      const spike = spikeStrength(series);
      return {
        ...row,
        demandSeries: series,
        demandSpikePercent: spike.growthPercent,
        explanation: explainCorrelationRow(row),
      };
    });

    /* ---------------- Map zones ---------------- */

    const zoneMap = new Map();
    const zoneFor = (name) => {
      if (!zoneMap.has(name)) {
        zoneMap.set(name, { village: name, cases: 0, reports: 0, medicineDemand: 0 });
      }
      return zoneMap.get(name);
    };

    for (const report of ashaReports) {
      const zone = zoneFor(report.location?.village || "Unknown");
      zone.cases += Number(report.newCases) || 0;
      zone.reports += 1;
    }
    for (const event of medicineEvents) {
      const zone = zoneFor(event.location?.village || "Unknown");
      const units =
        event.quantity !== undefined
          ? Number(event.quantity) || 0
          : Math.abs(Number(event.delta) || 0);
      const peak = Math.max(0, ...(event.diseaseSignals || []).map((s) => Number(s.weight) || 0));
      zone.medicineDemand += (units / 10) * peak;
    }

    const zones = [...zoneMap.values()]
      .map((zone) => ({
        ...zone,
        medicineDemand: Number(zone.medicineDemand.toFixed(2)),
        riskLevel: riskLevelFor(zone.cases, zone.medicineDemand),
      }))
      .sort((left, right) => right.cases + right.medicineDemand - (left.cases + left.medicineDemand));

    /* ---------------- Reasoning + validation ---------------- */

    const reasoning = explainArea({
      area: { district, village },
      correlation,
      ashaSide,
      medicalSide,
      dailyCases: ashaSide.dailyCases.map((entry) => entry.cases),
    });

    const mapExplanation = explainMap(zones);

    const validation = {
      synthetic: syntheticValidation({ perType: 60, seed: 42 }),
      agreement: agreementMatrix(correlation),
      backtest: backtest({ reports: ashaReports, medicineEvents }),
    };

    // Narration is opt-in per request: the dashboard is fully readable without it, and
    // an admin refreshing a filter twenty times should not spend twenty model calls.
    const narration =
      url.searchParams.get("narrate") === "1"
        ? await narrateAreaSummary({
            summary: reasoning.summary,
            priorities: reasoning.priorities,
            mapExplanation,
          })
        : { text: reasoning.summary, source: "RULES" };

    return Response.json({
      data: {
        needsArea: false,
        area: { district, village: village || null, windowDays: WINDOW_DAYS },
        ashaSide,
        medicalSide,
        correlation,
        zones,
        mapExplanation,
        reasoning,
        narration,
        validation,
      },
    });
  } catch (error) {
    logServerError("api/insights/correlation", error);
    return Response.json({ message: "Insight load nahi hua." }, { status: 500 });
  }
}
