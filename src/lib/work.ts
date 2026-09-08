import "server-only";

import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { workSessions, type WorkSession } from "@/db/schema";
import { MAX_SESSION_SECONDS, type WorkSessionSummary } from "@/lib/work-rules";

export type { WorkSessionSummary };

const cap = sql`make_interval(secs => ${MAX_SESSION_SECONDS})`;

/**
 * Closes a stopwatch that has run past the cap, ending it *at* the cap rather
 * than at the moment it was noticed — the hours in between weren't worked.
 *
 * Called on read, so a timer forgotten on Friday is corrected by whatever page
 * load happens next. There is no scheduler here to hang this off, and one more
 * `UPDATE … WHERE` that almost never matches a row is cheaper than one.
 */
export async function closeStaleSessions(): Promise<void> {
  await getDb()
    .update(workSessions)
    .set({
      endedAt: sql`${workSessions.startedAt} + ${cap}`,
      durationSeconds: MAX_SESSION_SECONDS,
      autoStopped: true,
    })
    .where(and(isNull(workSessions.endedAt), sql`now() > ${workSessions.startedAt} + ${cap}`));
}

export async function getRunningSession(): Promise<WorkSessionSummary | null> {
  const [row] = await getDb()
    .select()
    .from(workSessions)
    .where(isNull(workSessions.endedAt))
    .limit(1);

  return row ? toSummary(row) : null;
}

/**
 * Every block dated within `from`..`to` inclusive, plus whatever is running,
 * oldest first.
 *
 * The bounds are local date keys supplied by the browser — the caller decides
 * which week it is looking at, because only the browser knows what Sunday means.
 *
 * Deliberately one query rather than two. The Neon HTTP driver opens a fresh
 * request per statement, so a second `select` for the running session cost a
 * whole network round trip to learn about a row that is usually already in the
 * first result. `or ended_at is null` picks it up even when it belongs to a week
 * the caller isn't looking at.
 */
export async function getWeek(
  from: string,
  to: string,
): Promise<{ sessions: WorkSessionSummary[]; running: WorkSessionSummary | null }> {
  const rows = await getDb()
    .select()
    .from(workSessions)
    .where(
      or(
        and(gte(workSessions.localDate, from), lte(workSessions.localDate, to)),
        isNull(workSessions.endedAt),
      ),
    )
    .orderBy(asc(workSessions.localDate), asc(workSessions.startedAt));

  const running = rows.find((row) => row.endedAt === null);

  return {
    // The running row is only part of this week if its day actually falls in it.
    sessions: rows
      .filter((row) => row.localDate >= from && row.localDate <= to)
      .map(toSummary),
    running: running ? toSummary(running) : null,
  };
}

/**
 * Whether a running session has already outlived the cap.
 *
 * Lets the read path skip the corrective `UPDATE` entirely on the overwhelming
 * majority of requests, where nothing is stale and the statement would match no
 * rows — but still cost a round trip to find that out.
 */
export function isStale(running: WorkSessionSummary | null): boolean {
  return running !== null && Date.now() - Date.parse(running.startedAt) > MAX_SESSION_SECONDS * 1000;
}

export async function getWorkSession(id: string): Promise<WorkSessionSummary | null> {
  const [row] = await getDb().select().from(workSessions).where(eq(workSessions.id, id)).limit(1);
  return row ? toSummary(row) : null;
}

export function toSummary(row: WorkSession): WorkSessionSummary {
  return {
    id: row.id,
    localDate: row.localDate,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    source: row.source,
    autoStopped: row.autoStopped,
  };
}
