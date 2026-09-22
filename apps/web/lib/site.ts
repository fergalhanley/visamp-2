/** Official VisAmp accounts, shared by the footer and information pages. */
export const socialLinks = [
  { label: "YouTube", icon: "youtube", href: "https://www.youtube.com/@visamp_io" },
  { label: "Instagram", icon: "instagram", href: "https://www.instagram.com/visamp_io" },
  { label: "Discord", icon: "discord", href: "https://discord.gg/exV68HvWV8" },
  { label: "Email", icon: "email", href: "mailto:admin@visamp.io" },
  { label: "X", icon: "x", href: "https://x.com/visamp_io" },
  { label: "TikTok", icon: "tiktok", href: "https://www.tiktok.com/@visamp_io" },
] as const;

/** Everything served by `/site/[slug]`. Also what the footer lists. */
export const sitePages = [
  { slug: "cookie-policy", title: "Cookie Policy" },
  { slug: "privacy-policy", title: "Privacy Policy" },
  { slug: "terms-and-conditions", title: "Terms and Conditions" },
  { slug: "licencing", title: "Licencing" },
  { slug: "epilepsy-warning", title: "Epilepsy Warning" },
  { slug: "about", title: "About" },
  { slug: "news", title: "News" },
  { slug: "contact", title: "Contact" },
];

/**
 * The one nav the whole site shares. Ordered most-used first, because that is
 * first links remain visible when the single navigation row scrolls on phones.
 */
export const navLinks: {
  href: string;
  label: string;
  external?: boolean;
  icon?: "discord";
}[] = [
  { href: "/player", label: "Player" },
  { href: "/creators", label: "Creators" },
  { href: "/artists", label: "♫ Artists" },
  {
    href: process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.visamp.io",
    label: "Docs",
    external: true,
  },
  {
    href: "https://discord.gg/exV68HvWV8",
    label: "Join Discord",
    external: true,
    icon: "discord",
  },
  { href: "/site/news", label: "News" },
  // { href: "/site/about", label: "About" },
  // { href: "/site/contact", label: "Contact" },
];
