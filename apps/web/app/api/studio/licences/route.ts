import type { Json } from "@/lib/supabase/database.types";
import {
  musicBody,
  musicError,
  musicIdentity,
  musicRate,
  musicResponse,
  MusicError,
  UUID,
} from "@/lib/music/api";

type PurchaseResult = {
  status?: string;
  licenceId?: string;
  chargedCredits?: number;
  priceCredits?: number;
  creatorCredits?: number;
  visampCredits?: number;
  availableCredits?: number;
  requiredCredits?: number;
};

function jsonObject(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new MusicError(400, "Invalid visual customisation.");
  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    throw new MusicError(400, "Invalid visual customisation.");
  }
}

export async function POST(request: Request) {
  try {
    await musicRate(request);
    const body = await musicBody(request);
    const trackId = typeof body.trackId === "string" ? body.trackId : "";
    const visualisationId =
      typeof body.visualisationId === "string" ? body.visualisationId : "";

    if (!UUID.test(trackId) || !UUID.test(visualisationId))
      throw new MusicError(400, "Choose a valid track and visual.");

    const controlValues = jsonObject(body.controlValues ?? {});
    const { db, userId } = await musicIdentity();

    const { data, error } = await db.rpc("purchase_visual_licence", {
      p_user_id: userId!,
      p_track_id: trackId,
      p_visualisation_id: visualisationId,
      p_control_values: controlValues,
    });
    if (error) throw error;

    const result = (data ?? {}) as PurchaseResult;
    if (result.status === "insufficient_credit") {
      return Response.json(result, {
        status: 402,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    if (!["purchased", "existing"].includes(result.status ?? ""))
      throw new Error("Unexpected marketplace purchase result");

    return musicResponse(result);
  } catch (error) {
    return musicError(error);
  }
}
