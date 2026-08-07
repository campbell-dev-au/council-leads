# NSW Ingestion Spec

**Status: implemented.** Schema, API client, sync logic, module query interface, and the manual CLI trigger described below exist under this directory. See §6 for the sync command.

## 1. Goal

Sync development-application data from the NSW eplanning APIs into the project's Postgres database as a normalized, queryable dataset. This module is a **pure ingestion/sync layer** — it does not decide what counts as a "pool lead" or trigger any marketing activity. That classification and any downstream action belongs to a separate module, per the architecture rule against bleeding domain logic across `/modules/`.

Scope for MVP: ingest broadly — all DA and CDC applications, all development categories, all NSW councils. Filtering down to pool-relevant leads happens downstream, not here.

## 2. Data sources

Two public, **unauthenticated** GET endpoints (`"auth": "noauth"` in the reference Postman collection), confirmed live:

- `https://api.apps1.nsw.gov.au/eplanning/data/v0/OnlineDA` — Development Applications, available since 10-12-2018.
- `https://api.apps1.nsw.gov.au/eplanning/data/v0/OnlineCDC` — Complying Development Certificates, available since 01-01-2019.

Both are updated daily per the official data dictionaries.

### 2.1 Request shape

Filtering and pagination are passed as **request headers**, not query params:

| Header | Purpose | Example |
|---|---|---|
| `PageSize` | Page size. `1000` confirmed accepted live. | `1000` |
| `PageNumber` | 1-indexed page number. | `1` |
| `filters` | JSON string of filter object. `{}` = no filter (all records). | `{ "filters": { "ApplicationLastUpdatedFrom": "2026-08-05" } }` |

Useful filters (both endpoints, unless noted): `CouncilName` (array), `ApplicationType` (array), `DevelopmentCategory` (array: Industrial/Commercial/Recreational/Residential/Other), `ApplicationStatus` (array), `CostOfDevelopmentFrom`/`To`, `LodgementDateFrom`/`To`, `SubmissionDateFrom`/`To`, `DeterminationDateFrom`/`To`, `PlanningPortalApplicationNumber` (array), `CouncilApplicationNumber` (array), `ApplicationLastUpdatedFrom`/`To`.

MVP will not set `CouncilName` (statewide) and will not filter by `DevelopmentCategory`/`ApplicationType` (broad ingest). `ApplicationLastUpdatedFrom` is used for incremental syncs (see §4).

**Filter date granularity is day-level** (`YYYY-MM-DD`), confirmed live — not timestamp-level, even though records themselves carry full timestamps (see §2.2). This matters for incremental sync correctness (§4).

### 2.2 Response shape

Confirmed live against both endpoints:

```json
{
  "PageSize": 1000,
  "PageNumber": 1,
  "TotalPages": 429,
  "TotalCount": 428123,
  "Application": [ { ...one record... } ]
}
```

Paginate by incrementing `PageNumber` until `PageNumber > TotalPages`.

### 2.3 Record fields

Every `Application` record has a flat set of core fields plus two nested arrays: `DevelopmentType[]` and `Location[]`. Fields are **sparse** — not every field is present on every record (confirmed: e.g. `AccompaniedByVPAFlag` appears on some DA records and not others).

**Shared / core fields (both DA & CDC):**

| Field | Notes |
|---|---|
| `PlanningPortalApplicationNumber` | e.g. `PAN-224869` (DA) / `CDC-71955` (CDC). Globally unique across both endpoints — confirmed live, no collisions between the two prefixes. Natural upsert key. |
| `ApplicationType` | e.g. "Development Application", "Complying Development Certificate Application", "Modification application". |
| `ApplicationStatus` | e.g. Cancelled, Determined, Under Assessment, Withdrawn, Approved, Refused, Pending lodgement, etc. (value set differs slightly between DA and CDC). |
| `CostOfDevelopment` | Number. |
| `DateLastUpdated` | Full ISO timestamp — drives incremental sync. |
| `Council.CouncilName` | Nested one level under `Council`. |
| `DevelopmentType[]` | Array of `{ "DevelopmentType": "<tag>" }`. One-to-many — an application can carry multiple tags (e.g. `["Dwelling", "Pools / decks / fencing"]`). Full observed taxonomy (18 values) includes: Dwelling, Dual occupancy, Multi-dwelling housing, Semi-attached dwelling, Secondary dwelling, Boarding house, Alterations and additions to residential/commercial development, Balconies/decks/patios/terraces/verandahs, **Pools / decks / fencing**, Garages/carports and car parking spaces, Sheds, Farm buildings, Retaining walls/protection of trees, Earthworks/change in levels, Demolition, Change of use, Subdivision of land. |
| `Location[]` | Array of address/coordinate objects: `FullAddress`, `StreetNumber1`/`2`, `StreetName`, `StreetType`, `StreetSuffix`, `Suburb`, `Postcode`, `State`, `X`/`Y` (lon/lat as strings), `Lot[]` (`Lot`, `PlanLabel`, `Section`). **Assumed single-entry in practice** based on samples — code should defensively take `Location[0]` and log if more than one entry is ever observed. |

