import MedicalStock from "@/app/lib/schema/medicalStockSchema";
import { boundingBox, distanceBetweenKm } from "@/app/lib/location-utils";

/**
 * How far "nearby" reaches. Someone walks or takes a share-auto to collect medicine, so
 * this is deliberately small — and it doubles as the blast radius of the outbreak
 * signal, because every pickup inside it is evidence about roughly one locality.
 */
export const NEARBY_RADIUS_KM = 15;

/**
 * Ranks shops that can fulfil an order for a buyer standing at `userLocation`:
 * own village first, then whatever is measurably closest, then the rest of the district.
 *
 * Split out from the picker so the ordering can be tested without a database — the
 * rules here are the ones that decide whether a pickup lands in the right area, and
 * "it looked right in the query" is not something you can check afterwards.
 *
 * @returns {{shop: object, distanceKm: number|null}|{shop: null, reason: string}}
 */
export function rankShops(candidates, userLocation) {
  const village = (userLocation?.village || "").trim().toLowerCase();
  const district = (userLocation?.district || "").trim().toLowerCase();

  const reachable = candidates
    .map((row) => ({
      row,
      sameVillage: Boolean(village) && (row.location?.village || "").toLowerCase() === village,
      sameDistrict: (row.location?.district || "").toLowerCase() === district,
      distanceKm: distanceBetweenKm(userLocation, row.location),
    }))
    // Reachable means: the buyer's own village, or measurably close, or — when nobody
    // recorded coordinates, which is the common case for a rural signup — at least the
    // same district. What never qualifies is a far shop in another district that only
    // entered the candidate list through the coarse bounding box.
    .filter(
      (entry) =>
        entry.sameVillage ||
        (entry.distanceKm !== null && entry.distanceKm <= NEARBY_RADIUS_KM) ||
        (entry.distanceKm === null && entry.sameDistrict)
    );

  if (!reachable.length) return { shop: null, reason: "TOO_FAR" };

  reachable.sort((left, right) => {
    if (left.sameVillage !== right.sameVillage) return left.sameVillage ? -1 : 1;
    // Unknown distance sorts after every measured one rather than ahead of it.
    const leftDistance = left.distanceKm ?? Number.POSITIVE_INFINITY;
    const rightDistance = right.distanceKm ?? Number.POSITIVE_INFINITY;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return (right.row.quantity || 0) - (left.row.quantity || 0);
  });

  const best = reachable[0];
  return {
    shop: best.row,
    distanceKm: best.distanceKm === null ? null : Number(best.distanceKm.toFixed(2)),
  };
}

/**
 * Picks the shop that should fulfil this order, and never one outside the buyer's own
 * locality.
 *
 * The previous version fell back to `{}` when the buyer had no district on file, which
 * made the query global — an order could be routed to a shop hundreds of kilometres
 * away purely because that shop held the most stock. That is wrong twice over: nobody
 * can collect it, and the pickup lands in an area whose ASHA reports have nothing to do
 * with this patient.
 */
export async function pickMedicalShop(sku, quantity, userLocation) {
  const district = (userLocation?.district || "").trim();
  if (!district) return { shop: null, reason: "NO_LOCATION" };

  // Same district always counts as the buyer's area. Coordinates, when both sides have
  // them, additionally reach across a district border for a shop that is genuinely
  // closer than one on the far side of the buyer's own district — safe for the outbreak
  // signal, because the order is filed against the buyer's village either way.
  const box = boundingBox(userLocation, NEARBY_RADIUS_KM);
  const areaFilters = [{ "location.district": district }];
  if (box) {
    areaFilters.push({
      "location.latitude": { $gte: box.minLatitude, $lte: box.maxLatitude },
      "location.longitude": { $gte: box.minLongitude, $lte: box.maxLongitude },
    });
  }

  const candidates = await MedicalStock.find({
    sku,
    quantity: { $gte: quantity },
    $or: areaFilters,
  })
    .sort({ quantity: -1 })
    .limit(50)
    .lean();

  if (!candidates.length) return { shop: null, reason: "NO_STOCK_NEARBY" };

  return rankShops(candidates, userLocation);
}
