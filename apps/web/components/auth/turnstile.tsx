"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "dark";
      size: "flexible";
      callback: (token: string) => void;
      "error-callback": () => boolean;
      "expired-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => {
    onToken(null);
    setFailed(true);
    return true;
  }, [onToken]);

  const render = useCallback(() => {
    if (!window.turnstile || !container.current || widgetId.current) return;
    // Next Script's onReady runs after loading and on subsequent mounts.
    // Turnstile.ready() rejects async/defer script tags and crashes on remount.
    try {
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: "dark",
        size: "flexible",
        callback: (token) => {
          setFailed(false);
          onToken(token);
        },
        "error-callback": fail,
        "expired-callback": () => onToken(null),
      });
    } catch {
      fail();
    }
  }, [fail, onToken, siteKey]);

  useEffect(() => {
    // Also recreate a cached widget after React re-runs effects in development.
    // Mounting the external widget may synchronously report a load error.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    render();
    return () => {
      try {
        if (widgetId.current && window.turnstile) {
          window.turnstile.remove(widgetId.current);
        }
      } catch {
        // An already-removed third-party widget must not break navigation.
      } finally {
        widgetId.current = null;
        onToken(null);
      }
    };
  }, [onToken, render]);

  return (
    <>
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={render}
        onError={fail}
      />
      <div ref={container} className="min-h-16 w-full" />
      {failed && (
        <p role="alert" className="text-xs text-destructive">
          The security check couldn’t load. Reload the page and try again.
        </p>
      )}
    </>
  );
}
