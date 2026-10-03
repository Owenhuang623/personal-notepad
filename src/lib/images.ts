/**
 * Image rules shared by the upload route, the editor and the tests.
 * Imports nothing from the database or React.
 */

/**
 * The largest image accepted, after the browser has shrunk it. Vercel refuses
 * request bodies over 4.5 MB, so anything bigger couldn't arrive anyway.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Where a stored image is served from; notes refer to images by this path. */
export function imageUrl(id: string): string {
  return `/api/images/${id}`;
}

export type ImageMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/**
 * The real type of an image, read from its first bytes rather than taken on
 * the browser's word. Anything else — SVG above all, which can carry script —
 * is refused, so nothing served from /api/images can run in the page.
 */
export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  const starts = (...sig: number[]) => sig.every((byte, i) => bytes[i] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  // RIFF....WEBP
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

/** The file extension a backup writes an image under. */
export function imageExtension(mime: string): string {
  return { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[mime] ?? "bin";
}

/** The ids of every stored image a note's text refers to. */
export function referencedImageIds(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(/\/api\/images\/([0-9a-f-]{36})/gi)) ids.add(match[1].toLowerCase());
  return [...ids];
}
