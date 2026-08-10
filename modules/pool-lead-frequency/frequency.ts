import { listApplications, type NswApplicationRecord } from "@/modules/nsw-ingestion";
import { POOL_CDC_DEVELOPMENT_TYPES } from "./constants";
import { boundingBoxForRadius, haversineKm, type LatLon } from "./geo";

export type FrequencyBucketSize = "week" | "month";

export interface EstimateFrequencyParams {
  center: LatLon;
  /** Positive, deduplicated on input; sorted ascending internally. */
  radiiKm: number[];
  bucket: FrequencyBucketSize;
  /** Inclusive YYYY-MM-DD. Defaults to the span of dated matches within the max radius. */
  dateFrom?: string;
  dateTo?: string;
}

export interface FrequencyBucketPoint {
  bucketStart: string;
  count: number;
}

export interface RadiusFrequency {
  radiusKm: number;
  areaKm2: number;
  /** All-time match count within the radius, regardless of date range or missing dates. */
  totalAllTime: number;
  /** Matches within [dateFrom, dateTo] that have a usable lodgement date — what buckets/rates are based on. */
  datedCount: number;
  /** Matches within the radius with no lodgement_date, so excluded from the time series. See module SPEC. */
  undatedCount: number;
  buckets: FrequencyBucketPoint[];
  avgPerMonth: number;
  avgPerWeek: number;
  densityPerKm2PerYear: number;
}

export interface FrequencyEstimate {
  center: LatLon;
  bucket: FrequencyBucketSize;
  dateFrom: string;
  dateTo: string;
  radii: RadiusFrequency[];
}

/** Generous cap — statewide CDC pool-tagged volume is ~13k rows total as of this writing. */
const MAX_ROWS = 20_000;
const DAY_MS = 86_400_000;
const AVG_DAYS_PER_MONTH = 30.44;

function monthKey(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const isoDay = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - isoDay);
  return d.toISOString().slice(0, 10);
}

function bucketKey(date: string, bucket: FrequencyBucketSize): string {
  return bucket === "month" ? monthKey(date) : mondayOf(date);
}

function bucketKeysInRange(from: string, to: string, bucket: FrequencyBucketSize): string[] {
  const keys: string[] = [];
  const start = new Date(`${bucketKey(from, bucket)}T00:00:00Z`);
  const end = new Date(`${bucketKey(to, bucket)}T00:00:00Z`);
  const step = bucket === "month" ? 1 : 7;

  for (let cursor = start; cursor <= end; ) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor);
    if (bucket === "month") {
      cursor.setUTCMonth(cursor.getUTCMonth() + step);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + step);
    }
  }

  return keys;
}

interface MatchedRow {
  record: NswApplicationRecord;
  distanceKm: number;
}

/**
 * Estimates how often new pool-lead CDC records appear, bucketed over time,
 * for one or more radii around a center point. ~35% of CDC pool-tagged
 * records have no lodgement_date (confirmed against live data) — those are
 * counted in totalAllTime/undatedCount but excluded from buckets/rates,
 * since nsw-ingestion's date_last_updated is not a safe stand-in for event
 * timing (SPEC.md §2.4: it reflects migration/reindex events, not reality).
 */
export async function estimateFrequency(params: EstimateFrequencyParams): Promise<FrequencyEstimate> {
  const radii = [...new Set(params.radiiKm)].filter((r) => r > 0).sort((a, b) => a - b);
  if (radii.length === 0) {
    throw new Error("estimateFrequency requires at least one positive radius");
  }

  const maxRadiusKm = radii[radii.length - 1];
  const boundingBox = boundingBoxForRadius(params.center, maxRadiusKm);

  const rows = await listApplications({
    source: "CDC",
    developmentTypes: [...POOL_CDC_DEVELOPMENT_TYPES],
    boundingBox,
    limit: MAX_ROWS,
  });

  const withDistance: MatchedRow[] = rows
    .filter((r) => r.latitude !== null && r.longitude !== null)
    .map((record) => ({
      record,
      distanceKm: haversineKm(params.center, { lat: Number(record.latitude), lon: Number(record.longitude) }),
    }))
    .filter((r) => r.distanceKm <= maxRadiusKm);

  const datedDatesAtMaxRadius = withDistance
    .filter((r) => r.record.lodgementDate !== null)
    .map((r) => r.record.lodgementDate as string);

  const today = new Date().toISOString().slice(0, 10);
  const dateTo = params.dateTo ?? datedDatesAtMaxRadius.reduce((a, b) => (b > a ? b : a), datedDatesAtMaxRadius[0] ?? today);
  const dateFrom = params.dateFrom ?? datedDatesAtMaxRadius.reduce((a, b) => (b < a ? b : a), datedDatesAtMaxRadius[0] ?? dateTo);

  const spanDays = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / DAY_MS) + 1);
  const spanMonths = spanDays / AVG_DAYS_PER_MONTH;
  const spanWeeks = spanDays / 7;

  const radiusResults: RadiusFrequency[] = radii.map((radiusKm) => {
    const matched = withDistance.filter((r) => r.distanceKm <= radiusKm);
    const dated = matched.filter((r) => r.record.lodgementDate !== null);
    const inRange = dated.filter((r) => {
      const d = r.record.lodgementDate as string;
      return d >= dateFrom && d <= dateTo;
    });

    const counts = new Map<string, number>();
    for (const r of inRange) {
      const key = bucketKey(r.record.lodgementDate as string, params.bucket);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const buckets = bucketKeysInRange(dateFrom, dateTo, params.bucket).map((bucketStart) => ({
      bucketStart,
      count: counts.get(bucketStart) ?? 0,
    }));

    const areaKm2 = Math.PI * radiusKm ** 2;
    const avgPerMonth = inRange.length / spanMonths;

    return {
      radiusKm,
      areaKm2,
      totalAllTime: matched.length,
      datedCount: inRange.length,
      undatedCount: matched.length - dated.length,
      buckets,
      avgPerMonth,
      avgPerWeek: inRange.length / spanWeeks,
      densityPerKm2PerYear: (avgPerMonth * 12) / areaKm2,
    };
  });

  return { center: params.center, bucket: params.bucket, dateFrom, dateTo, radii: radiusResults };
}
