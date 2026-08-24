"use client";

import type { PropertyView } from "@visamp/player";

import { useFps } from "@/hooks/use-fps";
import { cn } from "@/lib/utils";

interface PropertiesInspectorProps {
  properties: PropertyView[];
}

/**
 * Live readout of every `prop` in the script.
 *
 * Values arrive already formatted from the engine — including `NaN` and `∞`,
 * which are worth seeing rather than hiding, since a property quietly going
 * non-finite is exactly the kind of thing that makes a visualisation vanish.
 */
export function PropertiesInspector({ properties }: PropertiesInspectorProps) {
  const fps = useFps();

  return (
    <section className="flex w-64 shrink-0 flex-col border-l">
      <header className="flex shrink-0 items-center px-3 py-1.5 text-xs text-muted-foreground">
        Properties
        {properties.length > 0 && (
          <span className="ml-1.5 opacity-60">{properties.length}</span>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 font-mono text-[11px] leading-relaxed">
        {properties.length === 0 ? (
          <p className="text-muted-foreground">No properties declared.</p>
        ) : (
          <ul className="space-y-0.5">
            {properties.map((property) => (
              <li key={property.name} className="flex items-baseline gap-2">
                <span className="shrink-0 text-[#89ddff]" title={property.type}>
                  {property.name}
                </span>
                <span
                  className="ml-auto min-w-0 truncate text-right text-foreground/80"
                  title={`${property.value} (${property.type})`}
                >
                  {property.swatch && (
                    <span
                      aria-hidden
                      className="mr-1 inline-block h-2 w-2 rounded-full align-middle ring-1 ring-foreground/20"
                      style={{ backgroundColor: property.swatch }}
                    />
                  )}
                  {property.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Under the values, because it is the same kind of readout: something
          the script is doing right now. */}
      <footer className="flex shrink-0 items-baseline justify-between border-t px-3 py-1.5 font-mono text-[11px]">
        <span className="text-muted-foreground">fps</span>
        <span
          className={cn(
            // A visualisation is meant to run at the display's rate; falling
            // well short of it is worth noticing without having to profile.
            fps >= 50
              ? "text-foreground/80"
              : fps >= 30
                ? "text-amber-400"
                : "text-destructive",
          )}
        >
          {fps || "—"}
        </span>
      </footer>
    </section>
  );
}
