"use client";

import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

export function ArtistTabs({
  tracks,
  visualisations,
}: {
  tracks: ReactNode;
  visualisations: ReactNode;
}) {
  return (
    <Tabs.Root defaultValue="tracks" className="artist-catalogue">
      <Tabs.List aria-label="Artist catalogue" className="artist-tabs">
        <Tabs.Tab value="tracks">Tracks</Tabs.Tab>
        <Tabs.Tab value="visualisations">Visualisations</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="tracks" className="artist-tab-panel">
        {tracks}
      </Tabs.Panel>
      <Tabs.Panel value="visualisations" className="artist-tab-panel">
        {visualisations}
      </Tabs.Panel>
    </Tabs.Root>
  );
}
