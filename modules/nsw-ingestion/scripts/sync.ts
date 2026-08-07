import { syncSource } from "../sync";
import type { NswSource } from "../types";

interface ParsedArgs {
  source: NswSource | "all";
  pageSize?: number;
  windowDays?: number;
  maxWindows?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { source: "all" };

  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");

    switch (key) {
      case "source": {
        if (value !== "DA" && value !== "CDC" && value !== "all") {
          throw new Error(`Invalid --source: ${value}. Expected DA, CDC, or all.`);
        }
        args.source = value;
        break;
      }
      case "page-size": {
        args.pageSize = Number(value);
        break;
      }
      case "window-days": {
        args.windowDays = Number(value);
        break;
      }
      case "max-windows": {
        args.maxWindows = Number(value);
        break;
      }
      default:
        throw new Error(`Unknown argument: --${key}`);
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources: NswSource[] = args.source === "all" ? ["DA", "CDC"] : [args.source];

  for (const source of sources) {
    console.log(`[nsw-ingestion] starting sync for ${source}...`);
    const result = await syncSource(source, {
      pageSize: args.pageSize,
      windowDays: args.windowDays,
      maxWindows: args.maxWindows,
    });
    console.log(
      `[nsw-ingestion] finished ${source}: windows=${result.windowCount} records=${result.recordCount} ` +
        `syncedThrough=${result.syncedThrough} caughtUp=${result.caughtUp}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[nsw-ingestion] sync failed:", error);
    process.exit(1);
  });
