/**
 * Public interface for the pool-lead-frequency module. Consumes nsw-ingestion
 * only through its exported query API — see modules/nsw-ingestion/SPEC.md §5.
 * This module owns the "what counts as a pool lead" classification and the
 * radius/time aggregation logic that nsw-ingestion deliberately stays out of.
 */

export { estimateFrequency } from "./frequency";
export type {
  EstimateFrequencyParams,
  FrequencyEstimate,
  FrequencyBucketPoint,
  FrequencyBucketSize,
  RadiusFrequency,
} from "./frequency";

export { listLocationOptions } from "./locations";
export type { LocationOption } from "./locations";

export { POOL_CDC_DEVELOPMENT_TYPES } from "./constants";

export { haversineKm } from "./geo";
export type { LatLon } from "./geo";
