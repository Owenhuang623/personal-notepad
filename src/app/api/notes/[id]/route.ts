import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { notes } from "@/db/schema";

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

  try {
    const [updated] = await getDb()
      .update(notes)
      .set(updates)
      .where(eq(notes.id, id))
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

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;

  // Anything but the scratchpad, which can only ever be cleared.
  const [deleted] = await getDb()
    .delete(notes)
    .where(and(eq(notes.id, id), ne(notes.kind, "scratch")))
    .returning({ id: notes.id });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
