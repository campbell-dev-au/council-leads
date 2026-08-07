import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./modules/nsw-ingestion/db/schema.ts",
  out: "./modules/nsw-ingestion/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
