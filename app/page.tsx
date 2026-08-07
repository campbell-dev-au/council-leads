import Link from "next/link";
import { Suspense } from "react";
import { listApplications, listDevelopmentTypes, type NswSource } from "@/modules/nsw-ingestion";
import { LeadFilters } from "@/components/lead-filters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const PAGE_SIZE = 25;

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

function formatDate(value: string | Date | null) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
  }).format(date);
}

function buildHref(searchParams: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  if (searchParams.source) params.set("source", searchParams.source);
  if (searchParams.type) params.set("type", searchParams.type);
  if (searchParams.council) params.set("council", searchParams.council);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const source = typeof sp.source === "string" ? (sp.source as NswSource) : undefined;
  const developmentType = typeof sp.type === "string" ? sp.type : undefined;
  const councilName = typeof sp.council === "string" ? sp.council : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const [records, developmentTypes] = await Promise.all([
    listApplications({
      source,
      councilName,
      developmentTypes: developmentType ? [developmentType] : undefined,
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listDevelopmentTypes(),
  ]);

  const hasNext = records.length > PAGE_SIZE;
  const rows = records.slice(0, PAGE_SIZE);

  const plainSearchParams = {
    source: typeof sp.source === "string" ? sp.source : undefined,
    type: typeof sp.type === "string" ? sp.type : undefined,
    council: typeof sp.council === "string" ? sp.council : undefined,
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">NSW Development Applications</h1>
        <p className="text-sm text-muted-foreground">
          Browsing data synced from the NSW eplanning DA/CDC APIs.
        </p>
      </div>

      <Suspense>
        <LeadFilters developmentTypes={developmentTypes} />
      </Suspense>
      <p className="-mt-4 text-xs text-muted-foreground">
        Council name filters on an exact match.
      </p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PAN</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Council</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Types</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Lodged</TableHead>
              <TableHead>Last updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No applications match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.planningPortalApplicationNumber}>
                <TableCell className="font-mono text-xs">
                  <Link
                    href={`/applications/${row.planningPortalApplicationNumber}`}
                    className="text-primary hover:underline"
                  >
                    {row.planningPortalApplicationNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={row.source === "DA" ? "default" : "secondary"}>
                    {row.source}
                  </Badge>
                </TableCell>
                <TableCell>{row.applicationStatus ?? "—"}</TableCell>
                <TableCell>{row.councilName ?? "—"}</TableCell>
                <TableCell className="max-w-64 truncate whitespace-nowrap">
                  {row.fullAddress ?? "—"}
                  {row.suburb ? `, ${row.suburb}` : ""}
                </TableCell>
                <TableCell className="max-w-64 whitespace-normal align-top">
                  <div className="flex flex-wrap gap-1 py-1">
                    {row.developmentTypes.map((t) => (
                      <Badge
                        key={t}
                        variant="outline"
                        className="h-auto whitespace-normal break-words text-left"
                      >
                        {t}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{formatCost(row.costOfDevelopment)}</TableCell>
                <TableCell>{formatDate(row.lodgementDate)}</TableCell>
                <TableCell>{formatDate(row.dateLastUpdated)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={buildHref(plainSearchParams, page - 1)}
              aria-disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
          <PaginationItem className="px-3 text-sm text-muted-foreground">
            Page {page}
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href={buildHref(plainSearchParams, page + 1)}
              aria-disabled={!hasNext}
              className={!hasNext ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </main>
  );
}
