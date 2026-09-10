import { TopBar } from "@/components/chrome/top-bar";
import { Dashboard } from "@/components/admin/dashboard";
export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};
export default function AdminPage() {
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content">
        <p className="site-eyebrow">SITE ADMINISTRATION</p>
        <h1>The control room.</h1>
        <p>
          Your community at a glance. Manage the music that brings it to life.
        </p>
        <Dashboard />
      </main>
    </div>
  );
}
