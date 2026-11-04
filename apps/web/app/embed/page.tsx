import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmbedPlayer } from "@/components/embed/embed-player";
import { EMBED_EXAMPLES } from "@/lib/embed/examples";
import { embedParentOrigins, readEmbedOptions } from "@/lib/embed/protocol";
import { loadEmbedVisualisation } from "@/lib/embed/public-visualisation";

export const metadata: Metadata = {
  title: "Embedded player",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const options = readEmbedOptions(
    params,
    embedParentOrigins(process.env.VISAMP_EMBED_PARENT_ORIGINS),
  );
  if (params.parentOrigin && !options.parentOrigin) notFound();
  const publicVisual = options.visualisation
    ? await loadEmbedVisualisation(options.visualisation)
    : null;
  if (options.visualisation && !publicVisual) notFound();
  const visuals = publicVisual
    ? [publicVisual, ...EMBED_EXAMPLES]
    : EMBED_EXAMPLES;
  const initialId =
    publicVisual?.id ??
    visuals.find((visual) => visual.id === options.example)?.id ??
    visuals[0]!.id;
  return (
    <EmbedPlayer
      visuals={visuals}
      initialId={initialId}
      mode={options.mode}
      parentOrigin={options.parentOrigin}
      instance={options.instance}
    />
  );
}
