"use client";
import type { Mixpanel } from "mixpanel-browser";
import {
  analyticsEnvironment,
  apiHost,
  projects,
  routeTemplate,
} from "./config";
import {
  cleanProperties,
  type AnalyticsEvent,
  type EventProperties,
} from "./events";

export const consentKey = "visamp.analytics.consent";
let sdk: Mixpanel | undefined;
let pending: Promise<void> | undefined;
let userId: string | null = null;
let revision = 0;
let lastPage: string | null = null;
let syncedEnvironment: string | null = null;
let queued: Array<{
  event: AnalyticsEvent;
  properties: Record<string, unknown>;
  user: string | null;
  version: number;
}> = [];
export function consent(): string | null {
  try {
    return localStorage.getItem(consentKey);
  } catch {
    return null;
  }
}
export function environment() {
  let automated = typeof navigator !== "undefined" && navigator.webdriver;
  try {
    automated ||=
      sessionStorage.getItem("visamp.analytics.environment") === "staging";
  } catch {
    /* Storage can be unavailable. */
  }
  return analyticsEnvironment(
    process.env.NEXT_PUBLIC_ANALYTICS_DEPLOYMENT,
    location.hostname,
    automated,
  );
}
export async function initialiseAnalytics(): Promise<void> {
  if (consent() !== "accepted" || sdk) return;
  if (pending) {
    await pending;
    if (!sdk && consent() === "accepted") return initialiseAnalytics();
    return;
  }
  const version = revision;
  pending = (async () => {
    try {
      if (syncedEnvironment !== environment()) {
        const response = await fetch("/api/analytics/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(5000),
          body: JSON.stringify({ accepted: true, environment: environment() }),
        });
        if (!response.ok) return;
        syncedEnvironment = environment();
      }
      const { default: mixpanel } = await import("mixpanel-browser");
      if (consent() !== "accepted" || version !== revision) return;
      const instance = mixpanel.init(
        projects[environment()],
        {
          api_host: apiHost,
          api_transport: "sendBeacon",
          autocapture: false,
          track_pageview: false,
          remote_settings_mode: "disabled",
          record_sessions_percent: 0,
          record_heatmap_data: false,
          ip: false,
          persistence: "localStorage",
          save_referrer: false,
          stop_utm_persistence: true,
          batch_requests: false,
          property_blacklist: [
            "$current_url",
            "$referrer",
            "$initial_referrer",
            "$initial_referring_domain",
            "$referring_domain",
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_content",
            "utm_term",
          ],
        },
        "visamp",
      );
      sdk = instance;
      instance.opt_in_tracking({ track: () => undefined });
      if (userId) instance.identify(userId);
      const ready = queued;
      queued = [];
      for (const item of ready) {
        if (item.version === revision && (!item.user || item.user === userId)) {
          try {
            instance.track(item.event, item.properties);
          } catch {
            /* Optional delivery. */
          }
        }
      }
    } catch {
      /* Analytics must never affect the application. */
    }
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
export function identifyAnalytics(id: string | null) {
  if (userId === id) return;
  try {
    if (userId) sdk?.reset();
    if (id && consent() === "accepted") sdk?.identify(id);
  } catch {
    /* SDK errors must not affect authentication. */
  }
  userId = id;
}
export async function setAnalyticsConsent(accepted: boolean) {
  revision++;
  queued = [];
  syncedEnvironment = null;
  if (!accepted) {
    try {
      sdk?.opt_out_tracking();
      sdk?.reset();
    } catch {
      /* Still stop our event producers. */
    }
    sdk = undefined;
    lastPage = null;
  }
  try {
    localStorage.setItem(consentKey, accepted ? "accepted" : "declined");
  } catch {
    /* Fail closed when storage is unavailable. */
  }
  window.dispatchEvent(new Event("visamp:analytics-consent"));
  // Server receipt controls delayed outcomes and withdrawal independently of SDK storage.
  try {
    const response = await fetch("/api/analytics/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ accepted, environment: environment() }),
    });
    if (!response.ok) return false;
    if (accepted) syncedEnvironment = environment();
  } catch {
    return false;
  }
  if (accepted) await initialiseAnalytics();
  return true;
}
export function track<E extends AnalyticsEvent>(
  event: E,
  properties: EventProperties<E> = {},
) {
  if (consent() !== "accepted") return;
  try {
    const payload = {
      ...cleanProperties(event, properties),
      schema_version: 1,
      environment: environment(),
      release: process.env.NEXT_PUBLIC_ANALYTICS_RELEASE ?? "local",
      route: routeTemplate(location.pathname),
      authenticated: Boolean(userId),
      $insert_id: crypto.randomUUID(),
      time: Date.now() / 1000,
    };
    if (sdk) sdk.track(event, payload);
    else if (queued.length < 100)
      queued.push({
        event,
        properties: payload,
        user: userId,
        version: revision,
      });
  } catch {
    /* No user-facing analytics errors. */
  }
}
export async function pageViewed(path: string) {
  await initialiseAnalytics();
  if (!sdk || consent() !== "accepted" || lastPage === path) return;
  lastPage = path;
  track("page_viewed");
  if (path === "/account/billing") track("billing_viewed");
}

/** OAuth signup is measured only if the account was created during this flow. */
export function beginAnalyticsAuthFlow() {
  if (consent() !== "accepted") return;
  try {
    document.cookie = `visamp_analytics_auth_started=${Date.now()}; Path=/; SameSite=Lax; Max-Age=600${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    /* Optional marker; never interrupt sign-in. */
  }
}

export function analyticsReady() {
  return Boolean(sdk) && consent() === "accepted";
}
export function consentVersion() {
  return revision;
}

export function completeAnalyticsLogout() {
  if (userId) track("logout_completed");
  identifyAnalytics(null);
}