**DA-specific fields:** `NumberOfNewDwellings`, `NumberOfStoreys`, `NumberOfExistingLots`, `NumberOfProposedLots`, `SubdivisionProposedFlag`, `SubdivisionType`, `EPIVariationProposedFlag`, `AccompaniedByVPAFlag`, `VPAStatus`, `LodgementDate`, `DeterminationAuthority`, `AssessmentExhibitionStartDate`/`EndDate`, `DevelopmentSubjectToSICFlag`, `VariationToDevelopmentStandardsApprovedFlag`, `DeterminationDate`, `ModificationApplicationNumber`.

**CDC-specific fields:** `CDCAcceptedDisplay`, `CDCApprovedDisplay`, `CertifierAccreditationNumber`, `CertifierApplicationNumber`, `BuildingCodeClass`, `BuildingCodeDescription`, `NumberOfDemolitionDwellings`, `NumberOfNewDwellings`, `NumberOfPreExistDwellings`, `NumberOfStoreys`, `ProposedModificationDescription`, `RejectReason`, `DeterminationDate`.

### 2.4 Known data-quality caveats (important for downstream consumers)

- There is **no free-text work description field** in either API. The only signal for "this application involves a swimming pool" is the `DevelopmentType` tag `"Pools / decks / fencing"`, which also covers deck-only and fence-only applications with no pool at all. Any downstream pool-lead classification built on this data will need to treat this tag as a coarse candidate filter, not a precise match — this module makes no attempt to disambiguate it.
- **`DateLastUpdated` is unrelated to `LodgementDate`.** Confirmed live: DA records lodged in January 2019 carry `DateLastUpdated` values from 2022, 2023, and even 2026 — presumably from bulk system migrations/re-indexing events, not user edits. Practical effect: date-windowing a sync by `ApplicationLastUpdatedFrom`/`To` starting near the dataset's lodgement-based "start date" (§2) yields long stretches of empty windows before hitting the actual record mass, which is unevenly clustered later in the timeline. This doesn't affect correctness (every record's current `DateLastUpdated` still falls somewhere in the walked range and gets picked up when that window is reached) — just don't expect record volume to correlate with calendar proximity to the dataset's stated start date. See §4.
- When a page's filters match zero records, the API **omits the `Application` key from the response entirely** rather than returning `[]`. The client normalizes this to an empty array — worth knowing if you're calling the raw API directly.

## 3. Data model (Postgres / Drizzle — target shape, not yet implemented)

Note: Drizzle ORM and a Postgres driver are not yet in `package.json` — adding them is part of implementing this module, not covered by this spec.

### `nsw_applications`

One row per `PlanningPortalApplicationNumber`, unified across both sources.

| Column | Type | Notes |
|---|---|---|
| `planning_portal_application_number` | text, PK | e.g. `PAN-224869` / `CDC-71955`. |
| `source` | text | `'DA' \| 'CDC'` discriminator. |
| `application_type` | text | |
| `application_status` | text | |
| `council_name` | text | |
| `cost_of_development` | numeric | |
| `full_address` | text | From `Location[0].FullAddress`. |
| `suburb` | text | |
| `postcode` | text | |
| `longitude` | numeric | From `Location[0].X`. |
| `latitude` | numeric | From `Location[0].Y`. |
| `development_types` | text[] | GIN-indexed. From `DevelopmentType[].DevelopmentType`. |
| `lodgement_date` | date | Nullable (CDC records may lack it). |
| `determination_date` | date | Nullable. |
| `date_last_updated` | timestamp | Drives incremental sync high-water mark. |
| `raw` | jsonb | Full source payload, for fields not worth normalizing individually (source-specific flags, lot details, etc.). |
| `created_at` / `updated_at` | timestamp | Row bookkeeping. |

### `nsw_ingestion_sync_state`

One row per source, tracking sync progress as a resumable checkpoint (not just an incremental high-water mark — see §4).

| Column | Type | Notes |
|---|---|---|
| `source` | text, PK | `'DA' \| 'CDC'`. |
| `last_synced_through` | date | The date this source has been fully, contiguously processed through, starting from the dataset's start date. Advances one window at a time — see §4. |
| `last_run_at` | timestamp | |
| `last_run_status` | text | `'success' \| 'failed'`. |
| `last_run_record_count` | integer | Records upserted across the most recent invocation (may span multiple windows). |

## 4. Sync algorithm

There is a single sync operation per source — no separate "backfill" vs. "incremental" modes. It always resumes from `last_synced_through` (or the source's known dataset start date — DA: 2018-12-10, CDC: 2019-01-01 — if never synced) and walks forward toward today in fixed-size date windows (default 30 days, configurable):

1. Compute the window `[cursor, cursor + windowDays]` (capped at today).
2. Filter on `ApplicationLastUpdatedFrom`/`ApplicationLastUpdatedTo` set to that window, and page through with `PageSize=1000` until `PageNumber` exceeds `TotalPages`, upserting every record on `planning_portal_application_number`.
3. Once the window is **fully** fetched and upserted, advance `cursor` to the window's end date and persist it to `last_synced_through` immediately — this is the checkpoint.
4. Repeat until `cursor` reaches today (fully caught up), or until an optional `maxWindows` cap for this invocation is hit.

This makes backfill and incremental sync the same operation: the very first run for a source starts at its dataset start date and is a "backfill"; once caught up, later runs have zero or one small window left to process and behave as an "incremental" sync. Crucially, **a single invocation never has to complete the whole history at once** — it can be capped (`--max-windows`, or just interrupted/killed) and the next invocation resumes from the last checkpointed window, not from the start. Since checkpointing only happens after a window's upserts fully succeed, an interrupted run loses at most its one in-flight window, which is cheaply redone (idempotent upsert) on the next run.

Note from live testing: because `DateLastUpdated` doesn't correlate with `LodgementDate` (§2.4), the early windows near a source's dataset start date are often empty — this is expected and harmless, just means wall-clock progress through the early history is fast (few/no records to upsert) while later windows carrying the actual record mass take longer.

Both DA and CDC are synced as independent passes through the same upsert path, distinguished only by `source` and which source-specific fields get folded into `raw`.

Reliability: retry with backoff on non-2xx responses or timeouts (NSW publishes no documented rate limit, so this is a precaution, not a response to an observed limit). `PageSize=1000` is the default — large but confirmed working; do not assume higher values are safe without testing.

## 5. Module interface

Other modules must not query `nsw_applications`/`nsw_ingestion_sync_state` directly. `nsw-ingestion` exposes a small typed query API, e.g.:

- `listApplications(filter: { developmentTypes?, councilName?, updatedSince?, ... })`
- `getApplicationByPan(pan: string)`

This keeps the ingestion module as the sole owner of its schema and lets it evolve the storage shape without breaking consumers, per the "no domain logic bleed between modules" rule in `CLAUDE.md`.

## 6. Trigger (MVP)

Manual only. Given the backfill volume (~428k DA records statewide since Dec 2018 alone; CDC comparable), a serverless HTTP route would risk hitting execution-time limits — so the MVP trigger is a **local script**, run against the docker-compose Postgres:

```
pnpm nsw-ingestion:sync [--source=DA|CDC|all] [--page-size=N] [--window-days=N] [--max-windows=N]
```

Since sync is resumable and checkpointed per window (§4), completing a full backfill doesn't require one long-running invocation — running the command repeatedly (optionally with `--max-windows` to bound each invocation) makes steady progress and always resumes from the last checkpoint. Scheduled/automated triggering (e.g. a Vercel Cron-invoked route, naturally chunked by `--max-windows` to fit serverless time limits) is explicit future work, not part of this MVP.

## 7. Non-goals

- Classifying applications as pool leads or any other lead type.
- Triggering letters or any marketing activity.
- Any UI.
- Deduplicating multiple applications against the same physical address.
- Negotiating or discovering NSW's rate limits (none documented; conservative page size + backoff is the precaution taken instead).

## 8. Open questions / assumptions

- ~~`Location[]` is assumed single-entry per application~~ — **update:** live smoke-testing during implementation found real DA records with 3 `Location` entries. The defensive fallback (`Location[0]` + a logged warning) handles this correctly, but downstream consumers should be aware some applications' `full_address`/`suburb`/etc. reflect only one of several site locations.
- Filter date granularity is day-level, confirmed live. Window boundaries are exact dates with no deliberate overlap between consecutive windows (unlike an earlier version of this design) — a boundary-date record is captured by whichever window's `ApplicationLastUpdatedTo`/next `ApplicationLastUpdatedFrom` includes it; this hasn't been stress-tested for off-by-one gaps at window edges.
- No documented rate limit was found for either endpoint; `PageSize=1000` and basic backoff are a precaution, not a response to an observed constraint. Revisit if a full backfill run hits errors.
- Record density across `DateLastUpdated` is unevenly clustered (§2.4, §4) — not yet measured where the dense clusters actually are. Worth profiling before relying on `--max-windows`-capped runs to make predictable per-invocation progress.
