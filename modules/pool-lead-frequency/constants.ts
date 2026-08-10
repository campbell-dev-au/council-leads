/**
 * CDC's dedicated pool tags — the high-confidence pool signal per
 * modules/nsw-ingestion/SPEC.md §2.4. DA's coarse "Pools / decks / fencing"
 * tag also catches deck/fence-only work with no pool, so it's deliberately
 * excluded here.
 */
export const POOL_CDC_DEVELOPMENT_TYPES = [
  "Swimming pool",
  "Swimming pools",
  "Portable swimming pools and spas and child-resistant barriers",
] as const;
