import type { PropertyView } from "@visamp/player";
import type { MarketplaceControl } from "@/lib/types";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseMarketplaceControls(value: unknown): MarketplaceControl[] {
  if (!Array.isArray(value)) return [];

  const result: MarketplaceControl[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const prop = typeof row.prop === "string" ? row.prop.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!prop || !label || seen.has(prop)) continue;

    if (row.kind === "number") {
      const control: MarketplaceControl = { prop, label, kind: "number" };
      if (finite(row.min)) control.min = row.min;
      if (finite(row.max)) control.max = row.max;
      if (finite(row.step) && row.step > 0) control.step = row.step;
      if (
        control.min !== undefined &&
        control.max !== undefined &&
        control.min > control.max
      )
        continue;
      result.push(control);
    } else if (
      row.kind === "boolean" ||
      row.kind === "colour" ||
      row.kind === "text"
    ) {
      result.push({ prop, label, kind: row.kind });
    } else {
      continue;
    }

    seen.add(prop);
  }

  return result;
}

export function controlForProperty(
  property: PropertyView,
): MarketplaceControl | null {
  const base = { prop: property.name, label: property.name };

  switch (property.type) {
    case "integer":
    case "float":
      return { ...base, kind: "number" };
    case "boolean":
      return { ...base, kind: "boolean" };
    case "color":
      return { ...base, kind: "colour" };
    case "string":
      return { ...base, kind: "text" };
    default:
      return null;
  }
}
