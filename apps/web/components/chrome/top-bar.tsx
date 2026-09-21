"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- a full navigation resets the singleton WASM canvas when crossing site/player/editor routes */
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SetNav } from "@/components/sets/nav";
import { AccountMenu } from "@/components/auth/account-menu";
import { BrandLockup, BrandMark } from "@/components/brand/logo";
import { CreateVisButton } from "@/components/chrome/create-vis-button";
import { EditVisButton } from "@/components/chrome/edit-vis-button";
import { ForkVisButton } from "@/components/chrome/fork-vis-button";
import { navLinks } from "@/lib/site";
import { useChromeStore } from "@/lib/store/chrome";
import { cn } from "@/lib/utils";

// Discord brand mark from Simple Icons (CC0): https://simpleicons.org/?q=discord
function DiscordIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4 shrink-0"
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

/**
 * The bar's height. Exported because anything that floats beside it — the
 * player's side panels, a page's own top padding — has to know how far down to
 * start, and a second hard-coded 3.5rem elsewhere is a bug waiting to happen.
 */
export const TOP_BAR_HEIGHT = "3.5rem";

/** Player routes are the ones where the session, and so a fork, exists. */
function isPlayerRoute(pathname: string): boolean {
  return pathname === "/player" || pathname.startsWith("/vis/");
}

/**
 * The actions the route implies, when a caller has not supplied its own.
 *
 * Create is everywhere — it is the site's one standing invitation. Fork and
 * Edit need something playing to act on, so they are the player's. The editor
 * passes its own set, because its Fork has to save first and its Open is a
 * dialog rather than a destination.
 */
function RouteActions() {
  const pathname = usePathname();

  return (
    <>
      <CreateVisButton />
      {isPlayerRoute(pathname) && (
        <>
          <ForkVisButton />
          <EditVisButton />
        </>
      )}
    </>
  );
}

interface TopBarProps {
  /**
   * Fixed overlays the page and slides away when hidden — the player, where
   * the bar is earned by moving the cursor, and the site pages, where it is
   * earned by scrolling. Static is for the full-height flex layouts (editor,
   * artist gallery) that lay their own rows out beneath it.
   */
  position?: "fixed" | "static";
  /** Only meaningful when fixed. */
  visible?: boolean;
  /** Replaces the route's default actions. */
  actions?: ReactNode;
  className?: string;
}

/**
 * One menubar for the whole site.
 *
 * The mark and the actions sit together on the left, because both answer
 * "what can I make?"; navigation and the account sit on the right. On narrow screens
 * the links scroll horizontally rather than wrapping the bar onto a second
 * row — the bar has a fixed height that the player's panels are positioned
 * against, so it cannot be allowed to grow.
 */
export function TopBar({
  position = "fixed",
  visible = true,
  actions,
  className,
}: TopBarProps) {
  const hidden = position === "fixed" && !visible;
  const setControlsHovered = useChromeStore((s) => s.setControlsHovered);

  // Only the player fades this bar, and only the player reads the flag — but
  // setting it unconditionally is harmless and saves the caller having to say
  // which kind of page it is a second time.
  const onPointerEnter = () => setControlsHovered(true);
  const onPointerLeave = () => setControlsHovered(false);

  return (
    <header
      inert={hidden}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{ height: TOP_BAR_HEIGHT }}
      className={cn(
        "z-50 border-b border-white/10 bg-[#0c0f0f]/95 backdrop-blur-xl",
        position === "fixed"
          ? cn(
              // `translate`, not `transform`: the utility sets the standalone
              // property, and naming the wrong one here left the bar snapping
              // in and out rather than sliding.
              "fixed inset-x-0 top-0 transition-[translate,visibility] duration-250",
              hidden ? "invisible -translate-y-full" : "visible translate-y-0",
            )
          : "relative shrink-0",
        className,
      )}
    >
      <div className="mx-auto flex h-full max-w-[1400px] items-center gap-2.5 pr-4 pl-3 sm:gap-4 sm:pr-8 sm:pl-5">
        {/* The wordmark costs ~85px, which is the difference between three
            actions fitting on a phone and not. The mark alone still names the
            site, and the lockup comes back as soon as there is room. */}
        <a href="/" aria-label="VisAmp home" className="shrink-0">
          <BrandMark className="h-6 w-6 sm:hidden" />
          <BrandLockup className="hidden h-6 sm:block" />
        </a>

        <div className="flex shrink-0 items-center gap-1.5">
          {actions ?? <RouteActions />}
        </div>

        <nav
          aria-label="Main navigation"
          className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto py-2 text-[13px] xl:justify-end xl:gap-6"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-muted-foreground transition hover:text-foreground",
              )}
            >
              {link.icon === "discord" && <DiscordIcon />}
              {link.label}
              {link.external && <span className="sr-only"> (new tab)</span>}
            </a>
          ))}
        </nav>
        <SetNav />
        <div className="shrink-0">
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
