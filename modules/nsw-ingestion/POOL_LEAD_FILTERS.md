# Pool Lead Filtering — Query Findings

**Status:** research notes from querying the synced `nsw_applications` table. This is
analysis to inform a downstream classification module — it does not itself change
`nsw-ingestion` (per its non-goal of classifying leads, see `SPEC.md` §7).

Data snapshot at time of writing: 401,023 DA records (fully synced to 2026-06-27) and
~223k CDC records (still catching up — CDC sync progressed from ~139k to ~223k rows over
the course of this analysis). Numbers below will shift further as CDC finishes
backfilling, but the shape of the findings should hold.

**Note:** this document was written and then reconciled against a separate,
concurrently-committed change to `SPEC.md` (`0cafce0`) that reached a materially
different conclusion — that DA has no dedicated pool tag at all, only the coarse
`Pools / decks / fencing` bucket. That conclusion was based on data that hadn't yet
picked up DA's post-2023 taxonomy change; re-querying confirms DA **does** have a
dedicated `Swimming pool` tag (10,921 records, 2023 onward), mirroring the same
pre-/post-2023 split CDC shows. `SPEC.md` has been corrected to match. The
`Portable swimming pools and spas and child-resistant barriers` CDC tag (607 records)
that the other change surfaced is folded into the filters below.

## 1. Headline finding: SPEC.md's development-type taxonomy is outdated

`SPEC.md` §2.3 documents an 18-value `DevelopmentType` taxonomy with a single pool-related
tag, `"Pools / decks / fencing"`. That was true of the *older* data, but NSW changed the
taxonomy mid-2023 to split combined tags into granular ones. Live data now contains
**both** vocabularies, split cleanly by time, not by council:

| Tag | Source | Active period | Count |
|---|---|---|---|
| `Pools / decks / fencing` | DA | ~2019–2023 (dies off after 2023) | 27,891 |
| `Swimming pool` | DA | 2023–present | 10,921 |
| `Swimming pools` (plural) | CDC | ~2019–2023 | 17,342 |
| `Swimming pool` (singular) | CDC | 2023–present | 13,927 |
| `Portable swimming pools and spas and child-resistant barriers` | CDC | throughout | 607 |

Confirmed via `lodgement_date` year breakdown (query in Appendix) and confirmed this is a
taxonomy transition, not a council split — 123 of 125 councils that ever used
`Pools / decks / fencing` also used `Swimming pool` in later records, and the zero overlap
between the two tags *within DA* (checked directly) shows they were never both applied to
the same record at once.

**Practical implication:** any pool-lead filter must OR across all four tag spellings —
`Pools / decks / fencing`, `Swimming pool`, `Swimming pools` — to get full historical
coverage. A filter written against only `Swimming pool` (the "obvious" tag) silently
drops all pre-2023 DA/CDC records.

Also worth noting: newer records separate decks (`Balconies, decks, patios, terraces or
verandahs` / `Balcony, deck, patio, terrace or verandah`) and fences (`Fences`) into their
own tags. So post-2023 data is actually *more* precise than SPEC.md's caveat suggests —
`Swimming pool` alone, without the old catch-all, is a cleaner pool-specific signal for
recent applications.

## 2. `Pools / decks / fencing` alone is not a strong precision filter, but combined-tag + cost narrows it well

Across DA records tagged `Pools / decks / fencing` (pre-2023, where deck/fence-only jobs
are mixed in with real pools), median `cost_of_development` is $86,000 — well above what a
deck- or fence-only job typically costs, suggesting the bulk of even the old combined tag
*is* genuinely pool work. But the tail matters:

- **Cost = 0**: 372 pool-tagged, non-modification, non-withdrawn records have
  `cost_of_development = 0`. This looks like a placeholder/unreported value, not a real
  $0 job — excluding it loses <1% of candidates.
