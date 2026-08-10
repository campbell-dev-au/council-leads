"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRef, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FrequencyBucketSize, LocationOption } from "@/modules/pool-lead-frequency";

interface FrequencyControlsProps {
  locationOptions: LocationOption[];
  radiusOptionsKm: number[];
  maxRadii: number;
  selectedRadiiKm: number[];
  bucket: FrequencyBucketSize;
  currentLat?: number;
  currentLon?: number;
  currentLabel: string;
}

const COORD_TOLERANCE = 1e-6;

export function FrequencyControls({
  locationOptions,
  radiusOptionsKm,
  maxRadii,
  selectedRadiiKm,
  bucket,
  currentLat,
  currentLon,
  currentLabel,
}: FrequencyControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const latRef = useRef<HTMLInputElement>(null);
  const lonRef = useRef<HTMLInputElement>(null);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const selectedIndex = locationOptions.findIndex(
    (o) =>
      currentLat !== undefined &&
      currentLon !== undefined &&
      Math.abs(o.latitude - currentLat) < COORD_TOLERANCE &&
      Math.abs(o.longitude - currentLon) < COORD_TOLERANCE,
  );

  function handleSuburbChange(value: string) {
    const option = locationOptions[Number(value)];
    if (!option) return;
    updateParams({
      lat: String(option.latitude),
      lon: String(option.longitude),
      label: option.suburb,
    });
  }

  function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    const lat = latRef.current?.value.trim();
    const lon = lonRef.current?.value.trim();
    if (!lat || !lon || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) return;
    updateParams({ lat, lon, label: "Custom location" });
  }

  function toggleRadius(km: number) {
    const isSelected = selectedRadiiKm.includes(km);
    let next: number[];
    if (isSelected) {
      next = selectedRadiiKm.filter((r) => r !== km);
    } else {
      if (selectedRadiiKm.length >= maxRadii) return;
      next = [...selectedRadiiKm, km].sort((a, b) => a - b);
    }
    updateParams({ radii: next.length ? next.join(",") : null });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Location</span>
          <Select
            value={selectedIndex >= 0 ? String(selectedIndex) : undefined}
            onValueChange={handleSuburbChange}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder={currentLabel} />
            </SelectTrigger>
            <SelectContent>
              {locationOptions.map((option, i) => (
                <SelectItem key={`${option.suburb}-${i}`} value={String(i)}>
                  {option.suburb} ({option.poolLeadCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <form onSubmit={handleManualSubmit} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Or exact coordinates</span>
          <div className="flex gap-2">
            <Input
              ref={latRef}
              name="lat"
              placeholder="Latitude"
              defaultValue={currentLat ?? ""}
              className="w-28"
            />
            <Input
              ref={lonRef}
              name="lon"
              placeholder="Longitude"
              defaultValue={currentLon ?? ""}
              className="w-28"
            />
            <Button type="submit" variant="secondary">
              Use
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Bucket</span>
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant={bucket === "month" ? "default" : "outline"}
              onClick={() => updateParams({ bucket: "month" })}
            >
              Month
            </Button>
            <Button
              type="button"
              size="sm"
              variant={bucket === "week" ? "default" : "outline"}
              onClick={() => updateParams({ bucket: "week" })}
            >
              Week
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Radius — compare up to {maxRadii}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {radiusOptionsKm.map((km) => {
            const selected = selectedRadiiKm.includes(km);
            const disabled = !selected && selectedRadiiKm.length >= maxRadii;
            return (
              <Button
                key={km}
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                disabled={disabled}
                onClick={() => toggleRadius(km)}
              >
                {km} km
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
