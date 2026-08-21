"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { deriveSnippet, deriveTitle } from "@/lib/format";

import { useNotes, useSidebar, type NoteSummary } from "./AppShell";
import { ClientDate } from "./ClientDate";
import { Logo } from "./Logo";
import { PinIcon } from "./PinIcon";

export function Sidebar() {
  const { notes, refresh } = useNotes();
  const { open } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  // The query already returns pinned notes first, so these keep their order.
  const pinned = notes.filter((note) => note.pinnedAt !== null);
  const unpinned = notes.filter((note) => note.pinnedAt === null);

  async function createNote() {
    if (creating) return;
    setCreating(true);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "" }),
      });
      if (!response.ok) return;
      const { id } = (await response.json()) as { id: string };
      await refresh();
      router.push(`/n/${id}`);
    } finally {
      setCreating(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

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
          disabled={creating}
          aria-label="New note"
          title="New note"
          className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
        >
          <PlusIcon />
        </button>
      </div>

      <div className="px-3 pt-1">
        <Link
          href="/"
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${
            pathname === "/" ? "bg-active text-ink" : "text-ink-muted hover:bg-hover hover:text-ink"
          }`}
        >
          <PinIcon className="h-3.5 w-3.5" />
          Scratchpad
        </Link>
      </div>

      <nav className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {notes.length === 0 ? (
          <p className="px-2.5 py-2 text-[13px] leading-5 text-ink-faint">
            Nothing saved yet. Save a copy of the scratchpad, or start a new note.
          </p>
        ) : (
          <>
            {pinned.length > 0 && <NoteSection label="Pinned" notes={pinned} />}
            {unpinned.length > 0 && (
              <NoteSection label="Notes" notes={unpinned} spaced={pinned.length > 0} />
            )}
          </>
        )}
      </nav>

      <div className="border-t border-line px-3 py-2">
        <button
          type="button"
          onClick={signOut}
          className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-ink-faint transition-colors hover:bg-hover hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function NoteSection({
  label,
  notes,
  spaced = false,
}: {
  label: string;
  notes: NoteSummary[];
  spaced?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <section className={spaced ? "mt-4" : undefined}>
      <h2 className="px-2.5 pb-1.5 text-[11px] font-medium tracking-[0.07em] text-ink-faint uppercase">
        {label}
      </h2>
      <ul className="space-y-px">
        {notes.map((note) => {
          const href = `/n/${note.id}`;
          const snippet = deriveSnippet(note.preview);

          return (
            <li key={note.id}>
              <Link
                href={href}
                /*
                 * Dynamic routes aren't prefetched by <Link> automatically, so
                 * warm the payload on intent — by the time the click lands the
                 * note is usually already in the router cache.
                 */
                onMouseEnter={() => router.prefetch(href)}
                onTouchStart={() => router.prefetch(href)}
                className={`block rounded-lg px-2.5 py-2 transition-colors ${
                  pathname === href ? "bg-active" : "hover:bg-hover"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {note.pinnedAt && <PinIcon className="h-3 w-3 shrink-0 text-ink-faint" />}
                  <span className="truncate text-[13.5px]">{deriveTitle(note.preview)}</span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
                  <ClientDate iso={note.createdAt} variant="short" />
                  {snippet && ` · ${snippet}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
