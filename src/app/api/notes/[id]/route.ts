import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { notes } from "@/db/schema";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  // Only the fields actually present are written, so an autosave carrying just
  // `content` never disturbs the pin, and a pin toggle never touches the text.
  const updates: { content?: string; updatedAt?: Date; pinnedAt?: Date | null } = {};

  if (typeof body?.content === "string") {
    updates.content = body.content;
    updates.updatedAt = new Date();
  }

  if (typeof body?.pinned === "boolean") {
    // Pinning deliberately leaves updatedAt alone — it isn't an edit, and
    // bumping it would shuffle the note's position in the list.
    updates.pinnedAt = body.pinned ? new Date() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const [updated] = await getDb()
    .update(notes)
    .set(updates)
    .where(eq(notes.id, id))
    .returning({ id: notes.id, updatedAt: notes.updatedAt });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ updatedAt: updated.updatedAt.toISOString() });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;

  // Scoped to `saved` so the scratchpad can never be deleted, only cleared.
  const [deleted] = await getDb()
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.kind, "saved")))
    .returning({ id: notes.id });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
