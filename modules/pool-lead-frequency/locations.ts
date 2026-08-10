import { listSuburbCentroids } from "@/modules/nsw-ingestion";
import { POOL_CDC_DEVELOPMENT_TYPES } from "./constants";

export interface LocationOption {
  suburb: string;
  latitude: number;
  longitude: number;
  poolLeadCount: number;
}

const MIN_POOL_LEAD_COUNT = 3;
const MAX_OPTIONS = 400;

/** Suburb centroids for the location picker, restricted to suburbs with enough pool-CDC history to be useful. */
export async function listLocationOptions(): Promise<LocationOption[]> {
  const centroids = await listSuburbCentroids({
    source: "CDC",
    developmentTypes: [...POOL_CDC_DEVELOPMENT_TYPES],
  });

  return centroids
    .filter((c) => c.count >= MIN_POOL_LEAD_COUNT)
    .slice(0, MAX_OPTIONS)
    .map((c) => ({
      suburb: c.suburb,
      latitude: c.latitude,
      longitude: c.longitude,
      poolLeadCount: c.count,
    }));
}
