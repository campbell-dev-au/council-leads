CREATE TABLE "nsw_applications" (
	"planning_portal_application_number" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"application_type" text,
	"application_status" text,
	"council_name" text,
	"cost_of_development" numeric,
	"full_address" text,
	"suburb" text,
	"postcode" text,
	"longitude" numeric,
	"latitude" numeric,
	"development_types" text[] DEFAULT '{}' NOT NULL,
	"lodgement_date" date,
	"determination_date" date,
	"date_last_updated" timestamp with time zone NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nsw_ingestion_sync_state" (
	"source" text PRIMARY KEY NOT NULL,
	"last_synced_through" date,
	"last_run_at" timestamp with time zone,
	"last_run_status" text,
	"last_run_record_count" integer
);
--> statement-breakpoint
CREATE INDEX "nsw_applications_development_types_idx" ON "nsw_applications" USING gin ("development_types");--> statement-breakpoint
CREATE INDEX "nsw_applications_council_name_idx" ON "nsw_applications" USING btree ("council_name");--> statement-breakpoint
CREATE INDEX "nsw_applications_date_last_updated_idx" ON "nsw_applications" USING btree ("date_last_updated");