import { describe, expect, it } from "vitest";

import { groupJournal } from "./journal";

const entry = (journalDate: string | null) => ({ id: journalDate ?? "none", journalDate });

describe("groupJournal", () => {
  it("files entries under year and month, newest first", () => {
    const grouped = groupJournal([
      entry("2026-09-14"),
      entry("2025-12-31"),
      entry("2026-10-01"),
      entry("2026-09-29"),
    ]);

    expect(grouped.map((y) => [y.year, y.count])).toEqual([
      [2026, 3],
      [2025, 1],
    ]);
    expect(grouped[0].months.map((m) => [m.name, m.entries.map((e) => e.journalDate)])).toEqual([
      ["October", ["2026-10-01"]],
      ["September", ["2026-09-29", "2026-09-14"]],
    ]);
    expect(grouped[1].months[0]).toMatchObject({ key: "2025-12", name: "December" });
  });

  it("puts the same month of different years in different folders", () => {
    const grouped = groupJournal([entry("2026-01-05"), entry("2025-01-05")]);
    expect(grouped.map((y) => y.months.map((m) => m.key))).toEqual([["2026-01"], ["2025-01"]]);
  });

  it("skips anything without a usable date rather than misfiling it", () => {
    expect(groupJournal([entry(null), entry("garbage")])).toEqual([]);
  });

  it("doesn't reorder the caller's array", () => {
    const input = [entry("2026-01-01"), entry("2026-02-01")];
    groupJournal(input);
    expect(input.map((e) => e.journalDate)).toEqual(["2026-01-01", "2026-02-01"]);
  });
});
