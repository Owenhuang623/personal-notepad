import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { notes } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Every note, every column, including the ones in the trash — a complete copy
 * of the database that can be read without this app and restored into a new
 * one. Downloaded rather than rendered, so it works from any device.
 */
export async function GET() {
  const rows = await getDb().select().from(notes).orderBy(desc(notes.createdAt));

  const payload = {
    exportedAt: new Date().toISOString(),
    format: 1,
    count: rows.length,
    notes: rows,
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
