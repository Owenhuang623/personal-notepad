import { describe, expect, it } from "vitest";

import { shiftDateKey } from "./format";
import {
  buildDays,
  elapsedSeconds,
  isDateKey,
  MAX_MANUAL_SECONDS,
  MAX_SESSION_SECONDS,
  parseDurationSeconds,
  totalSeconds,
  type WorkSessionSummary,
} from "./work-rules";

const WEEK_START = "2026-09-06"; // a Sunday
const WEEK_END = "2026-09-12";

function closed(localDate: string, durationSeconds: number, id = crypto.randomUUID()): WorkSessionSummary {
  return {
    id,
    localDate,
    startedAt: `${localDate}T09:00:00.000Z`,
    endedAt: `${localDate}T10:00:00.000Z`,
    durationSeconds,
    source: "timer",
    autoStopped: false,
  };
}

/** A running session, as the API returns one: no end, and a duration of 0. */
function open(localDate: string, startedAt: string, id = "running"): WorkSessionSummary {
  return {
    id,
    localDate,
    startedAt,
    endedAt: null,
    durationSeconds: 0,
    source: "timer",
    autoStopped: false,
  };
}

describe("isDateKey", () => {
  it("accepts a well-formed key", () => {
    expect(isDateKey("2026-09-06")).toBe(true);
  });

  it("rejects everything else", () => {
    for (const value of ["2026-9-6", "06-09-2026", "2026-09-06T00:00:00Z", "", "yesterday", null, 20260906, {}]) {
      expect(isDateKey(value)).toBe(false);
    }
  });
});

describe("parseDurationSeconds", () => {
  it("accepts a plain duration", () => {
    expect(parseDurationSeconds(3600)).toBe(3600);
    expect(parseDurationSeconds("5400")).toBe(5400);
  });

  it("floors fractions rather than storing them", () => {
    expect(parseDurationSeconds(90.7)).toBe(90);
  });

  it("rejects zero and negatives — an empty block is not a block", () => {
    expect(parseDurationSeconds(0)).toBeNull();
    expect(parseDurationSeconds(-60)).toBeNull();
  });

  it("rejects rather than clamps an over-long block", () => {
    // Clamping would silently record a number nobody typed.
    expect(parseDurationSeconds(MAX_MANUAL_SECONDS)).toBe(MAX_MANUAL_SECONDS);
    expect(parseDurationSeconds(MAX_MANUAL_SECONDS + 1)).toBeNull();
  });

  it("rejects junk", () => {
    for (const value of ["", "abc", null, undefined, NaN, Infinity, {}]) {
      expect(parseDurationSeconds(value)).toBeNull();
    }
  });
});

describe("elapsedSeconds", () => {
  const started = "2026-09-07T09:00:00.000Z";
  const startedMs = Date.parse(started);

  it("is zero when nothing is running", () => {
    expect(elapsedSeconds(null, startedMs)).toBe(0);
  });

  it("counts up in whole seconds", () => {
    expect(elapsedSeconds(started, startedMs + 5_400_000)).toBe(5400);
  });

  it("caps at the same ceiling the server enforces", () => {
    // Ten hours on the clock must still read as eight, because eight is what
    // the database will have recorded by the time anyone looks.
    expect(elapsedSeconds(started, startedMs + 10 * 3600 * 1000)).toBe(MAX_SESSION_SECONDS);
  });

  it("never goes negative if the clock disagrees with the server", () => {
    expect(elapsedSeconds(started, startedMs - 60_000)).toBe(0);
  });

  it("ignores an unparseable timestamp rather than rendering NaN", () => {
    expect(elapsedSeconds("not a date", startedMs)).toBe(0);
  });
});

