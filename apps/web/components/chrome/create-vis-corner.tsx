"use client";

import { CreateVisButton } from "@/components/chrome/create-vis-button";
import { useChromeStore } from "@/lib/store/chrome";
import { cn } from "@/lib/utils";

/**
 * Holds the Create Vis button at the top of the player.
 *
 * It used to ride alongside the title cluster; the title has moved into the
 * transport, but this is an action on the *site* rather than on what is
 * playing, so it keeps its own perch instead of following the title down.
 */
export function CreateVisCorner() {
  const visible = useChromeStore((s) => s.visible);

  return (
    <div
      className={cn(
        "fixed left-1/2 top-6 z-40 -translate-x-1/2",
        "transition-opacity duration-500",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <CreateVisButton />
    </div>
  );
}
