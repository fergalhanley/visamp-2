/**
 * Conservative WebGPU HDR preflight.
 *
 * This does NOT establish that HDR presentation is working. Only an actual
 * brightness comparison (or a platform-level display test) can establish that.
 * Avoid requesting a GPU device just to determine whether a button can appear.
 */
export type HdrPreflight = {
  supportedDisplay: boolean;
  webgpuAvailable: boolean;
  eligible: boolean;
  reason: "eligible" | "no-browser" | "no-webgpu" | "no-hdr-display";
};

export type HdrEnvironment = {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { gpu?: unknown };
};

/**
 * Chromium's macOS EDR regression clips an extended WebGPU canvas to SDR when
 * no backdrop-filter is visible: https://crbug.com/567321057.
 * Fixed in M157; M156 backports vary, so retain the workaround for 153–156.
 * Match the Chromium engine token (also used by Edge/Brave), not Safari/iOS.
 */
export function needsHdrCompositingWorkaround(userAgent: string): boolean {
  if (!/Macintosh/.test(userAgent)) return false;
  const major = Number(/\b(?:Chrome|Chromium)\/(\d+)\./.exec(userAgent)?.[1]);
  return major >= 153 && major < 157;
}

export function detectHdrPreflight(env?: HdrEnvironment): HdrPreflight {
  const browser = env ?? (typeof window === "undefined"
    ? undefined
    : {
        matchMedia: window.matchMedia?.bind(window),
        navigator: window.navigator,
      });
  if (!browser) {
    return { supportedDisplay: false, webgpuAvailable: false, eligible: false, reason: "no-browser" };
  }

  const webgpuAvailable = Boolean(browser.navigator?.gpu);
  let supportedDisplay = false;
  try {
    supportedDisplay = Boolean(browser.matchMedia?.("(dynamic-range: high)").matches);
  } catch {
    // Browser may not support the media query.
  }
  const eligible = webgpuAvailable && supportedDisplay;
  return {
    supportedDisplay, webgpuAvailable, eligible,
    reason: eligible ? "eligible" : !webgpuAvailable ? "no-webgpu" : "no-hdr-display",
  };
}
