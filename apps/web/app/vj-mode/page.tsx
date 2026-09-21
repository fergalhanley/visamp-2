import { Suspense } from "react";
import { SetAccess } from "@/components/sets/access";
import { VjMode } from "@/components/sets/vj";
import "../sets.css";
export const metadata = {
  title: "VJ Mode",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SetAccess>
        <VjMode />
      </SetAccess>
    </Suspense>
  );
}
