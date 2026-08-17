import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { notes } from "@/db/schema";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (typeof body?.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }

  const [updated] = await getDb()
    .update(notes)
    .set({ content: body.content, updatedAt: new Date() })
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
