import { Suspense } from "react";
import { SetAccess } from "@/components/sets/access";
import { PlaylistManager } from "@/components/playlists/playlist-manager";
export const metadata = {
  title: "My Playlists",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ playlist?: string }>;
}) {
  const { playlist } = await searchParams;
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <SetAccess title="Sign in to manage your playlists">
        <PlaylistManager initialId={playlist ?? ""} />
      </SetAccess>
    </Suspense>
  );
}
