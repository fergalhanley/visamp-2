"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Distribution = "private" | "public" | "protected" | "product";

interface MarketplaceListingProps {
  visualisationId: string;
  canEdit: boolean;
  visibility: Distribution;
  initialPrice: number | null;
}

/** Product-only commercial metadata; distribution itself is chosen in editor. */
export function MarketplaceListing({
  visualisationId,
  canEdit,
  visibility,
  initialPrice,
}: MarketplaceListingProps) {
  const [price, setPrice] = useState(
    initialPrice === null ? "" : String(initialPrice),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (!canEdit || visibility !== "product") return null;

  const numericPrice = Number(price);
  const validPrice = Number.isSafeInteger(numericPrice) && numericPrice > 0;

  async function save() {
    if (!validPrice) {
      setMessage("Enter a whole-number credit price.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await createClient()
      .from("visualisations")
      .update({ marketplace_price_credits: numericPrice })
      .eq("id", visualisationId)
      .select("id")
      .single();
    setSaving(false);

    setMessage(error ? error.message : "Product price saved.");
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs">
      <span className="font-medium">Product</span>
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
          aria-label="Product price in credits"
        />
        credits
      </label>
      <button
        type="button"
        disabled={saving || !validPrice}
        onClick={() => void save()}
        className="rounded border px-2 py-1 transition hover:bg-foreground/5 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save price"}
      </button>
      <span className="text-muted-foreground">
        Customisation comes from Visript params.
      </span>
      {message && (
        <span
          role="status"
          className={
            message.endsWith("saved.")
              ? "text-muted-foreground"
              : "text-destructive"
          }
        >
          {message}
        </span>
      )}
    </div>
  );
}
