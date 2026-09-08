import { describe, expect, it } from "vitest";

import {
  deriveTitle,
  formatDuration,
  formatStopwatch,
  localDateKey,
  shiftDateKey,
  startOfWeekKey,
  weekdayLabel,
} from "./format";

/*
 * The week boundary is the one piece of arithmetic the whole feature rests on.
 * If Sunday moves, every total is wrong and nothing else in the app notices.
 */
describe("startOfWeekKey", () => {
  it("returns the day itself when it is already Sunday", () => {
    expect(startOfWeekKey("2026-09-06")).toBe("2026-09-06");
  });

  it("walks back to Sunday from every other day of the week", () => {
    const week = ["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"];
    for (const day of week) expect(startOfWeekKey(day)).toBe("2026-09-06");
  });

  it("crosses a month boundary", () => {
    // Tue 1 Sep 2026 belongs to the week that began Sun 30 Aug.
    expect(startOfWeekKey("2026-09-01")).toBe("2026-08-30");
  });

  it("crosses a year boundary", () => {
    // Fri 1 Jan 2027 belongs to the week that began Sun 27 Dec 2026.
    expect(startOfWeekKey("2027-01-01")).toBe("2026-12-27");
  });

  it("handles a leap day", () => {
    expect(startOfWeekKey("2028-02-29")).toBe("2028-02-27");
  });
});

describe("shiftDateKey", () => {
  it("walks forwards and backwards", () => {
    expect(shiftDateKey("2026-09-06", 6)).toBe("2026-09-12");
    expect(shiftDateKey("2026-09-06", -7)).toBe("2026-08-30");
  });

  it("crosses months and years", () => {
    expect(shiftDateKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("survives a spring-forward day", () => {
    // 8 March 2026 loses an hour in US timezones; the *day* still advances by one.
    expect(shiftDateKey("2026-03-07", 1)).toBe("2026-03-08");
    expect(shiftDateKey("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("survives a fall-back day", () => {
    expect(shiftDateKey("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("composes into a whole week of distinct days", () => {
    const days = Array.from({ length: 7 }, (_, i) => shiftDateKey("2026-09-06", i));
    expect(new Set(days).size).toBe(7);
    expect(days.at(-1)).toBe("2026-09-12");
  });
});

describe("localDateKey", () => {
  it("uses local wall-clock, not UTC — an evening entry stays on its own day", () => {
    // 23:30 local on 7 Sep. In UTC this is already the 8th anywhere east of GMT
    // and in the Americas it is still the 7th; either way the key is the local day.
    const evening = new Date(2026, 8, 7, 23, 30);
    expect(localDateKey(evening)).toBe("2026-09-07");
  });

  it("pads months and days", () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("weekdayLabel", () => {
  it("names each day of a known week", () => {
    expect(weekdayLabel("2026-09-06")).toBe("Sun");
    expect(weekdayLabel("2026-09-09")).toBe("Wed");
    expect(weekdayLabel("2026-09-12")).toBe("Sat");
  });
});

describe("formatDuration", () => {
  it("reads the way you would say it", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(59)).toBe("0m");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3660)).toBe("1h 1m");
    expect(formatDuration(45_600)).toBe("12h 40m");
  });

  it("rounds down rather than up — never claim time that wasn't worked", () => {
    expect(formatDuration(119)).toBe("1m");
    expect(formatDuration(7199)).toBe("1h 59m");
  });

  it("never shows a negative", () => {
    expect(formatDuration(-500)).toBe("0m");
  });
});

describe("formatStopwatch", () => {
  it("always shows two-digit hours, minutes and seconds", () => {
    expect(formatStopwatch(0)).toBe("00:00:00");
    expect(formatStopwatch(1)).toBe("00:00:01");
    expect(formatStopwatch(61)).toBe("00:01:01");
    expect(formatStopwatch(3661)).toBe("01:01:01");
  });

  it("keeps counting past a day rather than wrapping", () => {
    expect(formatStopwatch(90_000)).toBe("25:00:00");
  });

  it("never shows a negative", () => {
    expect(formatStopwatch(-5)).toBe("00:00:00");
  });
});

describe("deriveTitle", () => {
  it("takes the first non-empty line", () => {
    expect(deriveTitle("\n\n  Hello there \nsecond line")).toBe("Hello there");
  });

  it("falls back for an empty note", () => {
    expect(deriveTitle("   \n\n")).toBe("Untitled");
  });

  it("truncates a very long first line", () => {
    expect(deriveTitle("x".repeat(200))).toHaveLength(65); // 64 chars + ellipsis
  });
});
