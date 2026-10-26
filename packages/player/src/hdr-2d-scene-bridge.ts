import type { EngineModule } from "./types";
import { decodeHdrFrame } from "./hdr-2d-frame";

export function readHdr2DFrame(engine: Pick<EngineModule, "get_hdr_2d_snapshot">) {
  return decodeHdrFrame(JSON.parse(engine.get_hdr_2d_snapshot()));
}