describe("totalSeconds", () => {
  it("adds up closed blocks", () => {
    const sessions = [closed("2026-09-06", 8100), closed("2026-09-07", 11_400)];
    expect(totalSeconds(sessions, null, 0, WEEK_START, WEEK_END)).toBe(19_500);
  });

  it("is zero for a week with nothing in it", () => {
    expect(totalSeconds([], null, 0, WEEK_START, WEEK_END)).toBe(0);
  });

  /*
   * The running session is returned inside the week's list *and* separately.
   * Counting it twice was the obvious way to get this wrong, so it is pinned
   * down here: its row carries a duration of 0 and the live time is added once.
   */
  it("counts a running session exactly once", () => {
    const running = open("2026-09-07", "2026-09-07T09:00:00.000Z");
    const sessions = [closed("2026-09-07", 3600), running];

    expect(totalSeconds(sessions, running, 1800, WEEK_START, WEEK_END)).toBe(5400);
  });

  it("leaves a past week alone while the clock is running", () => {
    // Viewing last week: the live session belongs to this week and must not
    // inflate a total that is already history.
    const running = open("2026-09-07", "2026-09-07T09:00:00.000Z");
    const lastWeek = [closed("2026-08-31", 14_400)];

    expect(totalSeconds(lastWeek, running, 9999, "2026-08-30", "2026-09-05")).toBe(14_400);
  });

  it("counts a session that began before midnight toward the day it started on", () => {
    const running = open("2026-09-05", "2026-09-05T23:50:00.000Z");
    // Saturday belongs to the previous week, so this week is unaffected...
    expect(totalSeconds([], running, 1200, WEEK_START, WEEK_END)).toBe(0);
    // ...and the week it does belong to picks it up.
    expect(totalSeconds([running], running, 1200, "2026-08-30", "2026-09-05")).toBe(1200);
  });

  it("totals a single day when given the same key twice", () => {
    // This is how the stopwatch reads the day: a one-day-wide span.
    const sessions = [closed("2026-09-07", 3600), closed("2026-09-08", 7200)];
    expect(totalSeconds(sessions, null, 0, "2026-09-07", "2026-09-07")).toBe(10_800);
  });

  it("adds nothing live when the span is unknown", () => {
    const running = open("2026-09-07", "2026-09-07T09:00:00.000Z");
    expect(totalSeconds([running], running, 600, null, null)).toBe(0);
  });
});

describe("buildDays", () => {
  it("always returns seven days, in order, including the empty ones", () => {
    const days = buildDays(WEEK_START, [closed("2026-09-09", 3600)], null, 0, shiftDateKey);

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.key)).toEqual([
      "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12",
    ]);
    expect(days.filter((day) => day.seconds === 0)).toHaveLength(6);
  });

  it("files each block under its own day and totals it", () => {
    const sessions = [closed("2026-09-07", 3600), closed("2026-09-07", 1800), closed("2026-09-10", 900)];
    const days = buildDays(WEEK_START, sessions, null, 0, shiftDateKey);

    expect(days[1].seconds).toBe(5400);
    expect(days[1].sessions).toHaveLength(2);
    expect(days[4].seconds).toBe(900);
  });

  it("gives the running block its live length and flags it", () => {
    const running = open("2026-09-07", "2026-09-07T09:00:00.000Z");
    const days = buildDays(WEEK_START, [closed("2026-09-07", 3600), running], running, 1800, shiftDateKey);

    const monday = days[1];
    expect(monday.seconds).toBe(5400);
    expect(monday.sessions.find((s) => s.running)?.seconds).toBe(1800);
    expect(monday.sessions.filter((s) => s.running)).toHaveLength(1);
  });

  it("ignores blocks belonging to another week", () => {
    const days = buildDays(WEEK_START, [closed("2026-08-31", 14_400)], null, 0, shiftDateKey);
    expect(days.every((day) => day.seconds === 0)).toBe(true);
  });

  it("agrees with totalSeconds — the log and the bar can never disagree", () => {
    const running = open("2026-09-08", "2026-09-08T09:00:00.000Z");
    const sessions = [closed("2026-09-06", 8100), closed("2026-09-07", 11_400), running];

    const days = buildDays(WEEK_START, sessions, running, 2400, shiftDateKey);
    const fromDays = days.reduce((total, day) => total + day.seconds, 0);

    expect(fromDays).toBe(totalSeconds(sessions, running, 2400, WEEK_START, WEEK_END));
  });
});
