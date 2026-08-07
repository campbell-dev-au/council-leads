import { eq, sql } from "drizzle-orm";
import { iterateApplications } from "./api-client";
import { db } from "./db/client";
import { nswApplications, nswIngestionSyncState } from "./db/schema";
import type { NswApiFilters, NswRawApplication, NswSource } from "./types";

type NswApplicationInsert = typeof nswApplications.$inferInsert;

/**
 * Earliest date each source's dataset covers, per the official data
 * dictionaries (SPEC.md §2). Used as the starting cursor for a source that
 * has never been synced.
 */
const SOURCE_START_DATE: Record<NswSource, string> = {
  DA: "2018-12-10",
  CDC: "2019-01-01",
};

const DEFAULT_WINDOW_DAYS = 30;

function normalize(raw: NswRawApplication, source: NswSource): NswApplicationInsert {
  const locations = raw.Location ?? [];
  if (locations.length > 1) {
    console.warn(
      `[nsw-ingestion] ${raw.PlanningPortalApplicationNumber} has ${locations.length} Location entries; using the first.`,
    );
  }
  const location = locations[0];

  const developmentTypes = (raw.DevelopmentType ?? [])
    .map((dt) => dt.DevelopmentType)
    .filter((value): value is string => Boolean(value));

  return {
    planningPortalApplicationNumber: raw.PlanningPortalApplicationNumber,
    source,
    applicationType: raw.ApplicationType ?? null,
    applicationStatus: raw.ApplicationStatus ?? null,
    councilName: raw.Council?.CouncilName ?? null,
    costOfDevelopment: raw.CostOfDevelopment != null ? String(raw.CostOfDevelopment) : null,
    fullAddress: location?.FullAddress ?? null,
    suburb: location?.Suburb ?? null,
    postcode: location?.Postcode ?? null,
    longitude: location?.X ?? null,
    latitude: location?.Y ?? null,
    developmentTypes,
    lodgementDate: raw.LodgementDate ?? null,
    determinationDate: raw.DeterminationDate ?? null,
    dateLastUpdated: new Date(raw.DateLastUpdated),
    raw,
    updatedAt: new Date(),
  };
}

async function upsertBatch(rows: NswApplicationInsert[]): Promise<void> {
  if (rows.length === 0) return;

  await db
    .insert(nswApplications)
    .values(rows)
    .onConflictDoUpdate({
      target: nswApplications.planningPortalApplicationNumber,
      set: {
        source: sql`excluded.source`,
        applicationType: sql`excluded.application_type`,
        applicationStatus: sql`excluded.application_status`,
        councilName: sql`excluded.council_name`,
        costOfDevelopment: sql`excluded.cost_of_development`,
        fullAddress: sql`excluded.full_address`,
        suburb: sql`excluded.suburb`,
        postcode: sql`excluded.postcode`,
        longitude: sql`excluded.longitude`,
        latitude: sql`excluded.latitude`,
        developmentTypes: sql`excluded.development_types`,
        lodgementDate: sql`excluded.lodgement_date`,
        determinationDate: sql`excluded.determination_date`,
        dateLastUpdated: sql`excluded.date_last_updated`,
        raw: sql`excluded.raw`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function persistSyncState(
  source: NswSource,
  status: "success" | "failed",
  syncedThrough: string,
  recordCount: number,
): Promise<void> {
  await db
    .insert(nswIngestionSyncState)
    .values({
      source,
      lastSyncedThrough: syncedThrough,
      lastRunAt: new Date(),
      lastRunStatus: status,
      lastRunRecordCount: recordCount,
    })
    .onConflictDoUpdate({
      target: nswIngestionSyncState.source,
      set: {
        lastSyncedThrough: sql`excluded.last_synced_through`,
        lastRunAt: sql`excluded.last_run_at`,
        lastRunStatus: sql`excluded.last_run_status`,
        lastRunRecordCount: sql`excluded.last_run_record_count`,
      },
    });
}

export interface SyncOptions {
  pageSize?: number;
  /** Size of each date window processed, in days. Smaller = more frequent
   * checkpoints (finer-grained resumability) but more API requests. */
  windowDays?: number;
  /**
   * Caps how many date-windows this invocation processes. Lets one backfill
   * be completed across many small, resumable runs — each run picks up
   * exactly where the previous one checkpointed — instead of a single
   * long-running pass over the entire history. Omit to run until fully
   * caught up to today.
   */
  maxWindows?: number;
}

export interface SyncResult {
  source: NswSource;
  windowCount: number;
  recordCount: number;
  /** The date this source is now synced through. */
  syncedThrough: string;
  /** True if no windows remain — the source is fully caught up to today. */
  caughtUp: boolean;
}

/**
 * Syncs `source` forward from wherever it last left off (or the dataset's
 * start date, if never synced) up to today, one bounded date-window at a
 * time. Each window is fully fetched and upserted before its checkpoint is
 * persisted to nsw_ingestion_sync_state — so an interrupted, killed, or
 * deliberately capped (`maxWindows`) run only ever redoes at most its most
 * recent incomplete window on the next invocation, never the whole history.
 *
 * Once a source is caught up, later invocations naturally behave as an
 * incremental sync: there's little or no remaining window to process.
 */
export async function syncSource(source: NswSource, options: SyncOptions = {}): Promise<SyncResult> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  if (windowDays <= 0) {
    throw new Error(`windowDays must be positive, got ${windowDays}`);
  }

  const [state] = await db
    .select()
    .from(nswIngestionSyncState)
    .where(eq(nswIngestionSyncState.source, source));

  let cursor = state?.lastSyncedThrough ?? SOURCE_START_DATE[source];
  const horizon = todayDateString();

  let recordCount = 0;
  let windowCount = 0;

  try {
    while (cursor < horizon) {
      if (options.maxWindows && windowCount >= options.maxWindows) break;

      const windowTo = addDays(cursor, windowDays) < horizon ? addDays(cursor, windowDays) : horizon;
      const filters: NswApiFilters = {
        ApplicationLastUpdatedFrom: cursor,
        ApplicationLastUpdatedTo: windowTo,
      };

      for await (const page of iterateApplications(source, filters, options.pageSize)) {
        const rows = page.map((raw) => normalize(raw, source));
        await upsertBatch(rows);
        recordCount += rows.length;
      }

      cursor = windowTo;
      windowCount += 1;

      // Checkpoint after every window, not just at the end of the run, so
      // progress survives an interruption partway through a long backfill.
      await persistSyncState(source, "success", cursor, recordCount);
    }

    return { source, windowCount, recordCount, syncedThrough: cursor, caughtUp: cursor >= horizon };
  } catch (error) {
    // `cursor` still reflects the last successfully checkpointed window —
    // record the failed attempt without rewinding or advancing it.
    await persistSyncState(source, "failed", cursor, recordCount);
    throw error;
  }
}
