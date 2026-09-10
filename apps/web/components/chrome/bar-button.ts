/**
 * The look every action on the universal top bar shares.
 *
 * Square rather than pill-shaped: the bar's own edges are square, and the
 * actions sit flush against the mark at the left of it, so rounded corners
 * left them floating rather than reading as part of the bar.
 */
export const barButton =
  "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-none px-2.5 sm:px-3 " +
  "text-[13px] font-medium transition disabled:opacity-70 " +
  "focus-visible:ring-2 focus-visible:outline-none";

/** Start something new. */
export const barButtonGreen =
  "bg-emerald-500 text-black hover:bg-emerald-400 focus-visible:ring-emerald-300";

/** Start from something that already exists — fork, open, edit. */
export const barButtonBlue =
  "bg-sky-500 text-black hover:bg-sky-400 focus-visible:ring-sky-300";

/**
 * Wraps an action's label. Below `sm` there is not room for three of these
 * plus the mark, the nav and the account, so the actions fall back to their
 * icons — which is why every one of them carries a `title` as well.
 */
export const barLabel = "hidden sm:inline";
