import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/hosted-audio/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { newsError, sameOrigin } from "@/lib/news/http";
import { NEWS_IMAGE_MAX_BYTES, uuidPattern } from "@/lib/news/types";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    if (!sameOrigin(request))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const { id } = await params;
    if (!uuidPattern.test(id))
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const db = createAdminClient();
    const { data: post, error } = await db
      .from("news_posts")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!post)
      return NextResponse.json(
        { error: "Save the draft first." },
        { status: 404 },
      );
    if (
      Number(request.headers.get("content-length")) >
      NEWS_IMAGE_MAX_BYTES + 65536
    )
      return NextResponse.json(
        { error: "Choose an image under 3 MB." },
        { status: 413 },
      );
    const form = await request.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > NEWS_IMAGE_MAX_BYTES ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      return NextResponse.json(
        { error: "Choose a JPG, PNG or WebP image under 3 MB." },
        { status: 400 },
      );
    let bytes: Buffer;
    try {
      bytes = await sharp(Buffer.from(await file.arrayBuffer()), {
        limitInputPixels: 25000000,
      })
        .rotate()
        .resize({
          width: 2000,
          height: 2000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      return NextResponse.json(
        { error: "This image could not be read. Try a different image." },
        { status: 400 },
      );
    }
    const name = randomUUID() + ".webp";
    const { error: uploadError } = await db.storage
      .from("news-images")
      .upload(`${id}/${name}`, bytes, { contentType: "image/webp" });
    if (uploadError) throw uploadError;
    return NextResponse.json(
      { url: `/api/news/images/${id}/${name}` },
      { status: 201 },
    );
  } catch (error) {
    return newsError(error);
  }
}
