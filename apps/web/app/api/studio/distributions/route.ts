import { body, checkId, failure, identity, respond } from "@/lib/sets/api";
import { addDistribution, listDistributions } from "@/lib/studio/distributions";
export async function GET(request: Request) {
  try {
    const { db, userId } = await identity(request);
    return respond({ distributions: await listDistributions(db, userId) });
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
    return respond({
      distribution: await addDistribution(db, userId, setId, input.target),
    });
  } catch (error) {
    return failure(error);
  }
}
