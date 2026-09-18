// Mixpanel ingestion tokens are public identifiers, not account credentials.
export const projects = {
  production: "e5beaf8c763395f77f0fabfe88a5b4a8",
  staging: "68324dd70b593db9bc54318b377390c9",
} as const;
export type AnalyticsEnvironment = keyof typeof projects;
export const apiHost = "https://api.mixpanel.com"; // Both projects: US residency.

export function analyticsEnvironment(
  deployment: string | undefined,
  hostname: string,
  automated = false,
): AnalyticsEnvironment {
  return !automated &&
    deployment === "production" &&
    ["visamp.io", "www.visamp.io"].includes(hostname)
    ? "production"
    : "staging";
}

const staticRoutes = new Set([
  "/",
  "/player",
  "/artists",
  "/creators",
  "/upload",
  "/my-artists",
  "/assets",
  "/account",
  "/account/billing",
  "/admin",
  "/dispute",
  "/auth/error",
  "/auth/reset-password",
]);
export function routeTemplate(path: string): string {
  const pathname = path.split(/[?#]/)[0]!.replace(/\/$/, "") || "/";
  if (staticRoutes.has(pathname)) return pathname;
  const match = pathname.match(
    /^\/(edit|vis|artists|artist|creators|site)\/[^/]+$/,
  );
  return match ? `/${match[1]}/[id]` : "/unknown";
}
