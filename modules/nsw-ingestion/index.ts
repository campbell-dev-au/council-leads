import { and, arrayOverlaps, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "./db/client";
import { nswApplications } from "./db/schema";
import type { NswSource } from "./types";

/**
 * Public interface for the nsw-ingestion module. Other modules must consume
 * NSW application data through these functions, not by querying
 * nsw_applications / nsw_ingestion_sync_state directly — see SPEC.md §5.
 */

export type NswApplicationRecord = typeof nswApplications.$inferSelect;

export interface ListApplicationsFilter {
  source?: NswSource;
  councilName?: string;
  /** Matches records whose development_types overlaps any of the given tags. */
  developmentTypes?: string[];
  updatedSince?: Date;
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

  return db
    .select()
    .from(nswApplications)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(nswApplications.dateLastUpdated))
    .limit(filter.limit ?? DEFAULT_LIST_LIMIT)
    .offset(filter.offset ?? 0);
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
