import type { Metadata } from "next";

import { AccountEditor } from "@/components/account/account-editor";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your VisAmp artist profile.",
};

export default function AccountPage() {
  return <AccountEditor />;
}
