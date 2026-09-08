"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { deriveTitle, journalLabel, localDateKey } from "@/lib/format";

import { useNotes, useSidebar, type NoteSummary } from "./AppShell";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { Logo } from "./Logo";
import { PinIcon } from "./PinIcon";

const COLLAPSE_KEY = "np:collapsed";
type SectionId = "pinned" | "journal" | "notes" | "trash";

type MenuState = { note: NoteSummary; x: number; y: number };

export function Sidebar() {
  const { notes, refresh, addNote } = useNotes();
  const { open } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>({
    pinned: false,
    journal: false,
    notes: false,
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

  const live = notes.filter((note) => note.deletedAt === null);
  const pinned = live.filter((note) => note.pinnedAt !== null);
  const journal = live.filter((note) => note.pinnedAt === null && note.kind === "daily");
  const plain = live.filter((note) => note.pinnedAt === null && note.kind === "saved");
  const trashed = notes.filter((note) => note.deletedAt !== null);

  /*
   * Create, show, navigate — in that order, with nothing awaited in between
   * that the user has to wait on. Re-listing the notes before navigating added
   * a second round trip to every new note; the row the POST returns is the same
   * row that list would have contained.
   */
  async function createNote() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "" }),
      });
      if (!response.ok) return;

      const { id, note } = (await response.json()) as { id: string; note: NoteSummary };
      addNote(note);
      router.push(`/n/${id}`);
    } finally {
      setBusy(false);
    }
  }

  /** Opens today's entry, creating it only if today doesn't have one yet. */
  async function openToday() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: localDateKey() }),
      });
      if (!response.ok) return;

      const { id, note } = (await response.json()) as { id: string; note?: NoteSummary };
      // Only a freshly created entry needs adding; an existing one is already listed.
      if (note) addNote(note);
      router.push(`/n/${id}`);
    } finally {
      setBusy(false);
    }
  }

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

  function menuItems(note: NoteSummary): MenuItem[] {
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
      { label: "Delete", danger: true, onSelect: () => void deleteNote(note) },
    ];
  }

  const sectionProps = {
    pathname,
    router,
    renaming,
    setRenaming,
    openMenu: (note: NoteSummary, x: number, y: number) => setMenu({ note, x, y }),
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
          onClick={createNote}
          disabled={busy}
          aria-label="New note"
          title="New note"
          className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
        >
          <PlusIcon />
        </button>
      </div>

      {/* The one fixture: the dashboard, always here. */}
      <div className="space-y-px px-3 pt-1">
        <FixedLink href="/" label="Dashboard" active={pathname === "/"}>
          <DashboardIcon />
        </FixedLink>
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

        <Section
          id="journal"
          label="Journal"
          notes={journal}
          collapsed={collapsed.journal}
          onToggle={toggleSection}
          action={{ label: "Today's entry", onSelect: openToday }}
          empty="No entries yet."
          {...sectionProps}
        />

        <Section
          id="notes"
          label="Notes"
          notes={plain}
          collapsed={collapsed.notes}
          onToggle={toggleSection}
          empty="Nothing saved yet."
          {...sectionProps}
        />

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
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.note)}
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
  action?: { label: string; onSelect: () => void };
  empty?: string;
  pathname: string;
  router: ReturnType<typeof useRouter>;
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
  action,
  empty,
  pathname,
  router,
  renaming,
  setRenaming,
  openMenu,
  onRename,
}: SectionProps) {
  return (
    <section className="mb-3">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium tracking-[0.07em] text-ink-faint uppercase transition-colors hover:text-ink"
        >
          <Chevron collapsed={collapsed} />
          {label}
        </button>
        {action && (
          <button
            type="button"
            onClick={action.onSelect}
            aria-label={action.label}
            title={action.label}
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-hover hover:text-ink"
          >
            <PlusIcon />
          </button>
        )}
      </div>

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
                    router={router}
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

function NoteRow({
  note,
  active,
  router,
  renaming,
  setRenaming,
  openMenu,
  onRename,
}: {
  note: NoteSummary;
  active: boolean;
  router: ReturnType<typeof useRouter>;
  renaming: boolean;
  setRenaming: (id: string | null) => void;
  openMenu: (note: NoteSummary, x: number, y: number) => void;
  onRename: (id: string, title: string) => void;
}) {
  const href = `/n/${note.id}`;
  const isJournal = note.kind === "daily";

  const displayTitle =
    note.title ??
    (isJournal && note.journalDate ? journalLabel(note.journalDate) : deriveTitle(note.preview));

  if (renaming) {
    return (
      <div className="rounded-lg bg-active px-2.5 py-2 ring-1 ring-line-strong">
        <RenameInput
          initial={displayTitle}
          onCommit={(value) => {
            onRename(note.id, value);
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      <Link
        href={href}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu(note, event.clientX, event.clientY);
        }}
        /*
         * Dynamic routes aren't prefetched by <Link> automatically, so warm the
         * payload on intent — by the time the click lands the note is usually
         * already in the router cache.
         */
        onMouseEnter={() => router.prefetch(href)}
        onTouchStart={() => router.prefetch(href)}
        className={`block rounded-lg py-2 pr-8 pl-2.5 transition-colors ${
          active ? "bg-active" : "hover:bg-hover"
        } ${note.deletedAt ? "opacity-55" : ""}`}
      >
        <span className="flex items-center gap-1.5">
          {note.pinnedAt && <PinIcon className="h-3 w-3 shrink-0 text-ink-faint" />}
          <span className="truncate text-[13.5px]">{displayTitle}</span>
        </span>
      </Link>

      {/*
       * Touch devices have no right-click, so the menu needs a visible handle.
       * It stays out of the way on pointer devices until the row is hovered.
       */}
      <button
        type="button"
        aria-label={`Actions for ${displayTitle}`}
        onClick={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          openMenu(note, rect.left, rect.bottom + 4);
        }}
        className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1 text-ink-faint transition-opacity hover:bg-hover hover:text-ink focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
      >
        <DotsIcon />
      </button>
    </div>
  );
}

/**
 * Commits on Enter or blur, cancels on Escape.
 *
 * The settled flag matters: without it the blur that follows Enter or Escape
 * fires a second time, which made Escape save the edit it was meant to discard.
 */
function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const settled = useRef(false);

  function finish(value: string | null) {
    if (settled.current) return;
    settled.current = true;
    if (value === null) onCancel();
    else onCommit(value);
  }

  return (
    <input
      autoFocus
      defaultValue={initial}
      aria-label="Note name"
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(event.currentTarget.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
      className="w-full bg-transparent text-[13.5px] text-ink outline-none"
    />
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="8" r="1.35" />
      <circle cx="8" cy="8" r="1.35" />
      <circle cx="12" cy="8" r="1.35" />
    </svg>
  );
}

function Chevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3 w-3 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 6.5 8 10.5l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
