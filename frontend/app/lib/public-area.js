/**
 * Turning the two open feeds into one answer a villager can act on.
 *
 * `/api/public/dashboard` already returns both witnesses, but it returns them apart:
 * `riskZones[].riskLevel` is scored from ASHA case counts alone, while the medicine
 * side arrives separately as `diseaseSignalFromMedicine` for the whole district. The
 * helpers here do the joining on the client, which is why every rule below is written
 * out rather than hidden — the reader of this file is the only reviewer the formula
 * gets.
 *
 * Nothing here fetches. Pure functions so the verdict can be reasoned about, and so a
 * wrong colour on the map is always traceable to an input, never to a request.
 */

const EARTH_RADIUS_KM = 6371;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

/** Great-circle distance. Good enough at district scale, and needs no map library. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Which reporting area is closest to a GPS fix.
 *
 * There is no reverse-geocoder in this system, and adding one would mean a new
 * endpoint. We do not actually need the postal district — we need the district that
 * has data, and every zone already carries both its coordinates and its district name.
 * So the nearest zone names the area. `distanceKm` is returned with it so the caller
 * can be honest when the nearest activity is far away rather than implying the
 * villager is standing inside it.
 */
export function nearestZone(zones, latitude, longitude) {
  if (!Array.isArray(zones) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  let best = null;

  for (const zone of zones) {
    const distanceKm = haversineKm(latitude, longitude, zone?.latitude, zone?.longitude);
    if (!Number.isFinite(distanceKm)) continue;
    if (!best || distanceKm < best.distanceKm) {
      best = { zone, distanceKm };
    }
  }

  return best;
}

/** Beyond this the nearest activity is somewhere else, and we say so. */
export const NEARBY_LIMIT_KM = 60;

/**
 * How loudly the medicine side is speaking for one disease.
 *
 * `patientEquivalents` is the correlation engine's own unit: units dispensed converted
 * into "this many people were probably treated". The thresholds are deliberately low
 * because this is a district total over 14 days on an open feed, not a clinical count.
 */
function medicineStrength(patientEquivalents) {
  const value = Number(patientEquivalents) || 0;
  if (value >= 1.5) return { band: "STRONG", value };
  if (value >= 0.5) return { band: "SOME", value };
  return { band: "QUIET", value };
}

const ASHA_RANK = { HIGH: 2, MEDIUM: 1, LOW: 0 };
const MEDICINE_RANK = { STRONG: 2, SOME: 1, QUIET: 0 };

/**
 * The verdict, from both witnesses.
 *
 * The whole point of this system is that neither side is trusted alone: an ASHA can
 * only report the households she reached, and a shop counter only sees who came in.
 * So the two ranks are added rather than either one deciding.
 *
 *   RED   — both are loud, or one is loud and the other agrees at all
 *   WATCH — exactly one side is saying something
 *   CALM  — neither side is
 *
 * `agreement` is what the card actually shows: "dono gawah" is the sentence that makes
 * a red circle believable, and "sirf ek gawah" is the honest label when it is not.
 */
export function combineVerdict(zone, medicineSignal) {
  const ashaLevel = zone?.riskLevel === "HIGH" || zone?.riskLevel === "MEDIUM" || zone?.riskLevel === "LOW"
    ? zone.riskLevel
    : "LOW";
  const topDisease = String(zone?.topDisease || "").toUpperCase();

  const match = Array.isArray(medicineSignal)
    ? medicineSignal.find((entry) => String(entry?.disease || "").toUpperCase() === topDisease)
    : null;
  const medicine = medicineStrength(match?.patientEquivalents);

  const score = (ASHA_RANK[ashaLevel] ?? 0) + (MEDICINE_RANK[medicine.band] ?? 0);
  const bothSpeak = (ASHA_RANK[ashaLevel] ?? 0) > 0 && (MEDICINE_RANK[medicine.band] ?? 0) > 0;

  const level = score >= 3 || (bothSpeak && score >= 2) ? "RED" : score >= 1 ? "WATCH" : "CALM";

  return {
    level,
    topDisease,
    asha: {
      level: ashaLevel,
      cases: Number(zone?.cases) || 0,
      criticalCases: Number(zone?.criticalCases) || 0,
      reportCount: Number(zone?.reportCount) || 0,
    },
    medicine: {
      band: medicine.band,
      patientEquivalents: Number(medicine.value.toFixed(2)),
    },
    agreement: bothSpeak ? "BOTH" : score > 0 ? "ONE" : "NONE",
  };
}

/**
 * Last seven days against the seven before them.
 *
 * The public feed is a flat 14-day series, which is exactly two weeks — so the
 * comparison a person actually asks for ("pichhle hafte se kya badla") is a split, not
 * a new request. When the earlier week is empty a percentage would be meaningless
 * (anything over zero is infinite), so `deltaPercent` stays null and the caller shows
 * counts instead.
 */
export function weekOverWeek(dailyTrend) {
  const series = Array.isArray(dailyTrend) ? dailyTrend : [];
  const tail = series.slice(-14);
  const previous = tail.slice(0, Math.max(0, tail.length - 7));
  const current = tail.slice(-7);

  const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row?.[key]) || 0), 0);

  const thisWeekCases = sum(current, "cases");
  const lastWeekCases = sum(previous, "cases");
  const thisWeekCritical = sum(current, "critical");
  const lastWeekCritical = sum(previous, "critical");

  const deltaPercent =
    lastWeekCases > 0
      ? Math.round(((thisWeekCases - lastWeekCases) / lastWeekCases) * 100)
      : null;

  const direction =
    thisWeekCases > lastWeekCases ? "UP" : thisWeekCases < lastWeekCases ? "DOWN" : "FLAT";

  return {
    thisWeekCases,
    lastWeekCases,
    thisWeekCritical,
    lastWeekCritical,
    deltaPercent,
    direction,
    days: current.length,
    hasComparison: previous.length > 0,
  };
}

export function titleCaseDisease(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
