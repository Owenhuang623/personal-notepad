"use client";

import { useRef } from "react";

import { deriveTitle, journalLabel } from "@/lib/format";

import { type NoteSummary } from "./AppShell";
import { ClientDate } from "./ClientDate";
import { PinIcon } from "./PinIcon";

/** What a drag carries. Saved in a module variable as well as on the event, because
 *  `dragover` handlers can't read the event's data — only its types. */
export type DragItem = { type: "note" | "folder"; id: string };

export const DRAG_TYPE = "application/x-notepad-item";

let dragging: DragItem | null = null;

export function currentDrag(): DragItem | null {
  return dragging;
}

export function startDrag(event: React.DragEvent, item: DragItem) {
  dragging = item;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
  // Some browsers won't start a drag without a plain-text payload.
  event.dataTransfer.setData("text/plain", item.id);
}

export function endDrag() {
  dragging = null;
}

export function noteTitle(note: NoteSummary): string {
  return (
    note.title ??
    (note.kind === "daily" && note.journalDate ? journalLabel(note.journalDate) : deriveTitle(note.content))
  );
}

export type NoteRowProps = {
  note: NoteSummary;
  active: boolean;
  openNote: (id: string) => void;
  showDate?: boolean;
  renaming: boolean;
  setRenaming: (id: string | null) => void;
  openMenu: (note: NoteSummary, x: number, y: number) => void;
  onRename: (id: string, title: string) => void;
  /** Saved notes in the folder tree can be dragged; journal days, Pinned and Trash can't. */
  draggable?: boolean;
  /** Faint text at the right edge, in place of the date — a journal day's weekday. */
  meta?: string;
  /** Hides the document icon, for rows whose place in a list already says what they are. */
  bare?: boolean;
};

export function NoteRow({
  note,
  active,
  openNote,
  showDate = false,
  renaming,
  setRenaming,
  openMenu,
  onRename,
  draggable = false,
  meta,
  bare = false,
}: NoteRowProps) {
  const href = `/n/${note.id}`;
  const displayTitle = noteTitle(note);

  if (renaming) {
    return (
      <div className="rounded-lg bg-active px-2.5 py-[7px] ring-1 ring-line-strong">
        <RenameInput
          initial={displayTitle}
          label="Note name"
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
      <a
        href={href}
        draggable={draggable}
        onDragStart={draggable ? (event) => startDrag(event, { type: "note", id: note.id }) : undefined}
        onDragEnd={endDrag}
        onClick={(event) => {
          // Let ⌘-click and middle-click open a new tab as usual.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          openNote(note.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu(note, event.clientX, event.clientY);
        }}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2 rounded-lg py-[7px] pr-8 pl-2.5 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent/40 ${
          active ? "bg-active text-ink" : "text-ink/85 hover:bg-hover"
        } ${note.deletedAt ? "opacity-55" : ""}`}
      >
        {note.pinnedAt ? (
          <PinIcon className="h-3 w-3 shrink-0 text-accent" />
        ) : (
          !bare && note.kind === "saved" && <DocIcon />
        )}
        <span className="min-w-0 flex-1 truncate text-[13.5px]">{displayTitle}</span>
        {meta && (
          <span className="shrink-0 text-[11.5px] text-ink-faint transition-opacity md:group-hover:opacity-0">
            {meta}
          </span>
        )}
        {/* A journal entry's title already is its date. */}
        {showDate && !meta && note.kind !== "daily" && (
          <span className="shrink-0 text-[11.5px] text-ink-faint tabular-nums transition-opacity md:group-hover:opacity-0">
            <ClientDate iso={note.updatedAt} variant="short" />
          </span>
        )}
      </a>

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
export function RenameInput({
  initial,
  label,
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string;
  label: string;
  placeholder?: string;
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
      aria-label={label}
      placeholder={placeholder}
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
      className="w-full min-w-0 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
    />
  );
}

export type SectionAction = { label: string; onSelect: () => void; icon?: React.ReactNode };

export function SectionHeader({
  label,
  collapsed,
  onToggle,
  actions = [],
  dropProps,
  dropActive = false,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  actions?: SectionAction[];
  /** Lets a section header take drops — dropping on "Notes" files at the top level. */
  dropProps?: React.HTMLAttributes<HTMLDivElement>;
  dropActive?: boolean;
}) {
  return (
    <div
      {...dropProps}
      className={`group/header flex items-center gap-0.5 rounded-md transition-colors ${
        dropActive ? "bg-accent-soft" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium tracking-[0.07em] text-ink-faint uppercase transition-colors hover:text-ink"
      >
        {label}
        <Chevron collapsed={collapsed} />
      </button>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onSelect}
          aria-label={action.label}
          title={action.label}
          className="rounded-md p-1 text-ink-faint transition-all hover:bg-hover hover:text-ink focus-visible:opacity-100 md:opacity-0 md:group-hover/header:opacity-100"
        >
          {action.icon ?? <PlusIcon />}
        </button>
      ))}
    </div>
  );
}

export function DotsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="8" r="1.35" />
      <circle cx="8" cy="8" r="1.35" />
      <circle cx="12" cy="8" r="1.35" />
    </svg>
  );
}

export function Chevron({ collapsed, className = "h-3 w-3" }: { collapsed: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`${className} shrink-0 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 6.5 8 10.5l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function FolderIcon({ open = false }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-[15px] w-[15px] shrink-0" fill="none" aria-hidden="true">
      {open ? (
        <path
          d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v.5H4.6a1.5 1.5 0 0 0-1.4 1L2 11.8zM2 12.5l1.6-4.4a1 1 0 0 1 .9-.6h10l-1.7 4.6a1 1 0 0 1-.9.6H2.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function NewFolderIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M14 8V6a1.5 1.5 0 0 0-1.5-1.5h-5L6.1 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13H8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M12 10v4M10 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-[13px] w-[13px] shrink-0 text-ink-faint" fill="none" aria-hidden="true">
      <path d="M4 2.5h5.5L12 5v8.5H4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
