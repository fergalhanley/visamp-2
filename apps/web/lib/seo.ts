import type { Metadata } from "next";

export const SITE_URL = "https://www.visamp.io";
export const SITE_DESCRIPTION =
  "Discover and create music visualisations in your browser. Play local audio, SoundCloud and hosted music with visuals made by the VisAmp community.";
export const DEFAULT_IMAGE = "/share-image";
export const noIndex = { index: false, follow: true };

/** Each public page gets its own canonical; never inherit the homepage URL. */
export function publicMetadata(path: string, title: string, description: string, image = DEFAULT_IMAGE): Metadata {
  const url = new URL(path, SITE_URL).href;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title, description, url, siteName: "VisAmp", type: "website",
      images: [{ url: image, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

// Content-pending policy/contact pages stay out until reviewed for publication.
export const publicSitePages: Record<string, string> = {
  news: "VisAmp releases, community highlights and updates.",
  about: "Discover VisAmp, a community for listening to music, exploring visualisations and creating visuals in your browser.",
  "epilepsy-warning": "Read VisAmp's warning about flashing lights and moving patterns before using music visualisations.",
};
export const staticSearchPaths = ["/", "/player", "/artists", "/creators", ...Object.keys(publicSitePages).map(slug => `/site/${slug}`)];
