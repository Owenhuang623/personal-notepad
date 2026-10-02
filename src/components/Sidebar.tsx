"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { localDateKey } from "@/lib/format";
import { extractTags } from "@/lib/tags";

import { useNotes, useSidebar, type NoteSummary } from "./AppShell";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { JournalTree } from "./JournalTree";
import { Logo } from "./Logo";
import { NoteTree, useMoveNoteTargets } from "./NoteTree";
import { NoteRow, SectionHeader, type SectionAction } from "./SidebarRows";

const COLLAPSE_KEY = "np:collapsed";
type SectionId = "pinned" | "journal" | "notes" | "tags" | "trash";

type MenuState = { items: MenuItem[]; x: number; y: number };

export function Sidebar() {
  const { notes, refresh, openNote, createNote, openToday } = useNotes();
  const { open, openSearch } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();

  const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>({
    pinned: false,
    journal: false,
    notes: false,
    tags: false,
    // Trash stays out of the way until you go looking for it.
    trash: true,
  });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Collapse state is per-device preference, so it lives in localStorage rather
  // than the database.
  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    if (stored) setCollapsed((current) => ({ ...current, ...JSON.parse(stored) }));
  }, []);

  const toggleSection = useCallback((id: SectionId) => {
    setCollapsed((current) => {
      const next = { ...current, [id]: !current[id] };
      window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  const live = useMemo(() => notes.filter((note) => note.deletedAt === null), [notes]);
  const pinned = live.filter((note) => note.pinnedAt !== null);
  // Pinned notes stay in their folder or month too; Pinned is a shortcut, not a place.
  const journal = live.filter((note) => note.kind === "daily");
  const saved = live.filter((note) => note.kind === "saved");
  const moveTargets = useMoveNoteTargets();
  const trashed = notes.filter((note) => note.deletedAt !== null);

  // Tags are read out of the text itself, so they need no bookkeeping anywhere.
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of live) {
      for (const tag of extractTags(note.content)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }, [live]);

  async function patchNote(id: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Something went wrong");
      return false;
    }

    await refresh();
    return true;
  }

  /** Moves a note to the trash. Nothing is destroyed until it's purged from there. */
  async function deleteNote(note: NoteSummary) {
    const response = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    if (!response.ok) return;

    await refresh();
    if (pathname === `/n/${note.id}`) router.push("/");
  }

  async function purgeNote(note: NoteSummary) {
    const response = await fetch(`/api/notes/${note.id}?permanent=1`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Could not delete");
      return;
    }

    window.localStorage.removeItem(`np:draft:${note.id}`);
    await refresh();
    if (pathname === `/n/${note.id}`) router.push("/");
  }

  function menuItems(note: NoteSummary, x: number, y: number): MenuItem[] {
    const isPinned = note.pinnedAt !== null;
    const isJournal = note.kind === "daily";

    if (note.deletedAt !== null) {
      return [
        { label: "Restore", onSelect: () => void patchNote(note.id, { restore: true }) },
        {
          label: "Delete permanently",
          danger: true,
          confirm: true,
          onSelect: () => void purgeNote(note),
        },
      ];
    }

    return [
      { label: "Rename", onSelect: () => setRenaming(note.id) },
      {
        label: isPinned ? "Unpin" : "Pin",
        onSelect: () => void patchNote(note.id, { pinned: !isPinned }),
      },
      // Journal entries file themselves by date; only notes go in folders.
      ...(isJournal
        ? []
        : [
            {
              label: "Move to folder…",
              onSelect: () => setMenu({ items: moveTargets(note, setError), x, y }),
            },
          ]),
      {
        label: isJournal ? "Move to Notes" : "Move to Journal",
        onSelect: () =>
          void patchNote(
            note.id,
            isJournal
              ? { move: "notes" }
              : // File it under the day it was written, which is almost always
                // what's meant by moving an existing note into the journal.
                { move: "journal", date: localDateKey(new Date(note.createdAt)) },
          ),
      },
      { label: "Delete", danger: true, separated: true, onSelect: () => void deleteNote(note) },
    ];
  }

  const sectionProps = {
    pathname,
    openNote,
    renaming,
    setRenaming,
    openMenu: (note: NoteSummary, x: number, y: number) => setMenu({ items: menuItems(note, x, y), x, y }),
    onRename: (id: string, title: string) => void patchNote(id, { title }),
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex w-[264px] shrink-0 flex-col border-r border-line bg-panel transition-transform duration-200 md:static md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-1 px-3 pt-3">
        <Link
          href="/"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-hover"
        >
          <Logo className="h-[22px] w-[22px]" />
          <span className="truncate text-[14px] font-medium tracking-tight">Notepad</span>
        </Link>
        <button
          type="button"
          onClick={() => void createNote()}
          aria-label="New note"
          title="New note"
          className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-hover hover:text-ink"
        >
          <ComposeIcon />
        </button>
      </div>

      <div className="px-3 pt-1.5">
        <button
          type="button"
          onClick={() => openSearch()}
          className="flex w-full items-center gap-2 rounded-lg border border-line bg-canvas/60 px-2.5 py-[7px] text-left text-[13px] text-ink-faint shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-colors hover:border-line-strong hover:text-ink-muted"
        >
          <SearchIcon />
          <span className="flex-1">Search</span>
          <kbd className="font-sans text-[11px] tracking-wide">⌘K</kbd>
        </button>
      </div>

      {/* The one fixture: the dashboard, always here. */}
      <div className="space-y-px px-3 pt-1">
        <FixedLink href="/" label="Dashboard" active={pathname === "/"}>
          <DashboardIcon />
        </FixedLink>
        <button
          type="button"
          onClick={() => void openToday()}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-ink-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <TodayIcon />
          Today&apos;s entry
        </button>
      </div>

      <nav className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {pinned.length > 0 && (
          <Section
            id="pinned"
            label="Pinned"
            notes={pinned}
            collapsed={collapsed.pinned}
            onToggle={toggleSection}
            {...sectionProps}
          />
        )}

        <JournalTree
          entries={journal}
          rowProps={sectionProps}
          collapsed={collapsed.journal}
          onToggle={() => toggleSection("journal")}
          onToday={() => void openToday()}
        />

        <NoteTree
          notes={saved}
          rowProps={{ ...sectionProps, showDate: true }}
          collapsed={collapsed.notes}
          onToggle={() => toggleSection("notes")}
          showMenu={(items, x, y) => setMenu({ items, x, y })}
          onError={setError}
        />

        {tags.length > 0 && (
          <section className="mb-3">
            <SectionHeader label="Tags" collapsed={collapsed.tags} onToggle={() => toggleSection("tags")} />
            {!collapsed.tags && (
              <ul className="space-y-px">
                {tags.map(([tag, count]) => (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => openSearch(`#${tag}`)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] text-ink-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      <span className="text-accent opacity-70">#</span>
                      <span className="min-w-0 flex-1 truncate">{tag}</span>
                      <span className="text-[11.5px] tabular-nums text-ink-faint">{count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {trashed.length > 0 && (
          <Section
            id="trash"
            label={`Trash (${trashed.length})`}
            notes={trashed}
            collapsed={collapsed.trash}
            onToggle={toggleSection}
            {...sectionProps}
          />
        )}
      </nav>

      {error && (
        <p className="px-4 pb-1 text-[12px] text-danger" role="status">
          {error}
        </p>
      )}

      <div className="border-t border-line px-3 py-2">
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth", { method: "DELETE" });
            router.push("/login");
            router.refresh();
          }}
          className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-ink-faint transition-colors hover:bg-hover hover:text-ink"
        >
          Sign out
        </button>
      </div>

      {menu && (
        <ContextMenu
          // A fresh menu for fresh items, so "Move to…" re-measures where it fits.
          key={menu.items.map((item) => item.key ?? item.label).join("|")}
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  );
}

function FixedLink({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${
        active ? "bg-active text-ink" : "text-ink-muted hover:bg-hover hover:text-ink"
      }`}
    >
      {children}
      {label}
    </Link>
  );
}

type SectionProps = {
  id: SectionId;
  label: string;
  notes: NoteSummary[];
  collapsed: boolean;
  onToggle: (id: SectionId) => void;
  actions?: SectionAction[];
  empty?: string;
  showDates?: boolean;
  pathname: string;
  openNote: (id: string) => void;
  renaming: string | null;
  setRenaming: (id: string | null) => void;
  openMenu: (note: NoteSummary, x: number, y: number) => void;
  onRename: (id: string, title: string) => void;
};

function Section({
  id,
  label,
  notes,
  collapsed,
  onToggle,
  actions,
  empty,
  showDates = false,
  pathname,
  openNote,
  renaming,
  setRenaming,
  openMenu,
  onRename,
}: SectionProps) {
  return (
    <section className="mb-3">
      <SectionHeader label={label} collapsed={collapsed} onToggle={() => onToggle(id)} actions={actions} />

      {!collapsed && (
        <>
          {notes.length === 0 ? (
            empty && <p className="px-2.5 py-1.5 text-[12.5px] text-ink-faint">{empty}</p>
          ) : (
            <ul className="space-y-px">
              {notes.map((note) => (
                <li key={note.id}>
                  <NoteRow
                    note={note}
                    active={pathname === `/n/${note.id}`}
                    openNote={openNote}
                    showDate={showDates}
                    renaming={renaming === note.id}
                    setRenaming={setRenaming}
                    openMenu={openMenu}
                    onRename={onRename}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function TodayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="3.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2.5" y="8.5" width="11" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M7.5 3H4.5A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5v-3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="m7 9 .4-1.9L12 2.5 13.5 4 8.9 8.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
