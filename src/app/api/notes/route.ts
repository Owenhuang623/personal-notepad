import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { notes } from "@/db/schema";
import { isMissingFolder, isUuid } from "@/lib/validate";
import { listSidebar, toSummary } from "@/lib/notes";

export async function GET() {
  return NextResponse.json(await listSidebar());
}

/** Creates a saved note, optionally inside a folder. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content : "";

  const folderId = body?.folderId ?? null;
  if (folderId !== null && !isUuid(folderId)) {
    return NextResponse.json({ error: "folderId must be a folder id or null" }, { status: 400 });
  }

  const [created] = await getDb()
    .insert(notes)
    .values({ kind: "saved", content, folderId })
    .returning()
    .catch((error: unknown) => {
      if (isMissingFolder(error)) return [];
      throw error;
    });

  if (!created) return NextResponse.json({ error: "That folder doesn't exist" }, { status: 404 });

  // The whole summary, not just the id: the sidebar can then show the new note
  // immediately instead of re-fetching the entire list to learn about it.
  return NextResponse.json({ id: created.id, note: toSummary(created) }, { status: 201 });
}
