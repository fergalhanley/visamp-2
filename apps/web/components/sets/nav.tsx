"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { barButton, barButtonBlue } from "@/components/chrome/bar-button";
import { cn } from "@/lib/utils";
export const vjButton = cn(
  barButton,
  "bg-fuchsia-600 text-white hover:bg-fuchsia-500 focus-visible:ring-fuchsia-300",
);
export function SetNav() {
  const { user } = useAuth();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="hidden items-center gap-1.5 md:flex">
        {user && (path === "/edit" || path === "/vj-mode") && (
          <a href="/sets" className={cn(barButton, barButtonBlue)}>
            Set Builder
          </a>
        )}
        {path !== "/vj-mode" &&
          (user ? (
            <a href="/vj-mode" className={vjButton}>
              VJ Mode
            </a>
          ) : (
            <button onClick={() => setOpen(true)} className={vjButton}>
              VJ Mode
            </button>
          ))}
      </div>
      <SignInDialog open={open} onOpenChange={setOpen} next="/vj-mode" />
    </>
  );
}
