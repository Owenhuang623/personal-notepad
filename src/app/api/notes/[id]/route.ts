import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { notes } from "@/db/schema";
import { purgeWhere, softDeleteWhere, structuralUpdateWhere } from "@/lib/notes";

type Params = { params: Promise<{ id: string }> };

/**
 * Drizzle wraps driver errors in a "Failed query" Error, so the constraint name
 * and SQLSTATE live further down the cause chain rather than on the message.
 */
function isDuplicateDay(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current; depth++) {
    const candidate = current as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    };

    if (candidate.constraint === "notes_one_per_day") return true;
    if (candidate.code === "23505") return true; // unique_violation
    if (candidate.message?.includes("notes_one_per_day")) return true;

    current = candidate.cause;
  }

  return false;
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  // Only the fields actually present are written, so an autosave carrying just
  // `content` never disturbs the pin, and a pin toggle never touches the text.
  const updates: {
    content?: string;
    updatedAt?: Date;
    pinnedAt?: Date | null;
    deletedAt?: Date | null;
    title?: string | null;
    kind?: "saved" | "daily";
    journalDate?: string | null;
  } = {};

  if (typeof body?.content === "string") {
    updates.content = body.content;
    updates.updatedAt = new Date();
  }

  if (typeof body?.pinned === "boolean") {
    // Pinning deliberately leaves updatedAt alone — it isn't an edit, and
    // bumping it would shuffle the note's position in the list.
    updates.pinnedAt = body.pinned ? new Date() : null;
  }

  if (typeof body?.title === "string" || body?.title === null) {
    // An empty name isn't a name — fall back to deriving it from the first line.
    const trimmed = typeof body.title === "string" ? body.title.trim() : "";
    updates.title = trimmed === "" ? null : trimmed;
  }

  if (body?.restore === true) {
    updates.deletedAt = null;
  }

  if (body?.move === "journal") {
    if (typeof body?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: "move to journal needs a date" }, { status: 400 });
    }
    updates.kind = "daily";
    updates.journalDate = body.date;
  } else if (body?.move === "notes") {
    updates.kind = "saved";
    updates.journalDate = null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  /*
   * Editing the scratchpad's text is fine; everything else about it is fixed.
   * Renaming it would go nowhere — its heading is the section name — and
   * pinning, moving or trashing it would leave the dashboard to lazily create a
   * fresh empty row, stranding the writing behind it somewhere unexpected.
   */
  const structural =
    updates.kind !== undefined ||
    updates.pinnedAt !== undefined ||
    updates.deletedAt !== undefined ||
    updates.title !== undefined;

  try {
    const [updated] = await getDb()
      .update(notes)
      .set(updates)
      .where(structural ? structuralUpdateWhere(id) : eq(notes.id, id))
      .returning({ id: notes.id, updatedAt: notes.updatedAt });

    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ updatedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    if (isDuplicateDay(error)) {
      return NextResponse.json(
        { error: "That day already has a journal entry" },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const permanent = new URL(request.url).searchParams.get("permanent") === "1";
  const db = getDb();

  if (!permanent) {
    // Anything but a singleton, which can only ever be cleared.
    const [deleted] = await db
      .update(notes)
      .set({ deletedAt: new Date() })
      .where(softDeleteWhere(id))
      .returning({ id: notes.id });

    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, permanent: false });
  }

  /*
   * Permanent removal is deliberately only reachable for rows already in the
   * trash. A single stray DELETE can therefore never destroy a live note — it
   * can only move it somewhere recoverable.
   */
  const [purged] = await db
    .delete(notes)
    .where(purgeWhere(id))
    .returning({ id: notes.id });

  if (!purged) {
    return NextResponse.json(
      { error: "Only notes already in the trash can be permanently deleted" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, permanent: true });
}
