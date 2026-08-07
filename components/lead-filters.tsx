"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

export function LeadFilters({ developmentTypes }: { developmentTypes: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const councilRef = useRef<HTMLInputElement>(null);

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleCouncilSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateParam("council", councilRef.current?.value.trim() || null);
  }

  function reset() {
    router.push(pathname);
  }

  const hasFilters =
    searchParams.has("source") ||
    searchParams.has("type") ||
    searchParams.has("council");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Source</span>
        <Select
          value={searchParams.get("source") ?? ALL}
          onValueChange={(v) => updateParam("source", v)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sources</SelectItem>
            <SelectItem value="DA">DA</SelectItem>
            <SelectItem value="CDC">CDC</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Development type
        </span>
        <Select
          value={searchParams.get("type") ?? ALL}
          onValueChange={(v) => updateParam("type", v)}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {developmentTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <form onSubmit={handleCouncilSubmit} className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Council name
        </span>
        <div className="flex gap-2">
          <Input
            ref={councilRef}
            name="council"
            placeholder="e.g. Northern Beaches Council"
            defaultValue={searchParams.get("council") ?? ""}
            className="w-64"
          />
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </div>
      </form>

      {hasFilters && (
        <Button type="button" variant="ghost" onClick={reset}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
