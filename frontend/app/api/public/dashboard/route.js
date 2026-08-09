import dbConnect from "@/app/lib/dbconnect";
import HealthData from "@/app/lib/schema/healthDataSchema";
import MedicineOrder from "@/app/lib/schema/medicineOrderSchema";
import { logServerError } from "@/app/lib/server-log";
import StockMovement from "@/app/lib/schema/stockMovementSchema";
import {
  diseaseDemandFromMovements,
  diseaseDemandFromOrders,
} from "@/app/lib/correlation/medicine-signal";

/**
 * Open surveillance summary — no login required.
 *
 * Everything here is aggregated to area level. No worker id, no customer name, no
 * individual report is exposed, because this endpoint is reachable by anyone. A
 * villager should be able to see that dengue is rising in their block without an
 * account, and without any of their neighbours being identifiable in the response.
 */

const WINDOW_DAYS = 14;
const MAX_ZONES = 60;

function startOfWindow(days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function severityForCases(cases) {
  if (cases >= 25) return "HIGH";
  if (cases >= 10) return "MEDIUM";
  return "LOW";
}

export async function GET(request) {
  const url = new URL(request.url);
  const district = (url.searchParams.get("district") || "").trim();

  try {
    await dbConnect();

    const since = startOfWindow(WINDOW_DAYS);
    const reportQuery = { reportDate: { $gte: since } };
    const orderQuery = { status: "PICKED_UP", pickedUpAt: { $gte: since } };
    // COUNTER_SALE only. A PICKUP movement describes the same tablets as the order it
    // came from, so reading both would turn one sale into two agreeing witnesses.
    const counterQuery = { reason: "COUNTER_SALE", occurredAt: { $gte: since } };

    if (district) {
      reportQuery["location.district"] = district;
      orderQuery["location.district"] = district;
      counterQuery["location.district"] = district;
    }

    const [reports, orders, counterSales] = await Promise.all([
      HealthData.find(reportQuery)
        .select("disease newCases criticalCases reportDate location reporterRole")
        .sort({ reportDate: 1 })
        .limit(2000)
        .lean(),
      MedicineOrder.find(orderQuery)
        .select("brand quantity diseaseSignals pickedUpAt location")
        .sort({ pickedUpAt: 1 })
        .limit(2000)
        .lean(),
      // Walk-in sales are most of what a village shop actually moves — leaving them out
      // showed the public a fraction of the medicine signal the workspace was acting on,
      // so the same area could read "watch" here and "confirmed" there.
      StockMovement.find(counterQuery)
        .select("brand delta diseaseSignals occurredAt location reason")
        .sort({ occurredAt: 1 })
        .limit(2000)
        .lean(),
    ]);

    // ---- Daily case trend ----
    const dailyMap = new Map();
    for (const report of reports) {
      const key = dayKey(report.reportDate || report.createdAt);
      const entry = dailyMap.get(key) || { date: key, cases: 0, critical: 0 };
      entry.cases += report.newCases || 0;
      entry.critical += report.criticalCases || 0;
      dailyMap.set(key, entry);
    }

    const dailyTrend = [];
    const cursor = startOfWindow(WINDOW_DAYS);
    for (let index = 0; index < WINDOW_DAYS; index += 1) {
      const key = dayKey(cursor);
      dailyTrend.push(dailyMap.get(key) || { date: key, cases: 0, critical: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    // ---- Disease distribution ----
    const diseaseMap = new Map();
    for (const report of reports) {
      const disease = String(report.disease || "UNKNOWN").toUpperCase();
      diseaseMap.set(disease, (diseaseMap.get(disease) || 0) + (report.newCases || 0));
    }
    const diseaseDistribution = [...diseaseMap.entries()]
      .map(([disease, cases]) => ({ disease, cases }))
      .sort((left, right) => right.cases - left.cases)
      .slice(0, 10);

    // ---- Medicine supply signal ----
    // Both ways a shelf empties: an app order collected at the counter, and a walk-in
    // buying across the counter. The two sets are disjoint by construction.
    const counterUnits = (sale) => Math.abs(Number(sale.delta) || 0);

    const medicineMap = new Map();
    const addBrandUnits = (brand, units) => {
      if (!brand || units <= 0) return;
      const entry = medicineMap.get(brand) || { brand, units: 0 };
      entry.units += units;
      medicineMap.set(brand, entry);
    };
    for (const order of orders) addBrandUnits(order.brand, Number(order.quantity) || 0);
    for (const sale of counterSales) addBrandUnits(sale.brand, counterUnits(sale));

    const medicineDemand = [...medicineMap.values()]
      .sort((left, right) => right.units - left.units)
      .slice(0, 10);

    const diseaseDemand = new Map();
    for (const source of [diseaseDemandFromOrders(orders), diseaseDemandFromMovements(counterSales)]) {
      for (const [disease, demand] of source) {
        diseaseDemand.set(disease, (diseaseDemand.get(disease) || 0) + demand);
      }
    }
    const diseaseSignalFromMedicine = [...diseaseDemand.entries()]
      .map(([disease, demand]) => ({ disease, patientEquivalents: Number(demand.toFixed(2)) }))
      .sort((left, right) => right.patientEquivalents - left.patientEquivalents)
      // Wide enough to cover every disease a district actually shows. At 8 a real
      // signal could fall off the end and be read downstream as "no medicine at all",
      // which is a different claim from "not in the top eight".
      .slice(0, 20);

    const unitsDispensed =
      orders.reduce((sum, order) => sum + (Number(order.quantity) || 0), 0) +
      counterSales.reduce((sum, sale) => sum + counterUnits(sale), 0);

    // ---- Risk zones for the map (area level only) ----
    const zoneMap = new Map();
    for (const report of reports) {
      const village = report.location?.village || "Unknown";
      const zoneDistrict = report.location?.district || "Unknown";
      const key = `${zoneDistrict}|${village}`.toLowerCase();

      const zone = zoneMap.get(key) || {
        village,
        district: zoneDistrict,
        cases: 0,
        criticalCases: 0,
        reportCount: 0,
        latitude: null,
        longitude: null,
        diseases: new Map(),
      };

      zone.cases += report.newCases || 0;
      zone.criticalCases += report.criticalCases || 0;
      zone.reportCount += 1;

      if (Number.isFinite(report.location?.latitude) && zone.latitude === null) {
        zone.latitude = report.location.latitude;
        zone.longitude = report.location.longitude;
      }

      const disease = String(report.disease || "UNKNOWN").toUpperCase();
      zone.diseases.set(disease, (zone.diseases.get(disease) || 0) + (report.newCases || 0));

      zoneMap.set(key, zone);
    }

    const riskZones = [...zoneMap.values()]
      .map((zone) => {
        const topDisease = [...zone.diseases.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          village: zone.village,
          district: zone.district,
          cases: zone.cases,
          criticalCases: zone.criticalCases,
          reportCount: zone.reportCount,
          latitude: zone.latitude,
          longitude: zone.longitude,
          topDisease: topDisease?.[0] || "UNKNOWN",
          riskLevel: severityForCases(zone.cases),
        };
      })
      .sort((left, right) => right.cases - left.cases)
      .slice(0, MAX_ZONES);

    const totalCases = reports.reduce((sum, report) => sum + (report.newCases || 0), 0);
    const totalCritical = reports.reduce((sum, report) => sum + (report.criticalCases || 0), 0);

    return Response.json({
      data: {
        windowDays: WINDOW_DAYS,
        scope: district || "All districts",
        summary: {
          totalCases,
          criticalCases: totalCritical,
          activeAreas: riskZones.length,
          highRiskAreas: riskZones.filter((zone) => zone.riskLevel === "HIGH").length,
          medicineUnitsDispensed: unitsDispensed,
        },
        dailyTrend,
        diseaseDistribution,
        medicineDemand,
        diseaseSignalFromMedicine,
        riskZones,
      },
    });
  } catch (error) {
    logServerError("api/public/dashboard", error);
    return Response.json({ message: "Dashboard load nahi hua." }, { status: 500 });
  }
}
