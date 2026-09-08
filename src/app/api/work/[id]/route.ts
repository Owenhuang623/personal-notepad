import { and, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { workSessions } from "@/db/schema";
import { toSummary } from "@/lib/work";
import { isDateKey, MAX_MANUAL_SECONDS, parseDurationSeconds } from "@/lib/work-rules";

type Params = { params: Promise<{ id: string }> };

/**
 * Corrects a block that was recorded wrong — the timer left running through
 * lunch, or a session filed against the wrong day.
 *
 * Only closed blocks can be edited: the running one has no length yet, and
 * giving it one would mean deciding whether the clock keeps going.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const updates: {
    localDate?: string;
    durationSeconds?: number;
    endedAt?: ReturnType<typeof sql>;
    autoStopped?: boolean;
  } = {};

  if (body?.seconds !== undefined) {
    const seconds = parseDurationSeconds(body.seconds);
    if (seconds === null) {
      return NextResponse.json(
        { error: `seconds must be between 1 and ${MAX_MANUAL_SECONDS}` },
        { status: 400 },
      );
    }

    updates.durationSeconds = seconds;
    // Keep `ended_at - started_at` equal to the duration, so the clock times
    // shown beside a corrected block still describe it.
    updates.endedAt = sql`${workSessions.startedAt} + make_interval(secs => ${seconds})`;
    // Once a human has confirmed the length, it isn't a guess by the cap.
    updates.autoStopped = false;
  }

  if (body?.date !== undefined) {
    if (!isDateKey(body.date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }
    updates.localDate = body.date;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const [updated] = await getDb()
    .update(workSessions)
    .set(updates)
    .where(and(eq(workSessions.id, id), isNotNull(workSessions.endedAt)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ session: toSummary(updated) });
}

/**
 * Removes one block, permanently — a stopwatch reading is not writing, and a
 * wrong one is noise rather than something to keep in a trash. The id can only
 * have come from a row this endpoint already returned, and the `where` is
 * pinned to that single row of `work_sessions`.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;

  const [deleted] = await getDb()
    .delete(workSessions)
    .where(eq(workSessions.id, id))
    .returning({ id: workSessions.id });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
