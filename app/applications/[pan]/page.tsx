import Link from "next/link";
import { notFound } from "next/navigation";
import { getApplicationByPan } from "@/modules/nsw-ingestion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatDate(value: string | Date | null) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "long" }).format(date);
}

function formatCost(cost: string | null) {
  if (!cost) return "—";
  const n = Number(cost);
  if (Number.isNaN(n)) return cost;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export default async function ApplicationDetail({
  params,
}: {
  params: Promise<{ pan: string }>;
}) {
  const { pan } = await params;
  const app = await getApplicationByPan(pan);

  if (!app) notFound();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <div>
        <Link href="/" className="text-sm text-primary hover:underline">
          ← Back to all applications
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">
          {app.planningPortalApplicationNumber}
        </h1>
        <Badge variant={app.source === "DA" ? "default" : "secondary"}>
          {app.source}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Application</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Type" value={app.applicationType ?? "—"} />
          <Field label="Status" value={app.applicationStatus ?? "—"} />
          <Field label="Council" value={app.councilName ?? "—"} />
          <Field label="Cost of development" value={formatCost(app.costOfDevelopment)} />
          <Field label="Lodgement date" value={formatDate(app.lodgementDate)} />
          <Field label="Determination date" value={formatDate(app.determinationDate)} />
          <Field label="Last updated" value={formatDate(app.dateLastUpdated)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Address" value={app.fullAddress ?? "—"} />
          <Field label="Suburb" value={app.suburb ?? "—"} />
          <Field label="Postcode" value={app.postcode ?? "—"} />
          <Field label="Latitude" value={app.latitude ?? "—"} />
          <Field label="Longitude" value={app.longitude ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Development types</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {app.developmentTypes.length === 0 && (
            <span className="text-sm text-muted-foreground">None recorded.</span>
          )}
          {app.developmentTypes.map((t) => (
            <Badge key={t} variant="outline" className="h-auto whitespace-normal break-words text-left">
              {t}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw source payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
            {JSON.stringify(app.raw, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </main>
  );
}
