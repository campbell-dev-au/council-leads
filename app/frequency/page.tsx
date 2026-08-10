import Link from "next/link";
import { Suspense } from "react";
import {
  estimateFrequency,
  listLocationOptions,
  type FrequencyBucketSize,
} from "@/modules/pool-lead-frequency";
import { FrequencyControls } from "@/components/frequency-controls";
import { FrequencyDashboard } from "@/components/frequency-chart";

const DEFAULT_RADII_KM = [5, 10, 20];
const MAX_RADII = 4;
const RADIUS_OPTIONS_KM = [2, 5, 10, 20, 50];

function parseRadii(raw: string | undefined): number[] {
  if (!raw) return DEFAULT_RADII_KM;
  const parsed = raw
    .split(",")
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  const unique = [...new Set(parsed)].sort((a, b) => a - b).slice(0, MAX_RADII);
  return unique.length ? unique : DEFAULT_RADII_KM;
}

export default async function FrequencyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const lat = typeof sp.lat === "string" ? Number(sp.lat) : undefined;
  const lon = typeof sp.lon === "string" ? Number(sp.lon) : undefined;
  const label = typeof sp.label === "string" ? sp.label : undefined;
  const bucket: FrequencyBucketSize = sp.bucket === "week" ? "week" : "month";
  const radiiKm = parseRadii(typeof sp.radii === "string" ? sp.radii : undefined);

  const locationOptions = await listLocationOptions();
  const fallback = locationOptions[0];

  const center =
    lat !== undefined && lon !== undefined && Number.isFinite(lat) && Number.isFinite(lon)
      ? { lat, lon }
      : fallback
        ? { lat: fallback.latitude, lon: fallback.longitude }
        : undefined;
  const activeLabel = label ?? fallback?.suburb ?? "selected location";

  const estimate = center ? await estimateFrequency({ center, radiiKm, bucket }) : null;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pool lead frequency</h1>
          <p className="text-sm text-muted-foreground">
            Estimated rate of new pool-installation CDC records, by location and radius.
          </p>
        </div>
        <Link href="/" className="shrink-0 text-sm text-primary hover:underline">
          ← Browse applications
        </Link>
      </div>

      <Suspense>
        <FrequencyControls
          locationOptions={locationOptions}
          radiusOptionsKm={RADIUS_OPTIONS_KM}
          maxRadii={MAX_RADII}
          selectedRadiiKm={radiiKm}
          bucket={bucket}
          currentLat={center?.lat}
          currentLon={center?.lon}
          currentLabel={activeLabel}
        />
      </Suspense>

      {estimate ? (
        <FrequencyDashboard estimate={estimate} label={activeLabel} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No suburbs with enough pool-CDC history yet to suggest a location — try syncing more data or entering
          coordinates manually.
        </p>
      )}
    </main>
  );
}
