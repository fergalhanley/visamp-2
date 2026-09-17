import { Suspense } from "react";
import { TopBar } from "@/components/chrome/top-bar";
import { CreditPanel } from "@/components/billing/credit-panel";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Credits & billing" };
export default async function BillingPage() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/account");
  return (
    <div className="site-page">
      <TopBar />
      <Suspense
        fallback={<p className="pt-24 text-center">Loading credits…</p>}
      >
        <CreditPanel />
      </Suspense>
    </div>
  );
}
