"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- full navigation resets the singleton WASM canvas when crossing site/player/editor routes */
import { Mail } from "lucide-react";
import { ArtistLinkIcon } from "@/components/audio/artist-link-icon";
import { BrandLockup } from "@/components/brand/logo";
import { sitePages, socialLinks } from "@/lib/site";

export function SocialLinks({ large = false }: { large?: boolean }) {
  return (
    <nav className={`site-socials${large ? " site-socials-large" : ""}`} aria-label="VisAmp social links">
      {socialLinks.map(({ label, icon, href }) => (
        <a
          key={label}
          href={href}
          aria-label={label === "Email" ? "Email VisAmp" : `${label} (new tab)`}
          title={label === "Email" ? "admin@visamp.io" : label}
          rel={label === "Email" ? undefined : "noopener noreferrer"}
          target={label === "Email" ? undefined : "_blank"}
        >
          {icon === "email" ? <Mail aria-hidden="true" /> : <ArtistLinkIcon type={icon} />}
        </a>
      ))}
    </nav>
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
