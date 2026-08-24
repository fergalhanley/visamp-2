import type { Visualisation } from "@/lib/types";

import source from "./default.vdsl";

/**
 * What plays before anything has chosen otherwise.
 *
 * The engine no longer carries a script of its own — it renders nothing until
 * one is loaded — so this is the first thing the canvas shows on a cold load,
 * and what stays up until a route, a server seed, or the V panel names
 * something else.
 */
export const DEFAULT_SOURCE = source;

/**
 * The default dressed as a visualisation, for the places that want one: the
 * session store seeds `current` with it, and the chrome reads a title off it.
 * Not a real row — it is never browsable, likeable or forkable.
 */
export const DEFAULT_VISUALISATION: Visualisation = {
  id: "visamp-default",
  title: "Visamp",
  description: "The default script, until you pick something else.",
  source: DEFAULT_SOURCE,
  artist: {
    username: "visamp",
    displayName: "Visamp",
    visCount: 0,
    totalViews: 0,
  },
  usesAudio: false,
  likeCount: 0,
  commentCount: 0,
  forkCount: 0,
  viewCount: 0,
};
