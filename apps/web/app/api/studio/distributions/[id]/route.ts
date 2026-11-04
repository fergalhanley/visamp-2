import { body, checkId, failure, identity, respond } from "@/lib/sets/api";
import { saveDistribution } from "@/lib/studio/distributions";
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await identity(request, true);
    const { id } = await context.params;
    checkId(id);
    return respond({
      distribution: await saveDistribution(db, userId, id, await body(request)),
    });
  } catch (error) {
    return failure(error);
  }
}
