import { TopBar } from "@/components/chrome/top-bar";
import { StudioShell } from "@/components/studio/studio-shell";

export const metadata = {
  robots: { index: false, follow: true },
  title: "Studio",
  description: "Select your Sets for distribution and manage their outputs in Visamp Studio.",
};

export default function StudioPage() {
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content max-w-[1500px]">
        <StudioShell />
      </main>
    </div>
  );
}
