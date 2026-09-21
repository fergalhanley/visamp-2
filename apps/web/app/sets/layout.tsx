import { Suspense } from "react";
import { SetAccess } from "@/components/sets/access";
import "../sets.css";
export const metadata = {
  title: "Set Builder",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SetAccess>{children}</SetAccess>
    </Suspense>
  );
}
