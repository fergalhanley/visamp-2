import { Suspense } from "react";
import { SetAccess } from "@/components/sets/access";
import { SetOutput } from "@/components/sets/output";
export const metadata = {
  title: "Output",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ output?: string }>;
}) {
  const { sessionId } = await params;
  const { output } = await searchParams;
  return (
    <Suspense fallback={null}>
      <SetAccess>
        <SetOutput sessionId={sessionId} outputId={output ?? "output"} />
      </SetAccess>
    </Suspense>
  );
}