- **Cost > $1M**: pool-tagged records at the high end are almost entirely hotels, seniors
  housing, tourist accommodation, and residential flat buildings with an incidental pool
  (e.g. a $865M mixed-use development at Manly Vale tagged `Swimming pool` among 7 other
  tags). These are not single-dwelling homeowner leads.
- A **`cost_of_development BETWEEN 8000 AND 500000`** band, combined with excluding
  co-occurring commercial/tourism tags (`Hotel or motel accommodation`,
  `Serviced apartment`, `Tourist and visitor accommodation`, `Function centre`,
  `Residential flat building`, `Seniors housing`, `Commercial development`,
  `Recreation/Tourist Premise`), removes the large-project false positives while keeping
  ~99% of the plausible residential-cost mass.

## 3. Excluding "Modification" application types matters

`application_type` includes `Modification Application` and `Modification to Complying
Development Certificate` — amendments to an already-lodged application, not a fresh lead.
Among pool-tagged records these account for a meaningful share (thousands) and, left in,
would generate duplicate/stale mailers for a lead already actioned on the original
application. Recommend excluding `application_type IN ('Modification Application',
'Modification to Complying Development Certificate', 'Review of determination')`.

## 4. `application_status` is a reliable "in-progress/dead" filter, but DA can't tell you approved vs refused

- **CDC** has a clean, usable status set: `Approved` (114,946 of all CDC records),
  `Declined`, `Refused`, `Withdrawn`, `Cancelled`, `Submitted`, `Under Assessment`, etc.
  Filtering to `Approved` is a precise, direct proxy for "this pool is going ahead."
- **DA** effectively does not distinguish approval outcome. 328,072 of 401,023 DA records
  (82%) sit in the single status `Determined`, which per NSW's own status set is supposed
  to sit alongside `Approved`/`Refused` as siblings — but those two barely appear at all
  in practice (`Approved`: 1 record; `Refused`: 4 records, statewide, ever). No other field
  in the raw payload (checked: no `Outcome`/`Decision`/`Result`/`Approved`-style field
  beyond the two flags already normalized) recovers this. **This is a genuine data-quality
  gap for DA specifically** — a `Determined` DA pool application could be an approval or a
  refusal, and the synced dataset cannot tell you which. `DeterminationDate` being present
  is the best available proxy that the council actually acted on it, but not for which way.
  This matches the caveat already flagged in `SPEC.md` §2.4 about coarse signal quality,
  extended here to determination outcome specifically.
- Recommend excluding the unambiguous non-starters (`Withdrawn`, `Cancelled`, `Rejected`,
  `Declined`, `Refused`) rather than trying to positively filter to "approved" for DA, and
  treating `Approved`-status CDC records as the higher-confidence half of the lead set.

## 5. Distinguishing "new pool" from "pool bundled into a new-home build"

For marketing purposes, a homeowner retrofitting a pool onto an *existing* dwelling is a
meaningfully different lead than a builder including a pool in a new house/subdivision
package (the homeowner in the latter case is dealing with their builder, not shopping for
a pool installer directly). Checking co-occurring tags:

- Of 29,582 non-modification `Swimming pool`/`Swimming pools`-tagged records, 4,294 (~15%)
  also carry a new-build tag (`Dwelling`, `Dwelling house`, `Multi-dwelling housing`,
  `Dual occupancy`, `Subdivision`, `Subdivision of land`).
- The remaining ~85% (25,288) have no new-build co-tag, and of those, `NumberOfNewDwellings`
  (a DA-specific field) is null on 96% of them and 0–2 on the rest — consistent with
  retrofit/existing-home work, not fresh construction.
- Recommend treating "no new-build co-tag" as the primary target segment, with the
  bundled-new-build segment as a lower-priority/secondary list if pursued at all.

## 6. Recommended composite filter

