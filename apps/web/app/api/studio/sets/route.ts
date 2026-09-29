import { body, checkId, failure, identity, respond } from "@/lib/sets/api";
import { listStudioSets, selectStudioSet } from "@/lib/studio/sets";

export async function GET(request: Request) {
  try {
    const { db, userId } = await identity(request);
    return respond(await listStudioSets(db, userId));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { db, userId } = await identity(request, true);
    const input = await body(request);
    const setId = typeof input.setId === "string" ? input.setId : "";
    checkId(setId);
    return respond({ selection: await selectStudioSet(db, userId, setId) });
  } catch (error) {
    return failure(error);
  }
}
