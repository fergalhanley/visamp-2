"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
export function SetNav() {
  const { user } = useAuth();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="hidden items-center gap-3 md:flex">
        {user && path === "/edit" && (
          <a href="/sets" className="text-sm">
            Set Builder
          </a>
        )}
        {user ? (
          <a
            href="/vj-mode"
            className="whitespace-nowrap rounded border border-fuchsia-400/50 bg-fuchsia-950 px-3 py-1.5 text-sm text-fuchsia-100"
          >
            VJ Mode
          </a>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="whitespace-nowrap rounded border border-fuchsia-400/50 bg-fuchsia-950 px-3 py-1.5 text-sm text-fuchsia-100"
          >
            VJ Mode
          </button>
        )}
      </div>
      <SignInDialog open={open} onOpenChange={setOpen} next="/vj-mode" />
    </>
  );
}
