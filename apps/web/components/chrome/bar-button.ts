/**
 * The look every action on the universal top bar shares.
 *
 * Radius, lift and timing are the landing page's `.site-button` — the same
 * gesture the hero's Play Now makes, so the bar's actions read as the same
 * kind of thing rather than as chrome that happens to be clickable.
 *
 * The rise is `translate` rather than `transform`: Tailwind's utility sets the
 * standalone property, and a transition list that names only `transform` never
 * animates it.
 */
export const barButton =
  "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] px-2.5 sm:px-3 " +
  "text-[13px] font-medium transition-[background-color,translate,opacity] duration-200 " +
  "hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0 " +
  "focus-visible:ring-2 focus-visible:outline-none";

/** Start something new. */
export const barButtonGreen =
  "bg-emerald-500 text-black hover:bg-emerald-400 focus-visible:ring-emerald-300";

/** Start from something that already exists — fork, open, edit. */
export const barButtonBlue =
  "bg-sky-500 text-black hover:bg-sky-400 focus-visible:ring-sky-300";

/**
 * Wraps an action's label. Below `sm` there is not room for all of these plus
 * the mark, the nav and the account, so the actions fall back to their icons —
 * which is why every one of them carries a `title` as well.
 */
export const barLabel = "hidden sm:inline";
