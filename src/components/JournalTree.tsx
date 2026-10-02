"use client";

import { useEffect, useMemo, useState } from "react";

import { journalLabel, localDateKey, weekdayLabel } from "@/lib/format";
import { groupJournal } from "@/lib/journal";

import { type NoteSummary } from "./AppShell";
import { Chevron, FolderIcon, NoteRow, SectionHeader, type NoteRowProps } from "./SidebarRows";

const OPEN_KEY = "np:open-journal";

type RowProps = Omit<NoteRowProps, "note" | "active" | "renaming" | "draggable" | "meta" | "bare"> & {
  pathname: string;
  renaming: string | null;
};

/**
 * The journal, filed by itself: year → month → one entry per day.
 *
 * Nothing here is stored as a folder. The years and months come straight from
 * each entry's date (`groupJournal`), so there is nothing to create, rename,
 * move or delete — and nothing that could disagree with the date. The current
 * year and month open by default; anything else you open is remembered.
 */
export function JournalTree({
  entries,
  rowProps,
  collapsed,
  onToggle,
  onToday,
}: {
  entries: NoteSummary[];
  rowProps: RowProps;
  collapsed: boolean;
  onToggle: () => void;
  onToday: () => void;
}) {
  const years = useMemo(() => groupJournal(entries), [entries]);

  /*
   * Open years and months by key ("2026", "2026-10"). Null until mount: which
   * month is "now" depends on the browser's clock and timezone, not the
   * server's, so the defaults can only be worked out here.
   */
  const [open, setOpen] = useState<Set<string> | null>(null);

  useEffect(() => {
    const today = localDateKey();
    const current = [today.slice(0, 4), today.slice(0, 7)];
    let stored: string[] = [];
    try {
      stored = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? "[]") as string[];
    } catch {
      // Unreadable — fall back to the defaults.
    }
    setOpen(new Set([...current, ...stored]));
  }, []);

  // Opening an entry from search opens the year and month it's in.
  const activeId = /^\/n\/([^/]+)$/.exec(rowProps.pathname)?.[1];
  const activeDate = entries.find((entry) => entry.id === activeId)?.journalDate ?? null;
  useEffect(() => {
    if (!activeDate) return;
    setOpen((current) => new Set([...(current ?? []), activeDate.slice(0, 4), activeDate.slice(0, 7)]));
  }, [activeDate]);

  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        // Not remembered across reloads; the section still works.
      }
      return next;
    });
  }

  const isOpen = (key: string) => open?.has(key) ?? false;

  return (
    <section className="mb-3">
      <SectionHeader
        label="Journal"
        collapsed={collapsed}
        onToggle={onToggle}
        actions={[{ label: "Today's entry", onSelect: onToday }]}
      />

      {!collapsed &&
        (years.length === 0 ? (
          <p className="px-2.5 py-1.5 text-[12.5px] text-ink-faint">No entries yet.</p>
        ) : (
          <ul className="space-y-px">
            {years.map(({ year, months, count }) => (
              <li key={year}>
                <GroupRow
                  label={String(year)}
                  count={count}
                  open={isOpen(String(year))}
                  onToggle={() => toggle(String(year))}
                />
                {isOpen(String(year)) && (
                  <ul className="mt-px ml-[13px] space-y-px border-l border-line pl-1.5">
                    {months.map((month) => (
                      <li key={month.key}>
                        <GroupRow
                          label={month.name}
                          count={month.entries.length}
                          open={isOpen(month.key)}
                          onToggle={() => toggle(month.key)}
                        />
                        {isOpen(month.key) && (
                          <ul className="mt-px ml-[13px] space-y-px border-l border-line pl-1.5">
                            {month.entries.map((entry) => (
                              <li key={entry.id}>
                                <NoteRow
                                  note={entry}
                                  active={rowProps.pathname === `/n/${entry.id}`}
                                  openNote={rowProps.openNote}
                                  renaming={rowProps.renaming === entry.id}
                                  setRenaming={rowProps.setRenaming}
                                  openMenu={rowProps.openMenu}
                                  onRename={rowProps.onRename}
                                  // A renamed entry keeps its date visible beside the name.
                                  meta={
                                    entry.title
                                      ? journalLabel(entry.journalDate!)
                                      : weekdayLabel(entry.journalDate!)
                                  }
                                  bare
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

/** A year or month: opens and closes, and that's all — it isn't a real folder. */
function GroupRow({
  label,
  count,
  open,
  onToggle,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-1.5 rounded-lg py-[7px] pr-2.5 pl-1 text-left text-[13.5px] text-ink/85 transition-colors hover:bg-hover"
    >
      <span className="flex w-3.5 justify-center text-ink-faint">
        <Chevron collapsed={!open} className="h-2.5 w-2.5" />
      </span>
      <span className="text-ink-faint">
        <FolderIcon open={open} />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className="text-[11.5px] tabular-nums text-ink-faint">{count}</span>
    </button>
  );
}
