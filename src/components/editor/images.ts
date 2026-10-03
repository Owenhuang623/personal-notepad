import { type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";

import { MAX_IMAGE_BYTES } from "@/lib/images";

/**
 * Pasting or dropping an image into a note.
 *
 * The image is shrunk in the browser, uploaded, and written into the note as
 * ordinary markdown — `![](/api/images/<id>)` — so the text stays portable and
 * the image lives beside the notes in the database.
 *
 * While it uploads, the note holds a placeholder, `![Uploading…](uploading:<token>)`,
 * which the live preview draws as a small "Uploading image…" card. When the
 * upload lands the placeholder is swapped for the real link in whichever
 * editor has it open — including one opened later, if you switched notes
 * mid-upload — so a finished upload is never left stranded as a placeholder.
 */

/** Longest side, in pixels. Plenty for reading on a retina screen, and a photo shrinks to a few hundred KB. */
const MAX_SIDE = 2048;
const QUALITY = 0.86;

export const UPLOADING_PREFIX = "uploading:";

/** Uploads in flight or finished during this page's life, by placeholder token. */
const results = new Map<string, string | null | undefined>(); // url, null = failed, undefined = pending
const liveViews = new Set<EditorView>();

/** For the live preview: how a placeholder should be drawn. */
export function uploadStatus(token: string): "pending" | "failed" | "lost" {
  if (!results.has(token)) return "lost"; // from before a reload; its upload is gone
  return results.get(token) === null ? "failed" : "pending";
}

type Shrunk = { blob: Blob; width: number; height: number };

/**
 * A smaller copy of the image, as WebP (or JPEG where the browser can't write
 * WebP). GIFs are left alone so they keep moving, and an image that is already
 * small is kept as it is when re-encoding wouldn't help.
 */
export async function shrinkImage(file: File): Promise<Shrunk> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = bitmap;

  if (file.type === "image/gif") {
    bitmap.close();
    return { blob: file, width, height };
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));

  let blob = await encode("image/webp");
  if (!blob || blob.type !== "image/webp") {
    // JPEG has no transparency; paint white underneath so a transparent
    // screenshot doesn't turn black.
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, w, h);
    blob = await encode("image/jpeg");
  }

  const keepOriginal = !blob || (scale === 1 && file.size <= blob.size && file.size <= MAX_IMAGE_BYTES);
  return keepOriginal ? { blob: file, width, height } : { blob: blob!, width: w, height: h };
}

async function upload(file: File): Promise<string> {
  const { blob, width, height } = await shrinkImage(file);
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("That image is too large, even after shrinking it");

  const response = await fetch(`/api/images?width=${width}&height=${height}`, {
    method: "POST",
    headers: { "content-type": blob.type || "application/octet-stream" },
    body: blob,
  });
  const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!response.ok || !data?.url) throw new Error(data?.error ?? "The image couldn't be uploaded");
  return data.url;
}

/** Replaces a placeholder in one editor, if that editor still has it. */
function resolveIn(view: EditorView, token: string) {
  const url = results.get(token);
  if (url === undefined) return;

  const text = view.state.doc.toString();
  const placeholder = new RegExp(`!\\[[^\\]\\n]*\\]\\(${UPLOADING_PREFIX}${token}\\)`);
  const match = placeholder.exec(text);
  if (!match) return;

  view.dispatch({
    changes: { from: match.index, to: match.index + match[0].length, insert: url ? `![](${url})` : "" },
    userEvent: "input.paste",
  });
}

function insertImages(view: EditorView, files: File[], from: number, to: number, onError: (message: string) => void) {
  const tokens = files.map(() => Math.random().toString(36).slice(2, 10));
  const line = view.state.doc.lineAt(from);

  // Images read best on a line of their own.
  const before = from > line.from ? "\n" : "";
  const after = to < view.state.doc.lineAt(to).to ? "\n" : "";
  const insert = before + tokens.map((token) => `![Uploading…](${UPLOADING_PREFIX}${token})`).join("\n") + after;

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
    userEvent: "input.paste",
  });

  files.forEach((file, index) => {
    const token = tokens[index];
    results.set(token, undefined);
    upload(file)
      .then((url) => results.set(token, url))
      .catch((error: unknown) => {
        results.set(token, null);
        onError(error instanceof Error ? error.message : "The image couldn't be uploaded");
      })
      .finally(() => {
        for (const live of liveViews) resolveIn(live, token);
      });
  });
}

function imageFiles(list: FileList | undefined | null): File[] {
  return [...(list ?? [])].filter((file) => file.type.startsWith("image/"));
}

export function imagePasting({ onError }: { onError: (message: string) => void }): Extension {
  // Tracks open editors, and finishes any placeholder whose upload completed
  // while its note was closed.
  const tracker = ViewPlugin.fromClass(
    class {
      constructor(readonly view: EditorView) {
        liveViews.add(view);
        const text = view.state.doc.toString();
        for (const match of text.matchAll(new RegExp(`\\(${UPLOADING_PREFIX}([a-z0-9]+)\\)`, "g"))) {
          // Deferred: an editor can't be changed while it is still being built.
          queueMicrotask(() => resolveIn(view, match[1]));
        }
      }
      destroy() {
        liveViews.delete(this.view);
      }
    },
  );

  const handlers = EditorView.domEventHandlers({
    paste(event, view) {
      const files = imageFiles(event.clipboardData?.files);
      if (!files.length) return false;
      event.preventDefault();
      const { from, to } = view.state.selection.main;
      insertImages(view, files, from, to, onError);
      return true;
    },
    drop(event, view) {
      const files = imageFiles(event.dataTransfer?.files);
      if (!files.length) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      insertImages(view, files, pos, pos, onError);
      return true;
    },
  });

  return [tracker, handlers];
}
