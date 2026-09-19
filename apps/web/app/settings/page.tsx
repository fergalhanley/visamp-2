import { TopBar } from "@/components/chrome/top-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { AnalyticsPreferences } from "@/components/settings/analytics-preferences";

export const metadata = {
  title: "Settings",
  description: "Manage your VisAmp preferences.",
  robots: { index: false, follow: true },
};

export default function SettingsPage() {
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content settings-content">
        <h1>Settings</h1>
        <p>Choose how VisAmp works for you.</p>
        <AnalyticsPreferences />
      </main>
      <SiteFooter />
    </div>
  );
}