```sql
development_types && ARRAY[
  'Pools / decks / fencing', 'Swimming pool', 'Swimming pools',
  'Portable swimming pools and spas and child-resistant barriers'
]
AND application_type NOT IN (
  'Modification Application',
  'Modification to Complying Development Certificate',
  'Review of determination'
)
AND application_status NOT IN ('Withdrawn', 'Cancelled', 'Rejected', 'Declined', 'Refused')
AND cost_of_development BETWEEN 8000 AND 500000
AND NOT (development_types && ARRAY[
  'Hotel or motel accommodation', 'Serviced apartment',
  'Tourist and visitor accommodation', 'Function centre',
  'Residential flat building', 'Seniors housing',
  'Commercial development', 'Recreation/Tourist Premise'
])
```

Current yield against synced data: **22,086 DA + 22,935 CDC = 45,021 candidate records**
statewide since ~2019 (CDC's share is still climbing as its backfill continues — rerun
this query once `nsw_ingestion_sync_state` shows CDC caught up). §5's new-build-bundle
exclusion narrows this further to a "homeowner retrofit" segment; re-run that query
against current data before relying on an exact number, since it was measured before
CDC's sync had reached its current row count.

None of this is a precise pool-installation signal (per SPEC.md §2.4, there's no free-text
description field in either API) — it's a best-effort coarse filter. Expect meaningful
false-positive rate from fence/deck-only jobs still carrying the old combined tag, and
some false negatives from sparse/missing `DevelopmentType` tagging (1,010 CDC records have
an entirely empty `development_types` array).

## 7. Recommendations for additional data sources

1. **NSW Spatial Services / council DA tracker outcome data**, if available, to close the
   DA approval/refusal gap in §4 — the eplanning API's `Determined` status is not enough
   on its own to know whether a pool DA was actually approved. Some individual council
   e-planning portals (separate from the statewide API) do expose an explicit
   outcome/decision field per DA — worth checking whether any of the high-volume pool
   councils (Central Coast, Northern Beaches, Sutherland Shire, Lake Macquarie — the top
   4 by pool-tagged DA volume) publish this and whether it's scrapeable.
2. **NSW Valuer General / property sales & valuation data**, joined on address, to filter
   out leads at addresses that are recently-sold vacant land or currently under separate
   new-dwelling construction — cross-checking §5's bundled-new-build heuristic against a
   ground-truth property record rather than inferring it from co-occurring tags alone.
3. **A geocoded property/parcel dataset (e.g. NSW Cadastre or the `Lot`/`PlanLabel` data
   already present in `raw.Location[].Lot[]`)** to deduplicate applications against the
   same physical address/lot — SPEC.md §7 explicitly calls this out as a non-goal of the
   ingestion module, but it matters for lead gen: a single address can have multiple
   applications (e.g. an initial DA plus a later Modification, or a rejected DA followed
   by a resubmitted one) and today each would generate a separate, redundant mailer.
4. **Real-time/near-daily status change tracking**, since `date_last_updated` doesn't
   correlate with `lodgement_date` (SPEC.md §2.4) — worth building a small "status
   transition" table downstream (e.g. did this PAN move to `Approved` since we last saw
   it?) so marketing triggers fire on the approval event, not just presence in a filtered
   snapshot. This is a downstream-module concern, not a new external data source, but
   flagging it here since it interacts directly with the DA approval-ambiguity gap in §4.

## Appendix: queries run

All queries run directly against the local docker-compose Postgres
(`postgres://postgres:localpassword@localhost:5433/council_leads`) as of this writing.
See git history / session transcript for the full query list; key ones:

```sql
-- tag prevalence by source
select source,
  count(*) filter (where 'Pools / decks / fencing' = any(development_types)),
  count(*)
from nsw_applications group by source;

-- taxonomy shift over time
select extract(year from lodgement_date) as yr, count(*)
from nsw_applications
where source='DA' and 'Pools / decks / fencing' = any(development_types)
group by 1 order by 1;

-- cost distribution for pool-tagged records
select percentile_cont(0.5) within group (order by cost_of_development)
from nsw_applications
where source='DA' and 'Swimming pool' = any(development_types);
```
