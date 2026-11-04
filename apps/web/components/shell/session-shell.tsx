"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const AppSession = dynamic(() =>
  import("./app-session").then((module) => module.AppSession),
);

/** Embeds have no account, analytics, audio session or application chrome. */
export function SessionShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname === "/embed" ? children : <AppSession>{children}</AppSession>;
}
