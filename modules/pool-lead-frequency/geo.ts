import type { GeoBoundingBox } from "@/modules/nsw-ingestion";

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

const KM_PER_DEGREE_LAT = 111;

/**
 * Square bounding box guaranteed to fully contain a circle of radiusKm around
 * center — a cheap SQL pre-filter. Callers still need haversineKm to cut the
 * precise circle out of it.
 */
export function boundingBoxForRadius(center: LatLon, radiusKm: number): GeoBoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const lonDelta = radiusKm / (KM_PER_DEGREE_LAT * Math.cos(toRad(center.lat)));

  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLon: center.lon - lonDelta,
    maxLon: center.lon + lonDelta,
  };
}
