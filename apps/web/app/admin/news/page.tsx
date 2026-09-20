import Link from "next/link";
import { TopBar } from "@/components/chrome/top-bar";
import { NewsEditor } from "@/components/news/editor";
export const metadata = {
  title: "Manage News",
  robots: { index: false, follow: false },
};
export default function AdminNewsPage() {
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content">
        <Link className="text-sm underline" href="/admin">
          ← Admin
        </Link>
        <p className="site-eyebrow mt-6">SITE ADMINISTRATION</p>
        <h1>Manage News</h1>
        <p className="mb-8 text-muted-foreground">
          Write an update, add images and publish when you’re ready.
        </p>
        <NewsEditor />
      </main>
    </div>
  );
}
