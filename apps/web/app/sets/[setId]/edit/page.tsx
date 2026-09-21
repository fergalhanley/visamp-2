import { SetEditor } from "@/components/sets/editor";
export default async function Page({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return <SetEditor id={setId} />;
}
