"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

interface MarketplaceListingProps {
  visualisationId: string;
  canEdit: boolean;
  visibility: "public" | "private";
  initialListed: boolean;
  initialPrice: number | null;
}

export function MarketplaceListing({
  visualisationId,
  canEdit,
  visibility,
  initialListed,
  initialPrice,
}: MarketplaceListingProps) {
  const [listed, setListed] = useState(initialListed);
  const [price, setPrice] = useState(
    initialPrice === null ? "" : String(initialPrice),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (!canEdit) return null;

  const numericPrice = Number(price);
  const validPrice =
    Number.isSafeInteger(numericPrice) && numericPrice > 0;
  const canList = visibility === "public" && validPrice;

  async function save() {
    if (!validPrice) {
      setMessage("Enter a whole-number credit price.");
      return;
    }
    if (listed && visibility !== "public") {
      setMessage("Make the visual public before listing it.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await createClient()
      .from("visualisations")
      .update({
        marketplace_price_credits: numericPrice,
        marketplace_listed: listed && visibility === "public",
      })
      .eq("id", visualisationId)
      .select("id")
      .single();
    setSaving(false);

    setMessage(error ? error.message : "Marketplace settings saved.");
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs">
      <span className="font-medium">Marketplace</span>
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={listed}
          disabled={!canList && !listed}
          onChange={(event) => setListed(event.target.checked)}
        />
        Listed
      </label>
      <label className="flex items-center gap-1.5 text-muted-foreground">
        Price
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={price}
          onChange={(event) => {
            setPrice(event.target.value);
            setMessage("");
          }}
          className="w-20 rounded border bg-transparent px-2 py-1 text-foreground"
          aria-label="Marketplace price in credits"
        />
        credits
      </label>
      <button
        type="button"
        disabled={saving || !validPrice}
        onClick={() => void save()}
        className="rounded border px-2 py-1 transition hover:bg-foreground/5 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {visibility !== "public" && (
        <span className="text-muted-foreground">Public visuals only</span>
      )}
      {message && (
        <span
          role="status"
          className={errorTone(message) ? "text-destructive" : "text-muted-foreground"}
        >
          {message}
        </span>
      )}
    </div>
  );
}

function errorTone(message: string) {
  return !message.endsWith("saved.");
}
