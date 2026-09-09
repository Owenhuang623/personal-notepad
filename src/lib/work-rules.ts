/**
 * What a block of work is, and what makes one valid.
 *
 * Deliberately free of database and React imports so that the browser, the
 * route handlers and the tests all share one copy of these rules. Anything here
 * is pure: give it the same inputs and it gives the same answer, which is what
 * makes the totals worth testing.
 */

export type WorkSessionSummary = {
  id: string;
  localDate: string;
  startedAt: string;
  /** Null while the stopwatch is running; the elapsed time is derived instead. */
  endedAt: string | null;
  durationSeconds: number;
  source: "timer" | "manual";
  autoStopped: boolean;
};

/** A session with its length resolved — live for the one currently running. */
export type WorkSessionView = WorkSessionSummary & { seconds: number; running: boolean };

export type WorkDay = { key: string; seconds: number; sessions: WorkSessionView[] };

/**
 * How long a stopwatch left running is allowed to keep accruing.
 *
 * A timer forgotten overnight would otherwise quietly add fourteen hours to the
 * week, and a total you have to second-guess is worse than no total at all.
 * Anything still open past this is closed *at* the cap — not at the moment it
 * was noticed — and flagged, so it shows up in the log as something to correct.
 */
export const MAX_SESSION_SECONDS = 8 * 60 * 60;

/** The longest a single hand-entered block can be. A day has a ceiling. */
export const MAX_MANUAL_SECONDS = 24 * 60 * 60;

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * A duration submitted from outside, or null if it isn't one.
 *
 * Rejects rather than clamps: a request for 40 hours is a mistake somewhere, and
 * silently recording 24 would put a number in the week that nobody typed.
 */
export function parseDurationSeconds(value: unknown, max = MAX_MANUAL_SECONDS): number | null {
  const seconds = Math.floor(Number(value));
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > max) return null;
  return seconds;
}

/**
 * How long the running session has been open, capped exactly as the server will
 * cap it — so the clock on screen never promises time the database won't record.
 */
export function elapsedSeconds(startedAt: string | null, now: number): number {
  if (!startedAt) return 0;

  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return 0;

  return Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.floor((now - started) / 1000)));
}

/**
 * The total across a span of days, `from`..`to` inclusive.
 *
 * Both halves are filtered by the span. That sounds obvious, and it is the whole
 * point: an earlier version filtered only the running session and summed every
 * closed row it was handed, which was invisibly correct for the week bar — it is
 * given exactly one week of rows — and wrong for the day clock, which is handed
 * the same week and a one-day span. Today's total silently included the rest of
 * the week, so it never went back to zero at midnight.
 *
 * The running session also appears in `sessions` carrying a duration of 0, so
 * adding its live elapsed time counts it exactly once.
 */
export function totalSeconds(
  sessions: WorkSessionSummary[],
  running: WorkSessionSummary | null,
  elapsed: number,
  from: string | null,
  to: string | null,
): number {
  if (!from || !to) return 0;

  const within = (localDate: string) => localDate >= from && localDate <= to;

  const closed = sessions.reduce(
    (total, session) => (within(session.localDate) ? total + session.durationSeconds : total),
    0,
  );
  const live = running && within(running.localDate) ? elapsed : 0;

  return closed + live;
}

/**
 * Whether a running session has been left open into a new day.
 *
 * A block belongs to the day it started on, so a stopwatch running from 11pm to
 * 1am would otherwise keep counting toward yesterday — and "Today" would show
 * last night's hours well into the morning, which is the opposite of resetting
 * at midnight. The answer is to close it at the boundary and open a fresh one
 * dated the new day: each day then keeps the part that was actually worked in
 * it, and the clock starts from zero exactly when the date does.
 */
export function shouldRollOver(running: WorkSessionSummary | null, today: string | null): boolean {
  return running !== null && today !== null && running.localDate !== today;
}

/**
 * The seven days of a week starting at `weekStart`, empty ones included — a
 * week you can only see the worked days of isn't much of an accountability tool.
 */
export function buildDays(
  weekStart: string,
  sessions: WorkSessionSummary[],
  running: WorkSessionSummary | null,
  elapsed: number,
  shift: (key: string, days: number) => string,
): WorkDay[] {
  return Array.from({ length: 7 }, (_, offset) => {
    const key = shift(weekStart, offset);

    const forDay = sessions
      .filter((session) => session.localDate === key)
      .map<WorkSessionView>((session) => {
        const live = running?.id === session.id;
        return { ...session, running: live, seconds: live ? elapsed : session.durationSeconds };
      });

    return {
      key,
      sessions: forDay,
      seconds: forDay.reduce((total, session) => total + session.seconds, 0),
    };
  });
}
