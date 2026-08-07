import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const nswApplications = pgTable(
  "nsw_applications",
  {
    planningPortalApplicationNumber: text("planning_portal_application_number").primaryKey(),
    source: text("source", { enum: ["DA", "CDC"] }).notNull(),
    applicationType: text("application_type"),
    applicationStatus: text("application_status"),
    councilName: text("council_name"),
    costOfDevelopment: numeric("cost_of_development"),
    fullAddress: text("full_address"),
    suburb: text("suburb"),
    postcode: text("postcode"),
    longitude: numeric("longitude"),
    latitude: numeric("latitude"),
    developmentTypes: text("development_types").array().notNull().default([]),
    lodgementDate: date("lodgement_date"),
    determinationDate: date("determination_date"),
    dateLastUpdated: timestamp("date_last_updated", { withTimezone: true }).notNull(),
    raw: jsonb("raw").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("nsw_applications_development_types_idx").using("gin", table.developmentTypes),
    index("nsw_applications_council_name_idx").on(table.councilName),
    index("nsw_applications_date_last_updated_idx").on(table.dateLastUpdated),
  ],
);

export const nswIngestionSyncState = pgTable("nsw_ingestion_sync_state", {
  source: text("source", { enum: ["DA", "CDC"] }).primaryKey(),
  lastSyncedThrough: date("last_synced_through"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastRunStatus: text("last_run_status", { enum: ["success", "failed"] }),
  lastRunRecordCount: integer("last_run_record_count"),
});
