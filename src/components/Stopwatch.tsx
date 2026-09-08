"use client";

import { memo, useEffect, useState } from "react";

import { formatStopwatch } from "@/lib/format";
import { elapsedSeconds } from "@/lib/work-rules";

/**
 * The only thing on the page that changes every second.
 *
 * It is a component of its own precisely so that it can be: the bar around it
 * shows minute-granularity totals, and re-rendering that whole subtree — the
 * open log panel and all of its rows included — sixty times a minute produced
 * exactly the same strings. Here the interval only exists while something is
 * running, and it re-renders one `<span>`.
 */
export const Stopwatch = memo(function Stopwatch({
  baseSeconds,
  startedAt,
}: {
  /** Time already banked today, before the running session. */
  baseSeconds: number;
  /** When the running session began, or null when nothing is running. */
  startedAt: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;

    // Re-read immediately: the tab may have been asleep, and waiting a full
    // second to correct the display is a visible stutter on wake.
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  const live = elapsedSeconds(startedAt, now);

  return (
    <span
      className={`tabular-nums text-[13px] transition-colors ${
        startedAt ? "text-ink" : "text-ink-muted"
      }`}
      title={
        startedAt
          ? "Today's total, counting up. Resets when the day turns over."
          : "Today's total. Start picks up from here."
      }
    >
      {formatStopwatch(baseSeconds + live)}
    </span>
  );
});
