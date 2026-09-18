import type { Metadata } from "next";
import { SITE_URL, SITE_DESCRIPTION, DEFAULT_IMAGE } from "@/lib/seo";

import { SessionShell } from "@/components/shell/session-shell";
import "./globals.css";
import "./site.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "VisAmp",
    template: "%s — VisAmp",
  },
  description: SITE_DESCRIPTION,
  openGraph: { siteName: "VisAmp", type: "website", images: [DEFAULT_IMAGE] },
  twitter: { card: "summary_large_image", images: [DEFAULT_IMAGE] },
  ...(process.env.VERCEL_ENV === "preview" ? { robots: { index: false, follow: false } } : {}),
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Dark by default: the visualisation is the page, and chrome floats over it.
      className="dark h-full antialiased"
    >
      <body className="h-full">
        {/* The engine lives above the router, so navigation never remounts it. */}
        <SessionShell>{children}</SessionShell>
      </body>
    </html>
  );
}
