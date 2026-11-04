import { musicError, musicIdentity, musicResponse } from "@/lib/music/api";
import { videoCatalogue } from "@/lib/videos/catalogue";

export async function GET() {
  try {
    const { db, userId } = await musicIdentity();
    return musicResponse({ items: await videoCatalogue(db, userId!) });
  } catch (error) {
    return musicError(error);
  }
}
