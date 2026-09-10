// Set official account URLs here when they are created.
export const socialLinks: { label: string; href: string | null }[] = [
  { label: "X", href: null },
  { label: "Instagram", href: null },
  { label: "Discord", href: null },
  { label: "YouTube", href: null },
  { label: "TikTok", href: null },
  { label: "Email", href: null },
];

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
 * also the order the bar drops them in as it narrows.
 *
 * `compact` marks the links that survive down to phone width; the rest move
 * into the bar's overflow menu rather than wrapping it onto a second row.
 */
export const navLinks: { href: string; label: string; compact: boolean }[] = [
  { href: "/player", label: "Player", compact: true },
  { href: "/creators", label: "Creators", compact: true },
  { href: "/upload", label: "Upload Your Music", compact: false },
  { href: "/site/news", label: "News", compact: false },
  { href: "/site/about", label: "About", compact: false },
  { href: "/site/contact", label: "Contact", compact: false },
];
