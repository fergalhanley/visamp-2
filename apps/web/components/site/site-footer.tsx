"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- full navigation resets the singleton WASM canvas when crossing site/player/editor routes */
import { BrandLockup } from "@/components/brand/logo";
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

/**
 * The social accounts live down here alone now. They used to be pinned under
 * the menubar as well, which gave the bar a second row of links nobody was
 * looking for and made it the tallest thing on the page.
 */
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
