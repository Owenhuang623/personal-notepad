import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { images } from "@/db/schema";
import { isUuid } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

/**
 * Serves a stored image. It sits behind the same sign-in as everything else
 * (see proxy.ts), and an image never changes once stored, so the browser may
 * keep it for good — but only privately, never in a shared cache.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });

  const [image] = await getDb()
    .select({ mime: images.mime, data: images.data })
    .from(images)
    .where(eq(images.id, id))
    .limit(1);

  if (!image) return new Response("Not found", { status: 404 });

  return new Response(Buffer.from(image.data, "base64"), {
    headers: {
      "content-type": image.mime,
      "cache-control": "private, max-age=31536000, immutable",
      // Belt and braces: the type was checked on upload, and the browser is
      // told not to second-guess it.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
