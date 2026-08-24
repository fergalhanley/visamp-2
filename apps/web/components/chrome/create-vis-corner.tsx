"use client";

import { CreateVisButton } from "@/components/chrome/create-vis-button";
import { ForkVisButton } from "@/components/chrome/fork-vis-button";
import { useChromeStore } from "@/lib/store/chrome";
import { cn } from "@/lib/utils";

/**
 * Holds the two ways into the editor, at the top of the player.
 *
 * Joined into one control because they are the same decision seen from two
 * sides: start something new, or start from what is on screen. Squaring off the
 * touching corners is what makes them read as a pair rather than two buttons
 * that happen to be adjacent.
 *
 * The title moved into the transport; these stay up here because they act on
 * the *site* rather than on what is playing.
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
      <div className="flex items-stretch overflow-hidden rounded-full shadow-lg shadow-black/30">
        <CreateVisButton className="rounded-r-none" />
        <ForkVisButton className="rounded-l-none" />
      </div>
    </div>
  );
}
