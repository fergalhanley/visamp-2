"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- full navigation resets the singleton WASM canvas when crossing site/player/editor routes */
import { ChevronDown } from "lucide-react";
import { AccountMenu } from "@/components/auth/account-menu";
import { BrandLockup } from "@/components/brand/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sitePages, socialLinks } from "@/lib/site";

export function SocialLinks() {
  return (
    <div className="site-socials" aria-label="Social accounts">
      {socialLinks.map(({ label, href }) =>
        href ? (
          <a
            key={label}
            href={href}
            rel="noopener noreferrer"
            target={label === "Email" ? undefined : "_blank"}
          >
            {label}
          </a>
        ) : (
          <span
            key={label}
            aria-disabled="true"
            title={label + " — coming soon"}
          >
            {label}
            <span className="sr-only"> — coming soon</span>
          </span>
        ),
      )}
    </div>
  );
}
export function SiteHeader({ visible = true }: { visible?: boolean }) {
  return (
    <header
      className={"site-header " + (visible ? "is-visible" : "")}
      inert={!visible}
    >
      <div className="site-header-inner">
        <a href="/" aria-label="VisAmp home">
          <BrandLockup className="h-7 sm:h-8" />
        </a>
        <nav aria-label="Main navigation" className="site-nav">
          <a href="/player">Player</a>
          <a href="/artists">Artists</a>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1">
              Site links <ChevronDown size={13} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {sitePages.map((page) => (
                <DropdownMenuItem
                  key={page.slug}
                  nativeButton={false}
                  render={<a href={"/site/" + page.slug} />}
                >
                  {page.title}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                nativeButton={false}
                render={<a href="/upload" />}
              >
                Upload music
              </DropdownMenuItem>
              <DropdownMenuItem
                nativeButton={false}
                render={<a href="/assets" />}
              >
                Your assets
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AccountMenu />
        </nav>
      </div>
      <div className="site-header-socials">
        <SocialLinks />
      </div>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <a href="/" aria-label="VisAmp home">
        <BrandLockup className="h-7" />
      </a>
      <p>Music for your eyes.</p>
      <SocialLinks />
      <p className="text-xs text-muted-foreground">
        Social accounts coming soon.
      </p>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {sitePages.map((page) => (
          <a key={page.slug} href={"/site/" + page.slug}>
            {page.title}
          </a>
        ))}
      </div>
    </footer>
  );
}
