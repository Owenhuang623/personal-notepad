import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { notes } from "@/db/schema";
import { toSummary } from "@/lib/notes";

/**
 * Opens a day's journal entry, creating it if it doesn't exist yet.
 *
 * The date is supplied by the browser rather than derived here: the server runs
 * in UTC, so an entry written at 11pm local would otherwise be filed under the
 * following day.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (typeof body?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const db = getDb();

  const [existing] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.kind, "daily"), eq(notes.journalDate, body.date)))
    .limit(1);

  if (existing) return NextResponse.json({ id: existing.id, created: false });

  const [created] = await db
    .insert(notes)
    .values({ kind: "daily", journalDate: body.date, content: "" })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return NextResponse.json({ id: created.id, created: true, note: toSummary(created) }, { status: 201 });
  }

  // Lost an insert race — the other request's row is the one to use.
  const [raced] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.kind, "daily"), eq(notes.journalDate, body.date)))
    .limit(1);

  return NextResponse.json({ id: raced.id, created: false });
}
