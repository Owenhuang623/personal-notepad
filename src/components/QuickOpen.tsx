"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { deriveTitle, journalLabel, plainLine } from "@/lib/format";
import { extractTags } from "@/lib/tags";

import { useNotes, type NoteSummary } from "./AppShell";

type Item =
  | { kind: "note"; note: NoteSummary; title: string; snippet: Snippet | null }
  | { kind: "action"; id: string; label: string; hint?: string; run: () => void };

type Snippet = { before: string; match: string; after: string };

const RECENT = 8;
const LIMIT = 30;

/**
 * ⌘K: jump to any note by typing a few letters of it.
 *
 * Runs entirely over the notes already in memory, so results update on every
 * keystroke with no request behind them. Words match anywhere in the title or
 * body, in any order; a query starting with # lists the notes carrying that tag.
 */
export function QuickOpen({ initialQuery, onClose }: { initialQuery: string; onClose: () => void }) {
  const { notes, openNote, createNote, openToday } = useNotes();
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const live = useMemo(() => notes.filter((note) => note.deletedAt === null), [notes]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();

    const actions: Item[] = [
      { kind: "action", id: "new", label: "New note", run: () => void createNote() },
      { kind: "action", id: "today", label: "Today's journal entry", run: () => void openToday() },
      { kind: "action", id: "dash", label: "Dashboard", run: () => router.push("/") },
    ];

    if (!q) {
      const recent = [...live]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, RECENT)
        .map((note) => noteItem(note, null));
      return [...recent, ...actions];
    }

    if (q.startsWith("#")) {
      const wanted = q.slice(1);
      return live
        .filter((note) => extractTags(note.content).some((tag) => tag.startsWith(wanted)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, LIMIT)
        .map((note) => noteItem(note, q));
    }

    const words = q.split(/\s+/);
    const scored: { note: NoteSummary; score: number }[] = [];

    for (const note of live) {
      const title = displayTitle(note).toLowerCase();
      const body = note.content.toLowerCase();
      if (!words.every((word) => title.includes(word) || body.includes(word))) continue;

      // Title hits first, a title that starts with the query above all.
      const score =
        (title.startsWith(q) ? 4 : 0) +
        words.filter((word) => title.includes(word)).length * 2 +
        (body.includes(q) ? 1 : 0);
      scored.push({ note, score });
    }

    scored.sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt));

    const matches = scored.slice(0, LIMIT).map(({ note }) => noteItem(note, words[0]));
    const matchingActions = actions.filter(
      (action) => action.kind === "action" && action.label.toLowerCase().includes(q),
    );
    return [...matches, ...matchingActions];
  }, [query, live, createNote, openToday, router]);

  // Keep the highlighted row inside the list as the results change under it.
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function choose(item: Item | undefined) {
    if (!item) return;
    onClose();
    if (item.kind === "note") openNote(item.note.id);
    else item.run();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[12vh] backdrop-blur-[2px] dark:bg-black/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Search notes"
        className="np-pop w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-canvas"
        style={{ boxShadow: "var(--shadow)" }}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <SearchIcon />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((i) => Math.min(i + 1, items.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(items[index]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Search notes, or type # for a tag"
            aria-label="Search notes"
            className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10.5px] text-ink-faint">esc</kbd>
        </div>

        <ul ref={list} className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5" role="listbox">
          {!query.trim() && (
            <li className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-[0.06em] text-ink-faint uppercase">
              Recent
            </li>
          )}

          {items.length === 0 && (
            <li className="px-3 py-6 text-center text-[13px] text-ink-faint">Nothing matches.</li>
          )}

          {items.map((item, i) => {
            const selected = i === index;
            const key = item.kind === "note" ? item.note.id : item.id;
            const firstAction = item.kind === "action" && items[i - 1]?.kind !== "action";

            return (
              <li key={key} role="option" aria-selected={selected}>
                {firstAction && i > 0 && <div className="mx-2 my-1.5 h-px bg-line" />}
                <button
                  type="button"
                  data-index={i}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => choose(item)}
                  className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left ${
                    selected ? "bg-active" : ""
                  }`}
                >
                  {item.kind === "note" ? (
                    <>
                      <span className="mt-[3px] text-ink-faint">
                        {item.note.kind === "daily" ? <CalendarIcon /> : <NoteIcon />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-ink">{item.title}</span>
                        {item.snippet && (
                          <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted">
                            {item.snippet.before}
                            <mark className="rounded-[3px] bg-accent-soft px-px text-accent">
                              {item.snippet.match}
                            </mark>
                            {item.snippet.after}
                          </span>
                        )}
                      </span>
                      {selected && <span className="mt-[3px] text-[11px] text-ink-faint">↵</span>}
                    </>
                  ) : (
                    <>
                      <span className="mt-[3px] text-ink-faint">
                        <ArrowIcon />
                      </span>
                      <span className="flex-1 text-[14px] text-ink-muted">{item.label}</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11.5px] text-ink-faint">
          <span>
            <Key>↑</Key>
            <Key>↓</Key> to move
          </span>
          <span>
            <Key>↵</Key> to open
          </span>
          <span className="ml-auto">
            <Key>⌘</Key>
            <Key>K</Key> anywhere
          </span>
        </div>
      </div>
    </div>
  );
}

function displayTitle(note: NoteSummary): string {
  return note.title ?? (note.journalDate ? journalLabel(note.journalDate) : deriveTitle(note.content));
}

function noteItem(note: NoteSummary, term: string | null): Item {
  return { kind: "note", note, title: displayTitle(note), snippet: snippetFor(note.content, term) };
}

/**
 * A line of the note around the first hit, so you can tell which of three
 * similar notes you want. With no query, the note's first line of body text.
 */
function snippetFor(content: string, term: string | null): Snippet | null {
  const lines = content.split("\n");

  if (term) {
    for (const raw of lines) {
      const line = plainLine(raw);
      const at = line.toLowerCase().indexOf(term);
      if (at === -1) continue;

      const start = Math.max(0, at - 32);
      return {
        before: (start > 0 ? "…" : "") + line.slice(start, at),
        match: line.slice(at, at + term.length),
        after: line.slice(at + term.length, at + term.length + 120),
      };
    }
    return null;
  }

  // Skip the line that became the title.
  const body = lines.map(plainLine).filter(Boolean).slice(1);
  return body.length ? { before: body.join("  ·  ").slice(0, 160), match: "", after: "" } : null;
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mr-0.5 inline-block min-w-[18px] rounded border border-line px-1 text-center font-sans text-[10.5px]">
      {children}
    </kbd>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink-faint" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path d="M4 2.5h5.5L12 5v8.5H4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 8h4M6 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
