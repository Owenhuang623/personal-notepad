"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { deriveSnippet, deriveTitle } from "@/lib/format";

import { useNotes, useSidebar } from "./AppShell";
import { ClientDate } from "./ClientDate";
import { Logo } from "./Logo";

export function Sidebar() {
  const { notes, refresh } = useNotes();
  const { open } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

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
      <div className="px-3 pt-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-hover"
        >
          <Logo className="h-[22px] w-[22px]" />
          <span className="text-[14px] font-medium tracking-tight">Notepad</span>
        </Link>
      </div>

      <div className="px-3 pt-2">
        <Link
          href="/"
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${
            pathname === "/" ? "bg-active text-ink" : "text-ink-muted hover:bg-hover hover:text-ink"
          }`}
        >
          <PinIcon />
          Scratchpad
        </Link>
      </div>

      <div className="mt-5 flex items-center justify-between px-5 pb-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-faint">
          Notes
        </span>
        <button
          type="button"
          onClick={createNote}
          disabled={creating}
          aria-label="New note"
          title="New note"
          className="-mr-1 rounded-md p-1 text-ink-faint transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
        >
          <PlusIcon />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {notes.length === 0 ? (
          <p className="px-2.5 py-2 text-[13px] leading-5 text-ink-faint">
            Nothing saved yet. Save a copy of the scratchpad, or start a new note.
          </p>
        ) : (
          <ul className="space-y-px">
            {notes.map((note) => {
              const active = pathname === `/n/${note.id}`;
              const snippet = deriveSnippet(note.preview);

              return (
                <li key={note.id}>
                  <Link
                    href={`/n/${note.id}`}
                    /*
                     * Dynamic routes aren't prefetched by <Link> automatically,
                     * so warm the payload on intent — by the time the click
                     * lands the note is usually already in the router cache.
                     */
                    onMouseEnter={() => router.prefetch(`/n/${note.id}`)}
                    onTouchStart={() => router.prefetch(`/n/${note.id}`)}
                    className={`block rounded-lg px-2.5 py-2 transition-colors ${
                      active ? "bg-active" : "hover:bg-hover"
                    }`}
                  >
                    <span
                      className={`block truncate text-[13.5px] ${
                        active ? "text-ink" : "text-ink"
                      }`}
                    >
                      {deriveTitle(note.preview)}
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

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path
        d="M9.5 1.8 14.2 6.5l-1.9.6-2.7 2.7-.3 3-1.6-1.6-4 4 4-4-1.6-1.6 3-.3 2.7-2.7.7-1.8Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
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
