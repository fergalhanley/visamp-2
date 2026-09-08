import type { Metadata } from "next";

import { AccountEditor } from "@/components/account/account-editor";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your VisAmp artist profile.",
};

export default function AccountPage() {
  return <div className="site-page"><SiteHeader /><div className="pt-28"><AccountEditor /></div></div>;
}
