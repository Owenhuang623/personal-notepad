import { asc, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { notes, workSessions } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Every note and every recorded hour, every column, including the notes in the
 * trash — a complete copy of the database that can be read without this app and
 * restored into a new one. Downloaded rather than rendered, so it works from any
 * device, which is the point: a backup you can only take at your desk is one you
 * will not take.
 */
export async function GET() {
  const db = getDb();

  const [rows, sessions] = await Promise.all([
    db.select().from(notes).orderBy(desc(notes.createdAt)),
    db.select().from(workSessions).orderBy(asc(workSessions.localDate), asc(workSessions.startedAt)),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    // Bumped when work_sessions joined the export; a format 1 file has no hours.
    format: 2,
    count: rows.length,
    notes: rows,
    workSessions: sessions,
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="notepad-${stamp}.json"`,
      // A backup must never be served from a cache.
      "cache-control": "no-store",
    },
  });
}
