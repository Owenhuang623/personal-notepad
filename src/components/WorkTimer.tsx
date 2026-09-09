"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildDays,
  elapsedSeconds,
  shouldRollOver,
  totalSeconds,
  type WorkDay,
  type WorkSessionSummary,
} from "@/lib/work-rules";
import { formatDuration, localDateKey, shiftDateKey, startOfWeekKey } from "@/lib/format";
import { TIMEZONE_COOKIE, TIMEZONE_MAX_AGE } from "@/lib/timezone";

import { useSidebar } from "./AppShell";
import { Stopwatch } from "./Stopwatch";
import { WorkLog } from "./WorkLog";

export type InitialWeek = {
  weekStart: string;
  sessions: WorkSessionSummary[];
  running: WorkSessionSummary | null;
};

/**
 * Totals are shown to the minute, so recomputing them every second was sixty
 * times the work for the same string. The seconds that do move live in
 * <Stopwatch>, which owns its own interval; this one exists only to keep the
 * minute-accurate totals honest and to notice midnight.
 */
const TICK = 15_000;

/** Coming back to a tab you left ten seconds ago doesn't need a fresh request. */
const REFETCH_AFTER = 20_000;

/**
 * The week's work, and the stopwatch that feeds it.
 *
 * There is no counter to reset on Sunday. Every block of work is a row carrying
 * the local day it belongs to, and the total is a sum over the seven days of
 * whatever week it currently is — so the boundary moves on its own, and a reset
 * that failed to run can never cost a week.
 *
 * Nothing on this page owns the elapsed time either. The server records when a
 * session opened; the clock below is this browser subtracting that from now and
 * adding what the day already held. Reloading, redeploying or opening a second
 * device all show the same running total.
 */
