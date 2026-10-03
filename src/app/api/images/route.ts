import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { images } from "@/db/schema";
import { imageUrl, MAX_IMAGE_BYTES, sniffImageType } from "@/lib/images";

/**
 * Stores one image, sent as the raw request body. The browser has already
 * shrunk it; this checks the size and the real file type, then keeps it.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) return tooLarge();

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength === 0) return NextResponse.json({ error: "No image in the request" }, { status: 400 });
  if (body.byteLength > MAX_IMAGE_BYTES) return tooLarge();

  const mime = sniffImageType(body);
  if (!mime) {
    return NextResponse.json({ error: "Only PNG, JPEG, GIF and WebP images can be added" }, { status: 415 });
  }

  const url = new URL(request.url);
  const dimension = (name: string) => {
    const value = Number(url.searchParams.get(name));
    return Number.isInteger(value) && value > 0 && value < 100_000 ? value : null;
  };

  const [created] = await getDb()
    .insert(images)
    .values({
      mime,
      data: Buffer.from(body).toString("base64"),
      bytes: body.byteLength,
      width: dimension("width"),
      height: dimension("height"),
    })
    .returning({ id: images.id });

  return NextResponse.json({ id: created.id, url: imageUrl(created.id) }, { status: 201 });
}

function tooLarge() {
  return NextResponse.json({ error: "That image is too large (4 MB at most)" }, { status: 413 });
}
