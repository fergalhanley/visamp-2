import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SessionShell } from "@/components/shell/session-shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "VisAmp",
    template: "%s — VisAmp",
  },
  description:
    "Community-built music visualisations. Bring your own audio — nothing is uploaded.",
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
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        {/* The engine lives above the router, so navigation never remounts it. */}
        <SessionShell>{children}</SessionShell>
      </body>
    </html>
  );
}
