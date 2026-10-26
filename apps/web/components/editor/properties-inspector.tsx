"use client";

import { useEffect, useMemo, useState } from "react";
import {
  resolveModulatedProperties,
  validateModulation,
  type ModulationConfig,
  type ModulationRoute,
  type PropertyView,
} from "@visamp/player";

import { useFps } from "@/hooks/use-fps";
import { cn } from "@/lib/utils";

interface PropertiesInspectorProps {
  properties: PropertyView[];
  modulation?: ModulationConfig | null;
  onModulationChange?: (config: ModulationConfig) => void;
  disabled?: boolean;
}

/** The engine reports base properties; the non-mutating evaluator gives a
 * clearly labelled estimate of the effective value at the preview time. */
export function PropertiesInspector({
  properties,
  modulation = null,
  onModulationChange,
  disabled = false,
}: PropertiesInspectorProps) {
  const fps = useFps();
  const [timeMs, setTimeMs] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!modulation?.routes.some((route) => route.enabled)) return;
    let frame = 0, last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last >= 200) { last = now; setTimeMs(now); }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [modulation]);

  const numeric = useMemo(() => Object.fromEntries(properties
    .filter((property) => (property.type === "float" || property.type === "integer")
      && Number.isFinite(Number(property.value)))
    .map((property) => [property.name, Number(property.value)])), [properties]);
  const effective = useMemo(() => {
    if (!modulation) return numeric;
    try { return resolveModulatedProperties(numeric, modulation, timeMs); }
    catch { return numeric; }
  }, [numeric, modulation, timeMs]);

  const save = (next: ModulationConfig) => {
    try {
      validateModulation(next);
      setError(null);
      onModulationChange?.(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid modulation route");
    }
  };
  const patchRoute = (route: ModulationRoute, patch: Partial<ModulationRoute>) => {
    if (!modulation) return;
    save({ ...modulation, routes: modulation.routes.map((item) =>
      item === route ? { ...item, ...patch } : item) });
  };
  const assign = (property: PropertyView, lfoId: string) => {
    if (!modulation) return;
    const routes = modulation.routes.filter((item) => item.property !== property.name);
    if (lfoId) {
      const value = numeric[property.name] ?? 0;
      routes.push({ lfoId, property: property.name, min: value - 1, max: value + 1, enabled: true });
    }
    save({ ...modulation, routes, lfos: modulation.lfos.map((item) =>
      item.id === lfoId ? { ...item, enabled: true } : item) });
  };

  return (
    <section aria-label="Properties inspector" className="flex w-72 shrink-0 flex-col border-l">
      <header className="flex shrink-0 items-center px-3 py-1.5 text-xs text-muted-foreground">
        Properties {properties.length > 0 && <span className="ml-1.5 opacity-60">{properties.length}</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 font-mono text-[11px] leading-relaxed">
        {properties.length === 0 ? (
          <p className="text-muted-foreground">No properties declared.</p>
        ) : (
          <ul className="space-y-1">
            {properties.map((property) => {
              const isNumber = Object.hasOwn(numeric, property.name);
              const route = modulation?.routes.find((item) => item.property === property.name);
              const active = Boolean(route?.enabled && modulation?.lfos.find((item) =>
                item.id === route.lfoId)?.enabled);
              const expanded = editing === property.name;
              return (
                <li key={property.name} className="rounded border border-transparent py-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="shrink-0 text-[#89ddff]" title={property.type}>{property.name}</span>
                    <span className="ml-auto min-w-0 truncate text-right text-foreground/80"
                      title={`${property.value} (${property.type})`}>
                      {property.swatch && <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full align-middle ring-1 ring-foreground/20"
                        style={{ backgroundColor: property.swatch }} />}
                      {property.value}
                    </span>
                    {isNumber && modulation && (
                      <button type="button" onClick={() => setEditing(expanded ? null : property.name)}
                        aria-label={`Modulate ${property.name}`} aria-expanded={expanded}
                        className={cn("rounded border px-1", active && "border-emerald-500 text-emerald-400")}
                      >~</button>
                    )}
                  </div>
                  {active && isNumber && (
                    <div className="text-right text-[10px] text-muted-foreground" title="Host-clock estimate; engine renders using its own timeline">
                      Base {property.value} · Effective preview {effective[property.name]?.toFixed(3)}
                    </div>
                  )}
                  {expanded && isNumber && modulation && (
                    <div className="mt-1 space-y-2 rounded border bg-muted/20 p-2">
                      <label className="block">LFO
                        <select aria-label={`LFO for ${property.name}`} disabled={disabled}
                          className="mt-0.5 w-full rounded border bg-background p-1"
                          value={route?.lfoId ?? ""}
                          onChange={(event) => assign(property, event.target.value)}>
                          <option value="">None</option>
                          {modulation.lfos.map((item, index) =>
                            <option key={item.id} value={item.id}>LFO {index + 1}</option>)}
                        </select>
                      </label>
                      {route && (
                        <>
                          <label className="flex items-center gap-1">
                            <input type="checkbox" disabled={disabled} checked={route.enabled}
                              aria-label={`Enable modulation for ${property.name}`}
                              onChange={(event) => patchRoute(route, { enabled: event.target.checked })} />
                            Route enabled
                          </label>
                          <div className="grid grid-cols-2 gap-1">
                            <label>Min
                              <input type="number" step="any" key={`${route.property}-min-${route.lfoId}`}
                                defaultValue={route.min} disabled={disabled}
                                aria-label={`Minimum for ${property.name}`}
                                onBlur={(event) => {
                                  const min = Number(event.target.value);
                                  if (Number.isFinite(min)) patchRoute(route, { min });
                                }}
                                className="w-full rounded border bg-background px-1 py-1" />
                            </label>
                            <label>Max
                              <input type="number" step="any" key={`${route.property}-max-${route.lfoId}`}
                                defaultValue={route.max} disabled={disabled}
                                aria-label={`Maximum for ${property.name}`}
                                onBlur={(event) => {
                                  const max = Number(event.target.value);
                                  if (Number.isFinite(max)) patchRoute(route, { max });
                                }}
                                className="w-full rounded border bg-background px-1 py-1" />
                            </label>
                          </div>
                          <p className="text-muted-foreground">Depth ±{((route.max - route.min) / 2).toFixed(2)} · Range centre {((route.max + route.min) / 2).toFixed(2)}</p>
                          <button type="button" disabled={disabled} className="underline"
                            onClick={() => assign(property, "")}>Remove route</button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {modulation && !properties.some((p) => p.type === "float" || p.type === "integer") &&
          <p className="mt-2 text-muted-foreground">Declare a numeric prop to assign modulation.</p>}
        {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      </div>
      <footer className="flex shrink-0 items-baseline justify-between border-t px-3 py-1.5 font-mono text-[11px]">
        <span className="text-muted-foreground">fps</span>
        <span className={cn(fps >= 50 ? "text-foreground/80" : fps >= 30 ? "text-amber-400" : "text-destructive")}>
          {fps || "—"}
        </span>
      </footer>
    </section>
  );
}
