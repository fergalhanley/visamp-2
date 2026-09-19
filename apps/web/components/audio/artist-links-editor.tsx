"use client";
import { X } from "lucide-react";
import { ArtistLinkIcon } from "./artist-link-icon";
import {
  artistLinkTypes,
  MAX_ARTIST_LINKS,
  type ArtistLink,
  type ArtistLinkType,
} from "@/lib/artists/links";

export function ArtistLinksEditor({
  links,
  onChange,
  disabled,
}: {
  links: ArtistLink[];
  onChange: (links: ArtistLink[]) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="mb-2 text-sm font-medium">Links</legend>
      <p className="text-xs text-muted-foreground">
        Your website, music and social profiles. These appear on your public
        artist page.
      </p>
      {links.map((link, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[11rem_minmax(0,1fr)_auto]"
        >
          <label>
            <span className="flex items-center gap-2">
              <ArtistLinkIcon type={link.type} />
              Link type
            </span>
            <select
              aria-label={`Link ${index + 1} type`}
              value={link.type}
              onChange={(e) =>
                onChange(
                  links.map((row, i) =>
                    i === index
                      ? { ...row, type: e.target.value as ArtistLinkType }
                      : row,
                  ),
                )
              }
            >
              {artistLinkTypes.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
            Link
            <input
              type="url"
              required
              maxLength={500}
              aria-label={`Link ${index + 1} URL`}
              placeholder="https://"
              value={link.url}
              onChange={(e) =>
                onChange(
                  links.map((row, i) =>
                    i === index ? { ...row, url: e.target.value } : row,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            aria-label={`Remove link ${index + 1}`}
            className="col-start-2 row-start-1 flex h-11 w-10 cursor-pointer items-center justify-center rounded border hover:bg-white/10 sm:col-start-3 sm:row-start-auto"
            onClick={() => onChange(links.filter((_, i) => i !== index))}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="site-button secondary"
        disabled={links.length >= MAX_ARTIST_LINKS}
        onClick={() => onChange([...links, { type: "website", url: "" }])}
      >
        Add link
      </button>
    </fieldset>
  );
}
