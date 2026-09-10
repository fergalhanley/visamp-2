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
      </div>
    </div>
  );
}
