import { and, arrayOverlaps, avg, between, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./db/client";
import { nswApplications } from "./db/schema";
import type { NswSource } from "./types";

/**
 * Public interface for the nsw-ingestion module. Other modules must consume
 * NSW application data through these functions, not by querying
 * nsw_applications / nsw_ingestion_sync_state directly — see SPEC.md §5.
 */

export type NswApplicationRecord = typeof nswApplications.$inferSelect;

export interface GeoBoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface ListApplicationsFilter {
  source?: NswSource;
  councilName?: string;
  /** Matches records whose development_types overlaps any of the given tags. */
  developmentTypes?: string[];
  updatedSince?: Date;
  /** Inclusive lodgement_date range, day-granularity (YYYY-MM-DD). */
  lodgementDateFrom?: string;
  lodgementDateTo?: string;
  /** Coarse pre-filter on latitude/longitude; callers do precise radius math themselves. */
  boundingBox?: GeoBoundingBox;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIST_LIMIT = 100;

export async function listApplications(
  filter: ListApplicationsFilter = {},
): Promise<NswApplicationRecord[]> {
  const conditions = [];

  if (filter.source) conditions.push(eq(nswApplications.source, filter.source));
  if (filter.councilName) conditions.push(eq(nswApplications.councilName, filter.councilName));
  if (filter.developmentTypes?.length) {
    conditions.push(arrayOverlaps(nswApplications.developmentTypes, filter.developmentTypes));
  }
  if (filter.updatedSince) {
    conditions.push(gte(nswApplications.dateLastUpdated, filter.updatedSince));
  }
  if (filter.lodgementDateFrom) {
    conditions.push(gte(nswApplications.lodgementDate, filter.lodgementDateFrom));
  }
  if (filter.lodgementDateTo) {
    conditions.push(lte(nswApplications.lodgementDate, filter.lodgementDateTo));
  }
  if (filter.boundingBox) {
    const { minLat, maxLat, minLon, maxLon } = filter.boundingBox;
    conditions.push(
      between(nswApplications.latitude, String(minLat), String(maxLat)),
      between(nswApplications.longitude, String(minLon), String(maxLon)),
    );
  }

  return db
    .select()
    .from(nswApplications)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(nswApplications.dateLastUpdated))
    .limit(filter.limit ?? DEFAULT_LIST_LIMIT)
    .offset(filter.offset ?? 0);
}

export interface SuburbCentroid {
  suburb: string;
  latitude: number;
  longitude: number;
  count: number;
}

/**
 * Suburb centroids (mean lat/lon) computed from applications matching the given
 * filter, for use as location picker options. Generic over any filter this
 * module already supports — callers supply domain-specific tags/sources.
 */
export async function listSuburbCentroids(
  filter: Pick<ListApplicationsFilter, "source" | "developmentTypes"> = {},
): Promise<SuburbCentroid[]> {
  const conditions = [
    sql`${nswApplications.suburb} is not null`,
    sql`${nswApplications.latitude} is not null`,
    sql`${nswApplications.longitude} is not null`,
  ];
  if (filter.source) conditions.push(eq(nswApplications.source, filter.source));
  if (filter.developmentTypes?.length) {
    conditions.push(arrayOverlaps(nswApplications.developmentTypes, filter.developmentTypes));
  }

  const rows = await db
    .select({
      suburb: nswApplications.suburb,
      latitude: avg(nswApplications.latitude),
      longitude: avg(nswApplications.longitude),
      count: count(),
    })
    .from(nswApplications)
    .where(and(...conditions))
    .groupBy(nswApplications.suburb)
    .orderBy(desc(count()));

  return rows.map((row) => ({
    suburb: row.suburb as string,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    count: Number(row.count),
  }));
}

/** Distinct development_types tags currently present in the data, sorted alphabetically. */
export async function listDevelopmentTypes(): Promise<string[]> {
  const rows = await db.execute<{ development_type: string }>(
    sql`select distinct unnest(development_types) as development_type from nsw_applications order by 1`,
  );

  return rows.map((row) => row.development_type);
}

export async function getApplicationByPan(pan: string): Promise<NswApplicationRecord | null> {
  const [record] = await db
    .select()
    .from(nswApplications)
    .where(eq(nswApplications.planningPortalApplicationNumber, pan))
    .limit(1);

  return record ?? null;
}

export { syncSource } from "./sync";
export type { SyncOptions, SyncResult } from "./sync";
export type { NswSource } from "./types";
