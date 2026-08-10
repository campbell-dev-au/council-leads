"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { FrequencyEstimate } from "@/modules/pool-lead-frequency";

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

function radiusColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

function formatBucketLabel(bucketStart: string, bucket: "week" | "month"): string {
  const date = new Date(`${bucketStart}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: bucket === "week" ? "numeric" : undefined,
    year: bucket === "month" ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}

interface TooltipPayloadEntry {
  dataKey: string;
  value: number;
  color: string;
  name: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1.5 font-medium text-foreground">{label}</div>
      <div className="flex flex-col gap-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-3 shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="tabular-nums font-semibold text-foreground">{entry.value}</span>
            <span className="text-muted-foreground">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatRate(n: number): string {
  return n.toLocaleString("en-AU", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

export function FrequencyDashboard({
  estimate,
  label,
}: {
  estimate: FrequencyEstimate;
  label: string;
}) {
  const bucketStarts = estimate.radii[0]?.buckets.map((b) => b.bucketStart) ?? [];
  const chartData = bucketStarts.map((bucketStart, i) => {
    const point: Record<string, string | number> = {
      bucketStart,
      bucketLabel: formatBucketLabel(bucketStart, estimate.bucket),
    };
    for (const r of estimate.radii) {
      point[`r${r.radiusKm}`] = r.buckets[i]?.count ?? 0;
    }
    return point;
  });

  const widest = estimate.radii[estimate.radii.length - 1];
  const dateRangeLabel = `${estimate.dateFrom} to ${estimate.dateTo}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {estimate.radii.map((r, i) => (
          <Card key={r.radiusKm}>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-3 shrink-0"
                  style={{ backgroundColor: radiusColor(i) }}
                />
                Within {r.radiusKm} km of {label}
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {formatRate(r.avgPerMonth)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ month</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <div className="tabular-nums">{formatRate(r.avgPerWeek)} / week</div>
              <div className="tabular-nums">{r.datedCount.toLocaleString()} dated leads in range</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New pool-lead CDC records over time</CardTitle>
          <CardDescription>
            {dateRangeLabel} · bucketed by {estimate.bucket} · centered on {label}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 sm:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="bucketLabel"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
                <Legend
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
                />
                {estimate.radii.map((r, i) => (
                  <Line
                    key={r.radiusKm}
                    type="monotone"
                    dataKey={`r${r.radiusKm}`}
                    name={`${r.radiusKm} km`}
                    stroke={radiusColor(i)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {widest.undatedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {widest.undatedCount.toLocaleString()} pool-CDC record{widest.undatedCount === 1 ? "" : "s"} within{" "}
          {widest.radiusKm} km {widest.undatedCount === 1 ? "has" : "have"} no lodgement date in the source data
          and {widest.undatedCount === 1 ? "is" : "are"} excluded from the time series above (counted in the
          all-time total below instead).
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Data table</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-1.5 pr-4 font-medium">Bucket</th>
                {estimate.radii.map((r) => (
                  <th key={r.radiusKm} className="py-1.5 pr-4 text-right font-medium tabular-nums">
                    {r.radiusKm} km
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chartData.map((point) => (
                <tr key={point.bucketStart as string} className="border-b last:border-0">
                  <td className="py-1 pr-4">{point.bucketLabel as string}</td>
                  {estimate.radii.map((r) => (
                    <td key={r.radiusKm} className="py-1 pr-4 text-right tabular-nums">
                      {point[`r${r.radiusKm}`]}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-1.5 pr-4">All-time total (any date)</td>
                {estimate.radii.map((r) => (
                  <td key={r.radiusKm} className="py-1.5 pr-4 text-right tabular-nums">
                    {r.totalAllTime.toLocaleString()}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
