import type { SetDocument } from "@/lib/sets/model";

export type StudioSelection = { setId: string; selectedAt: string };
export type StudioSets = { sets: SetDocument[]; selections: StudioSelection[] };
