"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CreditSummary } from "@/lib/billing/server";
import {
  CREDIT_PRESETS,
  CREDITS_PER_USD,
  creditsForCents,
  parsePurchaseCents,
} from "@/lib/billing/pricing";

export function CreditPanel() {
  const params = useSearchParams();
  const purchaseId = params.get("purchase");
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [dismissedPurchase, setDismissedPurchase] = useState<string | null>(
    null,
  );
  const showPurchase = Boolean(purchaseId && purchaseId !== dismissedPurchase);
  const [amount, setAmount] = useState("5");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const cents = parsePurchaseCents(amount);
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/billing", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load credits");
      setSummary(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load credits");
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/billing", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setSummary(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const purchase = summary?.purchases.find((p) => p.id === purchaseId);
  const paid = Boolean(purchase?.paid_at);
  useEffect(() => {
    if (!purchaseId || paid) return;
    let count = 0;
    const timer = setInterval(() => {
      void refresh();
      if (++count >= 20) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [purchaseId, paid, refresh]);

  async function buy() {
    if (cents === null || pending) return;
    setPending(true);
    setError("");
    try {
      const r = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Checkout failed");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 pb-16 pt-24">
      <Link
        href="/account"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Account
      </Link>
      <h1 className="text-3xl font-semibold">Credits & billing</h1>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {params.has("cancelled") && (
        <p>Checkout cancelled. You can try again whenever you’re ready.</p>
      )}
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-xl font-medium">Your balance</h2>
        <p>
          {summary
            ? `${summary.available.toLocaleString()} available credits`
            : "Loading credits…"}
        </p>
        <p className="text-sm text-muted-foreground">
          {summary?.exempt
            ? "Your account is exempt from AI credit charges."
            : `${summary?.generationCost ?? 100} credits per successful AI request. Automatic retries are included; failed requests are free.`}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={checking}
          className="cursor-pointer text-sm underline disabled:opacity-50"
        >
          Refresh balance
        </button>
      </section>
      {showPurchase ? (
        <section className="space-y-4 rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-5">
          <div role="status" className="space-y-3">
            <h2 className="text-xl font-medium">
              {paid
                ? "Credit purchase successful"
                : "Confirming your credit purchase"}
            </h2>
            {paid && purchase && summary ? (
              <>
                <p>
                  You purchased {purchase.credits.toLocaleString()} credits for
                  US${(purchase.amount_cents / 100).toFixed(2)}.
                </p>
                <p className="text-lg font-semibold">
                  Total available: {summary.available.toLocaleString()} credits
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Waiting for payment confirmation. Your credits will appear here
                once payment is confirmed.
              </p>
            )}
          </div>
          {paid && (
            <button
              type="button"
              className="cursor-pointer rounded-md bg-emerald-400 px-4 py-2 font-medium text-black"
              onClick={() => {
                setDismissedPurchase(purchaseId);
                const url = new URL(window.location.href);
                url.searchParams.delete("purchase");
                window.history.replaceState(
                  null,
                  "",
                  `${url.pathname}${url.search}${url.hash}`,
                );
              }}
            >
              Buy More Credits
            </button>
          )}
        </section>
      ) : (
        <section className="space-y-4 rounded-xl border p-5">
          <h2 className="text-xl font-medium">Buy credits</h2>
          <p className="text-sm text-muted-foreground">
            US$1 = {CREDITS_PER_USD.toLocaleString("en-US")} credits. Purchased
            credits never expire.
          </p>
          <div className="flex flex-wrap gap-3">
            {CREDIT_PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={amount === String(value)}
                onClick={() => setAmount(String(value))}
                className="cursor-pointer rounded-lg border px-4 py-3 text-left aria-pressed:border-emerald-400 aria-pressed:bg-emerald-400/10"
              >
                <span className="block font-semibold">US${value}</span>
                <span className="text-sm">
                  {creditsForCents(value * 100).toLocaleString()} credits
                </span>
              </button>
            ))}
          </div>
          <label className="block space-y-2">
            <span>Custom amount (USD)</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="block w-full rounded-md border bg-background px-3 py-2"
              aria-describedby="credit-quote"
            />
          </label>
          <p id="credit-quote" className="text-sm">
            {cents === null
              ? "Enter US$2–US$1,000, with up to two decimal places."
              : `${creditsForCents(cents).toLocaleString()} credits — ${Math.floor(creditsForCents(cents) / (summary?.generationCost ?? 100))} successful requests`}
          </p>
          <p className="text-xs text-muted-foreground">
            Any applicable tax is shown at checkout.
          </p>
          <button
            type="button"
            disabled={cents === null || pending || !summary}
            onClick={() => void buy()}
            className="cursor-pointer rounded-md bg-emerald-400 px-4 py-2 font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Opening checkout…" : "Continue to secure checkout"}
          </button>
        </section>
      )}
      {summary && (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-medium">Grants & expiry</h2>
            <p className="text-sm text-muted-foreground">
              Latest 100 grants. Reserved credits are included in remaining
              amounts. Credits expiring soonest are used first, then free
              credits, then purchased credits.
            </p>
            {summary.allocations.length === 0 && <p>No credit grants yet.</p>}
            {summary.allocations.map((a) => (
              <div
                key={a.id}
                className="flex justify-between gap-4 border-b py-2 text-sm"
              >
                <span className="capitalize">
                  {a.source}
                  <span className="block text-muted-foreground">
                    {a.expires_at
                      ? `${new Date(a.expires_at).getTime() <= new Date(summary.asOf).getTime() ? "Expired" : "Expires"} ${new Date(a.expires_at).toLocaleString()}`
                      : "No expiry"}
                  </span>
                </span>
                <span>
                  {a.remaining.toLocaleString()} / {a.amount.toLocaleString()}{" "}
                  credits
                </span>
              </div>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-medium">Recent purchases</h2>
            {summary.purchases.length === 0 && <p>No purchases yet.</p>}
            {summary.purchases.map((p) => (
              <div
                key={p.id}
                className="flex justify-between gap-4 border-b py-2 text-sm"
              >
                <span>
                  {new Date(p.created_at).toLocaleDateString()} · US$
                  {(p.amount_cents / 100).toFixed(2)}
                </span>
                <span>
                  {p.refunded_cents
                    ? `US$${(p.refunded_cents / 100).toFixed(2)} refunded`
                    : p.paid_at
                      ? `${p.credits.toLocaleString()} credits`
                      : "Unpaid"}
                </span>
              </div>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-medium">Recent AI usage</h2>
            {summary.usage.length === 0 && <p>No AI requests yet.</p>}
            {summary.usage.map((u) => (
              <div
                key={u.id}
                className="flex justify-between gap-4 border-b py-2 text-sm"
              >
                <span>
                  {new Date(u.created_at).toLocaleString()} · {u.status}
                  {u.has_source && (
                    <a
                      className="ml-2 underline"
                      download={`visamp-${u.id}.viscript`}
                      href={`/api/billing/results/${u.id}`}
                    >
                      Download result
                    </a>
                  )}
                </span>
                <span>
                  {u.status === "success"
                    ? `${u.credit_cost} credits`
                    : u.status === "running"
                      ? `${u.credit_cost} reserved`
                      : "No charge"}
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
