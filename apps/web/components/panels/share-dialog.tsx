"use client";

import { Check, Link as LinkIcon, Mail, MessageSquare } from "lucide-react";
import { useState, type ComponentType } from "react";

import {
  FacebookIcon,
  RedditIcon,
  WhatsAppIcon,
  XIcon,
} from "@/components/panels/brand-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Visualisation } from "@/lib/types";
import { cn } from "@/lib/utils";

/** How long the copy button stays confirmed before returning to idle. */
const COPIED_MS = 2000;

interface ShareDialogProps {
  vis: Visualisation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * E2.6 — where a visualisation goes when someone wants to pass it on.
 *
 * Every target is a plain link the network already understands, so nothing here
 * needs an SDK, an app id, or a third-party script — which is also what keeps
 * the share sheet from reporting back to anyone about who opened it.
 */
export function ShareDialog({ vis, open, onOpenChange }: ShareDialogProps) {
  // Read once, lazily: the permalink needs an absolute origin, and there is no
  // window during the server render.
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );
  const [copied, setCopied] = useState(false);

  const url = `${origin}/vis/${vis.id}`;
  const text = `${vis.title} by ${vis.artist.username}`;

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  // Most targets take one field, so the link goes on the end of the sentence.
  const encodedBoth = encodeURIComponent(`${text} ${url}`);

  const targets: {
    key: string;
    label: string;
    href: string;
    Icon: ComponentType<{ className?: string }>;
    /** mailto: and sms: hand off to an app rather than opening a page. */
    external: boolean;
  }[] = [
    {
      key: "reddit",
      label: "Reddit",
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`,
      Icon: RedditIcon,
      external: true,
    },
    {
      key: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      Icon: FacebookIcon,
      external: true,
    },
    {
      key: "x",
      label: "X",
      href: `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
      Icon: XIcon,
      external: true,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodedBoth}`,
      Icon: WhatsAppIcon,
      external: true,
    },
    {
      key: "email",
      label: "Email",
      href: `mailto:?subject=${encodedText}&body=${encodedBoth}`,
      Icon: Mail,
      external: false,
    },
    {
      key: "sms",
      label: "Message",
      // `?&body=` rather than one or the other: iOS wants `&`, Android wants
      // `?`, and this form is the one both have long tolerated.
      href: `sms:?&body=${encodedBoth}`,
      Icon: MessageSquare,
      external: false,
    },
  ];

  const copy = () => {
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPIED_MS);
      })
      .catch(() => {
        // Clipboard access can be refused outright (permissions, insecure
        // origin). The address is on screen either way, so there is nothing to
        // recover — just do not claim it worked.
      });
  };

  const cell =
    "flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-[11px] text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription className="truncate">{text}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-1">
          <button type="button" onClick={copy} className={cn(cell, "cursor-pointer")}>
            {copied ? (
              <Check className="h-5 w-5 text-emerald-400" />
            ) : (
              <LinkIcon className="h-5 w-5" />
            )}
            {copied ? "Copied" : "Copy link"}
          </button>

          {targets.map(({ key, label, href, Icon, external }) => (
            <a
              key={key}
              href={href}
              {...(external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className={cell}
            >
              <Icon className="h-5 w-5" />
              {label}
            </a>
          ))}
        </div>

        {/* Shown as well as copyable: on a phone, reading it out or screenshotting
            it is sometimes the whole point. */}
        <p className="truncate rounded-md border px-2 py-1.5 text-[11px] text-muted-foreground">
          {url}
        </p>
      </DialogContent>
    </Dialog>
  );
}
