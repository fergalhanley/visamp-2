"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- a full navigation resets the singleton WASM canvas when crossing site/player/editor routes */
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AccountMenu } from "@/components/auth/account-menu";
import { BrandLockup } from "@/components/brand/logo";
import { CreateVisButton } from "@/components/chrome/create-vis-button";
import { EditVisButton } from "@/components/chrome/edit-vis-button";
import { ForkVisButton } from "@/components/chrome/fork-vis-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { navLinks } from "@/lib/site";
import { useChromeStore } from "@/lib/store/chrome";
import { cn } from "@/lib/utils";

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
 * "what can I make?"; navigation and the account sit on the right. Below `md`
 * the links fold into a single menu rather than wrapping the bar onto a second
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
      <div className="mx-auto flex h-full max-w-[1400px] items-center gap-2.5 px-3 sm:gap-4 sm:px-5">
        <a href="/" aria-label="VisAmp home" className="shrink-0">
          <BrandLockup className="h-6" />
        </a>

        <div className="flex shrink-0 items-center gap-1.5">
          {actions ?? <RouteActions />}
        </div>

        <nav
          aria-label="Main navigation"
          className="ml-auto flex items-center gap-3 text-[13px] sm:gap-4 xl:gap-6"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                "whitespace-nowrap text-muted-foreground transition hover:text-foreground",
                link.compact ? "hidden lg:inline" : "hidden xl:inline",
              )}
            >
              {link.label}
            </a>
          ))}

          {/* Everything the width dropped, in the order it dropped it. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Open navigation"
              className="cursor-pointer text-muted-foreground transition hover:text-foreground xl:hidden"
            >
              <Menu className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {navLinks.map((link) => (
                <DropdownMenuItem
                  key={link.href}
                  nativeButton={false}
                  render={<a href={link.href} />}
                  className={link.compact ? "lg:hidden" : undefined}
                >
                  {link.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <AccountMenu />
        </nav>
      </div>
    </header>
  );
}