export function WorkTimer({ initialWeek }: { initialWeek: InitialWeek | null }) {
  const [sessions, setSessions] = useState<WorkSessionSummary[]>(initialWeek?.sessions ?? []);
  const [running, setRunning] = useState<WorkSessionSummary | null>(initialWeek?.running ?? null);
  const [loaded, setLoaded] = useState(initialWeek !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  /*
   * Which week the log is showing, in weeks back from the current one. The bar
   * always reports the current week regardless — paging back through history
   * shouldn't change the number you are being held to right now.
   */
  const [weekOffset, setWeekOffset] = useState(0);
  const [pastSessions, setPastSessions] = useState<WorkSessionSummary[]>([]);

  /*
   * Null until mount, like ClientDate: the server is in UTC, so it doesn't know
   * which day it is here and certainly not which week. Everything below waits
   * for the browser to say.
   */
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localDateKey()), []);

  /*
   * Tell the server which timezone this is, so the next render can compute the
   * week itself instead of leaving the total blank until a fetch comes back.
   * Written on every visit because it is how the server learns the writer has
   * moved; it is a hint, and the check below is what makes it safe to be wrong.
   */
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;

    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=${TIMEZONE_MAX_AGE}; samesite=lax`;
  }, []);

  const { setOpen } = useSidebar();

  const weekStart = today ? startOfWeekKey(today) : null;
  const weekEnd = weekStart ? shiftDateKey(weekStart, 6) : null;

  /** The week the log is looking at — the same thing when `weekOffset` is 0. */
  const viewStart = weekStart ? shiftDateKey(weekStart, weekOffset * 7) : null;
  const viewEnd = viewStart ? shiftDateKey(viewStart, 6) : null;

  /** Set once the server's seed has been accepted or replaced. */
  const seededWeek = useRef(initialWeek?.weekStart ?? null);
  const lastLoadedAt = useRef(initialWeek ? Date.now() : 0);

  const load = useCallback(async () => {
    if (!weekStart || !weekEnd) return;

    /*
     * The server rendered this week already. Trust it only if it is the week
     * this browser also thinks it is — a stale timezone cookie, or a tab open
     * across midnight on Sunday, and the two disagree; then we fetch.
     */
    if (seededWeek.current === weekStart) {
      seededWeek.current = null;
      return;
    }

    try {
      const response = await fetch(`/api/work?from=${weekStart}&to=${weekEnd}`);
      if (!response.ok) throw new Error(String(response.status));

      const data = (await response.json()) as {
        sessions: WorkSessionSummary[];
        running: WorkSessionSummary | null;
      };

      setSessions(data.sessions);
      setRunning(data.running);
      setError(null);
      lastLoadedAt.current = Date.now();
    } catch {
      setError("Offline");
    } finally {
      setLoaded(true);
    }
  }, [weekStart, weekEnd]);

  /**
   * A week other than the current one. Kept in its own state so the bar's total
   * and the running session never depend on where the log has been paged to.
   */
  const loadPast = useCallback(async () => {
    if (weekOffset === 0 || !viewStart || !viewEnd) return;

    try {
      const response = await fetch(`/api/work?from=${viewStart}&to=${viewEnd}`);
      if (!response.ok) throw new Error(String(response.status));

      const data = (await response.json()) as { sessions: WorkSessionSummary[] };
      setPastSessions(data.sessions);
      setError(null);
    } catch {
      setError("Offline");
    }
  }, [weekOffset, viewStart, viewEnd]);

  const reload = useCallback(async () => {
    await Promise.all([load(), loadPast()]);
  }, [load, loadPast]);

  useEffect(() => void load(), [load]);
  useEffect(() => void loadPast(), [loadPast]);

  // Midnight on Sunday shifts every week key by one. Snapping back to the
  // current week is the only reading of "the week moved" that isn't a surprise.
  useEffect(() => setWeekOffset(0), [weekStart]);

  /*
   * Ticking also re-reads the calendar day, so a session that crosses midnight
   * — or a page left open into Sunday — moves the window without a reload.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      setToday((current) => {
        const key = localDateKey();
        return key === current ? current : key;
      });
    }, TICK);

    return () => clearInterval(interval);
  }, []);

  /*
   * Coming back to the tab re-reads from the server: the cap may have closed a
   * forgotten session in the meantime, or the stopwatch may have been paused on
   * a phone.
   */
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Flicking between tabs shouldn't fire a request each time; anything the
      // cap or another device changed will still be seconds old at worst.
      if (Date.now() - lastLoadedAt.current < REFETCH_AFTER) return;
      void load();
    };

    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [load]);

  /** How long the *current* session has been open. Capped, as the server will cap it. */
  const elapsed = elapsedSeconds(running?.startedAt ?? null, now);

  /*
   * The day the clock is counting for.
   *
   * Today, almost always — the rollover above keeps a running session on the
   * current date. Falling back to the session's own day covers the seconds
   * before that write lands, and the case where it can't land at all because
   * the network is gone: better a clock that keeps counting on yesterday's date
   * than one that reads zero underneath a visibly running stopwatch.
   */
  const clockDay = running?.localDate ?? today;

  /**
   * What the stopwatch reads: everything worked on `clockDay`, not just the
   * session currently open.
   *
   * Pausing therefore leaves the number where it is and Start picks it up from
   * there — pausing to take a call shouldn't cost you the morning. It falls
   * back to zero on its own when the day turns over, because `clockDay` moves
   * and a new day has nothing behind it yet.
   */
  /**
   * Everything already banked on `clockDay`, without the running session.
   *
   * <Stopwatch> adds the live part on its own clock, so this value only has to
   * change when a session is closed — which keeps the whole bar off the
   * once-a-second render path.
   */
  const clockClosedSeconds = useMemo(
    () => totalSeconds(sessions, null, 0, clockDay, clockDay),
    [sessions, clockDay],
  );

  /** What the log is listing: the current week, or the past one being viewed. */
  const viewSessions = weekOffset === 0 ? sessions : pastSessions;

  const weekSeconds = useMemo(
    () => totalSeconds(sessions, running, elapsed, weekStart, weekEnd),
    [sessions, running, elapsed, weekStart, weekEnd],
  );

  const viewSeconds = useMemo(
    () => totalSeconds(viewSessions, running, elapsed, viewStart, viewEnd),
    [viewSessions, running, elapsed, viewStart, viewEnd],
  );

  const days = useMemo<WorkDay[]>(
    () => (viewStart ? buildDays(viewStart, viewSessions, running, elapsed, shiftDateKey) : []),
    [viewStart, viewSessions, running, elapsed],
  );

  /** Serialises the write and reloads, so the panel never shows a stale total. */
  const mutate = useCallback(
    async (request: () => Promise<Response>, failure: string) => {
      setBusy(true);
      try {
        const response = await request();
        if (!response.ok) throw new Error(String(response.status));
        setError(null);
      } catch {
        setError(failure);
      } finally {
        // A write invalidates whatever the seed or the last poll said.
        seededWeek.current = null;
        lastLoadedAt.current = 0;
        await reload();
        setBusy(false);
      }
    },
    [reload],
  );

  /*
   * Midnight, with the stopwatch still going: close the session on the day it
   * belongs to and open a fresh one on the new day. Each day then keeps only
   * the hours actually worked in it, and "Today" starts from zero when the date
   * does rather than carrying the small hours of the previous evening.
   *
   * Uses the ordinary stop and start endpoints — the same two writes the buttons
   * make, so there is no third path to the running-session index to get wrong.
   */
  useEffect(() => {
    if (busy || !today || !shouldRollOver(running, today)) return;

    void mutate(async () => {
      await fetch("/api/work/timer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });

      return fetch("/api/work/timer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", date: today }),
      });
    }, "Couldn't roll the timer over to today");
  }, [running, today, busy, mutate]);

  const toggle = useCallback(() => {
    if (!today) return;

    // Optimistic only in the direction that has no number attached: showing the
    // clock at 00:00:00 for a moment is fine, inventing minutes is not.
    void mutate(
      () =>
        fetch("/api/work/timer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(running ? { action: "stop" } : { action: "start", date: today }),
        }),
      running ? "Couldn't pause" : "Couldn't start",
    );
  }, [mutate, running, today]);

  const addTime = useCallback(
    (date: string, seconds: number) =>
      mutate(
        () =>
          fetch("/api/work", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ date, seconds }),
          }),
        "Couldn't add that",
      ),
    [mutate],
  );

  const editTime = useCallback(
    (id: string, seconds: number) =>
      mutate(
        () =>
          fetch(`/api/work/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ seconds }),
          }),
        "Couldn't save that",
      ),
    [mutate],
  );

  const removeTime = useCallback(
    (id: string) => mutate(() => fetch(`/api/work/${id}`, { method: "DELETE" }), "Couldn't remove that"),
    [mutate],
  );

  // Clicking away closes the log, but not while a click lands inside it.
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!logOpen) return;

    const close = () => {
      setLogOpen(false);
      // Reopening should start at the present rather than wherever browsing left off.
      setWeekOffset(0);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) close();
    };
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [logOpen]);

  return (
    <div ref={panelRef} className="relative shrink-0">
      <header className="flex h-14 items-center gap-2 border-b border-line px-3 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-ml-1 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-hover hover:text-ink md:hidden"
        >
          <MenuIcon />
        </button>

        <div className="flex min-w-0 items-baseline gap-2">
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint sm:inline">
            This week
          </span>
          <span className="text-[15px] font-medium tabular-nums">
            {loaded ? formatDuration(weekSeconds) : "—"}
          </span>
        </div>

        <div className="flex-1" />

        {error && <span className="text-[12px] text-danger">{error}</span>}

        <span className="hidden text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint sm:inline">
          Today
        </span>

        {/* Owns the only thing on this bar that changes every second. */}
        <Stopwatch baseSeconds={clockClosedSeconds} startedAt={running?.startedAt ?? null} />

        <button
          type="button"
          onClick={toggle}
          disabled={busy || !today}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40 ${
            running
              ? "bg-hover text-ink hover:bg-active"
              : "text-ink-muted hover:bg-hover hover:text-ink"
          }`}
        >
          {running ? <PauseIcon /> : <PlayIcon />}
          {running ? "Pause" : "Start"}
        </button>

        <button
          type="button"
          onClick={() => {
            setLogOpen((open) => !open);
            setWeekOffset(0);
          }}
          aria-expanded={logOpen}
          title="This week's log"
          className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-hover ${
            logOpen ? "bg-active text-ink" : "text-ink-muted hover:text-ink"
          }`}
        >
          Log
        </button>
      </header>

      {logOpen && viewStart && viewEnd && today && (
        <WorkLog
          days={days}
          weekStart={viewStart}
          weekEnd={viewEnd}
          weekOffset={weekOffset}
          today={today}
          total={viewSeconds}
          busy={busy}
          onWeekOffset={setWeekOffset}
          onAdd={addTime}
          onEdit={editTime}
          onRemove={removeTime}
        />
      )}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
      <path d="M4.5 2.8 12.6 8l-8.1 5.2z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
      <path d="M4 3h2.6v10H4zM9.4 3H12v10H9.4z" fill="currentColor" />
    </svg>
  );
}
