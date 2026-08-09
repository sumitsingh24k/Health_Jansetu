export function parseCoordinate(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return undefined;
  }

  return number;
}

export function buildLocation(input) {
  const village = typeof input?.village === "string" ? input.village.trim() : "";
  const district = typeof input?.district === "string" ? input.district.trim() : "";
  const latitude = parseCoordinate(input?.latitude);
  const longitude = parseCoordinate(input?.longitude);

  if (!village || !district) {
    return { error: "location.village and location.district are required", location: null };
  }

  if ((latitude === undefined) !== (longitude === undefined)) {
    return {
      error: "latitude and longitude must be provided together",
      location: null,
    };
  }

  if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
    return { error: "latitude must be between -90 and 90", location: null };
  }

  if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
    return { error: "longitude must be between -180 and 180", location: null };
  }

  return {
    error: null,
    location: {
      village,
      district,
      ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
    },
  };
}

export function hasCoordinates(location) {
  return Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

/** Great-circle distance in km between two lat/lng pairs. */
export function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const start =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(start), Math.sqrt(1 - start));
}

/** Distance between two location objects, or null when either lacks coordinates. */
export function distanceBetweenKm(from, to) {
  if (!hasCoordinates(from) || !hasCoordinates(to)) return null;
  return haversineDistanceKm(from.latitude, from.longitude, to.latitude, to.longitude);
}

/**
 * A lat/lng box that comfortably contains `radiusKm` around a point.
 *
 * Used to narrow a Mongo query before measuring real distances: a box is something an
 * index can use, `haversine` is not. The longitude span widens with latitude, and is
 * clamped near the poles where it degenerates.
 */
export function boundingBox(center, radiusKm) {
  if (!hasCoordinates(center) || !(radiusKm > 0)) return null;

  const latDelta = radiusKm / 111.32;
  const cosLat = Math.cos(toRadians(center.latitude));
  const lngDelta = Math.abs(cosLat) < 0.01 ? 180 : radiusKm / (111.32 * Math.abs(cosLat));

  return {
    minLatitude: center.latitude - latDelta,
    maxLatitude: center.latitude + latDelta,
    minLongitude: center.longitude - lngDelta,
    maxLongitude: center.longitude + lngDelta,
  };
}
