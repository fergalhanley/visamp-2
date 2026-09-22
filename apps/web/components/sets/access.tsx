"use client";
import { useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
export function SetAccess({
  children,
  title = "Sign in to use Set Builder and VJ Mode",
}: {
  children: ReactNode;
  title?: string;
}) {
  const { user, loading } = useAuth();
  const path = usePathname(),
    query = useSearchParams();
  const [open, setOpen] = useState(true);
  if (loading) return <p className="p-8">Loading…</p>;
  if (user) return children;
  return (
    <main className="p-8">
      <h1>{title}</h1>
      <button onClick={() => setOpen(true)}>Sign in</button>
      <SignInDialog
        open={open}
        onOpenChange={setOpen}
        next={`${path}${query.size ? "?" + query.toString() : ""}`}
      />
    </main>
  );
}
