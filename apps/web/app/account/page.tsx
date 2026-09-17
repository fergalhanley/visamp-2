import Link from "next/link";
import type { Metadata } from "next";

import { AccountEditor } from "@/components/account/account-editor";
import { TopBar } from "@/components/chrome/top-bar";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your VisAmp artist profile.",
};

export default function AccountPage() {
  return (
    <div className="site-page">
      <TopBar />
      <div className="pt-24">
        <AccountEditor />
        <div className="mx-auto max-w-3xl px-5 pb-12">
          <Link href="/account/billing" className="text-sm underline">
            Credits & billing
          </Link>
        </div>
      </div>
    </div>
  );
}
