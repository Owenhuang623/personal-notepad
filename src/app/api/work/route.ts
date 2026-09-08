import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { workSessions } from "@/db/schema";
import { closeStaleSessions, getWeek, isStale, toSummary } from "@/lib/work";
import { isDateKey, MAX_MANUAL_SECONDS, parseDurationSeconds } from "@/lib/work-rules";

/**
 * A week's worth of work, plus whatever is running right now.
 *
 * The running session comes back separately and unconditionally: it may have
 * started before the requested window (a Saturday-night session still going on
 * Sunday morning), and the client needs it either way to know which button to
 * draw.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");

  if (!isDateKey(from) || !isDateKey(to)) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });
  }

  const week = await getWeek(from, to);

  /*
   * The corrective write only happens when there is something to correct.
   *
   * This used to run before every read so that a forgotten timer could never be
   * shown uncapped — right, but it charged every single poll a round trip to
   * update no rows. Reading first and checking the timestamp we already have
   * costs nothing and reaches the same place: the capped number still appears on
   * the first load that notices, never the second.
   */
  if (isStale(week.running)) {
    await closeStaleSessions();
    return NextResponse.json(await getWeek(from, to));
  }

  return NextResponse.json(week);
}

/** Records a block of time after the fact — work that happened without the stopwatch. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isDateKey(body?.date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const seconds = parseDurationSeconds(body?.seconds);
  if (seconds === null) {
    return NextResponse.json(
      { error: `seconds must be between 1 and ${MAX_MANUAL_SECONDS}` },
      { status: 400 },
    );
  }

  /*
   * Both timestamps come from the same `now()` in the same statement, so
   * `ended_at - started_at` equals the duration here exactly as it does for a
   * stopwatch session. They still describe nothing real — a block typed in
   * after the fact has a length but no clock times, and `source` is what tells
   * the log to show the length alone rather than invent a range.
   */
  const [created] = await getDb()
    .insert(workSessions)
    .values({
      localDate: body.date,
      startedAt: sql`now()`,
      endedAt: sql`now() + make_interval(secs => ${seconds})`,
      durationSeconds: seconds,
      source: "manual",
    })
    .returning();

  return NextResponse.json({ session: toSummary(created) }, { status: 201 });
}
