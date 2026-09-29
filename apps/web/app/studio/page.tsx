import "./studio.css";
import { TopBar } from "@/components/chrome/top-bar";
import { StudioShell } from "@/components/studio/studio-shell";

export const metadata = {
  robots: { index: false, follow: true },
  title: "Studio",
  description:
    "Select your Sets for distribution and manage their outputs in Visamp Studio.",
};

export default function StudioPage() {
  return (
    <div className="studio-page">
      <TopBar position="static" />
      <main className="studio-main">
        <StudioShell />
      </main>
    </div>
  );
}
