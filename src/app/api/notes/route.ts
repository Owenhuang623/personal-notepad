import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { notes } from "@/db/schema";
import { listSavedNotes, toSummary } from "@/lib/notes";

export async function GET() {
  return NextResponse.json({ notes: await listSavedNotes() });
}

/** Creates a saved note — either an empty one, or a copy of the scratchpad's text. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content : "";

  const [created] = await getDb().insert(notes).values({ kind: "saved", content }).returning();

  // The whole summary, not just the id: the sidebar can then show the new note
  // immediately instead of re-fetching the entire list to learn about it.
  return NextResponse.json({ id: created.id, note: toSummary(created) }, { status: 201 });
}
