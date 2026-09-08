import type { Metadata } from "next";

import { SessionShell } from "@/components/shell/session-shell";
import "./globals.css";
import "./site.css";

export const metadata: Metadata = {
  title: {
    default: "VisAmp",
    template: "%s — VisAmp",
  },
  description:
    "Community-built music visualisations for local, SoundCloud, and licensed hosted audio.",
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
