import { isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { workSessions } from "@/db/schema";
import { closeStaleSessions, getRunningSession, toSummary } from "@/lib/work";
import { isDateKey, MAX_SESSION_SECONDS } from "@/lib/work-rules";

/**
 * Start and pause the stopwatch.
 *
 * Nothing here holds a clock. Starting writes a row with an open end; pausing
 * closes it and records how long it was open. The elapsed time on screen is the
 * browser subtracting `startedAt` from now, which is why a reload, a redeploy or
 * a different device all still show the same running session.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (body?.action === "start") {
    if (!isDateKey(body?.date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    // A stale session would otherwise block the insert on the running-session
    // index, and the writer would be told they're already timing something they
    // stopped caring about last Thursday.
    await closeStaleSessions();

    const [created] = await getDb()
      .insert(workSessions)
      .values({ localDate: body.date, source: "timer" })
      .onConflictDoNothing()
      .returning();

    // No row back means a session was already running — another tab, another
    // device. Start is idempotent: hand back the one that exists.
    const running = created ? toSummary(created) : await getRunningSession();
    return NextResponse.json({ running }, { status: created ? 201 : 200 });
  }

  if (body?.action === "stop") {
    /*
     * The duration is computed by the database from its own clock, capped, so a
     * browser with a skewed clock — or a request that sat in a queue — can't
     * write a length that doesn't match the timestamps beside it.
     */
    const [stopped] = await getDb()
      .update(workSessions)
      .set({
        endedAt: sql`now()`,
        durationSeconds: sql`least(
          floor(extract(epoch from now() - ${workSessions.startedAt}))::int,
          ${MAX_SESSION_SECONDS}
        )`,
      })
      .where(isNull(workSessions.endedAt))
      .returning();

    if (!stopped) return NextResponse.json({ error: "Nothing is running" }, { status: 409 });

    return NextResponse.json({ session: toSummary(stopped), running: null });
  }

  return NextResponse.json({ error: "action must be start or stop" }, { status: 400 });
}
