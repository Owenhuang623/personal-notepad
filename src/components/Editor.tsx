"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { countWords, deriveTitle } from "@/lib/format";

import { useNotes, useSidebar } from "./AppShell";
import { ClientDate } from "./ClientDate";
import { ConfirmButton } from "./ConfirmButton";
import type { MarkdownEditorHandle } from "./MarkdownEditor";

/*
 * CodeMirror is 180 KB gzipped — over half of all the JavaScript on the page,
 * and until it had parsed and mounted, the note was invisible. Loading it
 * separately lets the server-rendered text show first; StaticText below stands
 * in for the few hundred milliseconds it takes to arrive.
 */
const MarkdownEditor = dynamic(() => import("./MarkdownEditor").then((m) => m.MarkdownEditor), {
  ssr: false,
});
import { PinIcon } from "./PinIcon";

const PLACEHOLDERS = {
  scratch: "Start typing…",
  saved: "Empty note",
  daily: "What's on your mind?",
} as const;

const AUTOSAVE_DELAY = 600;
const RETRY_DELAY = 5000;

type Status = "saved" | "dirty" | "saving" | "error";

export function Editor({
  noteId,
  kind,
  initialContent,
  initialPinned,
  title,
  journalDate,
}: {
  noteId: string;
  kind: "scratch" | "saved" | "daily";
  initialContent: string;
  initialPinned: boolean;
  title: string | null;
  journalDate: string | null;
}) {
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<Status>("saved");
  const [pinned, setPinned] = useState(initialPinned);

  const contentRef = useRef(initialContent);
  const savedRef = useRef(initialContent);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  const { refresh, updatePreview } = useNotes();
  const { setOpen } = useSidebar();
  const router = useRouter();

  const draftKey = `np:draft:${noteId}`;
  const wordCount = countWords(content);

  /*
   * The scratchpad is a fixture of the app rather than an entry in the list: it
   * can't be pinned, moved or deleted, it isn't previewed in the sidebar, and
   * on the dashboard it carries no header of its own — the timer bar above it
   * is the only chrome, and the writing gets the rest of the page.
   */
  const singleton = kind === "scratch";

  const applyContent = useCallback((value: string) => {
    contentRef.current = value;
    setContent(value);
  }, []);

  const flush = useCallback(async () => {
    const value = contentRef.current;
    if (value === savedRef.current) return;

    setStatus("saving");
    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: value }),
        keepalive: true,
      });
      if (!response.ok) throw new Error(`Save failed: ${response.status}`);

      savedRef.current = value;
      window.localStorage.removeItem(draftKey);
      // Only clear the indicator if nothing was typed while the request was in flight.
      setStatus(contentRef.current === value ? "saved" : "dirty");
    } catch {
      setStatus("error");
    }
  }, [noteId, draftKey]);

  /**
   * A draft in localStorage means a previous save never landed — the tab closed
   * or the network dropped. Trust it over the server copy and re-save.
   */
  useEffect(() => {
    const draft = window.localStorage.getItem(draftKey);
    if (draft !== null && draft !== initialContent) {
      applyContent(draft);
      setStatus("dirty");
    }
  }, [draftKey, initialContent, applyContent]);

  useEffect(() => {
    if (content === savedRef.current) return;
    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [content, flush]);

  useEffect(() => {
    if (status !== "error") return;
    const timer = setTimeout(() => void flush(), RETRY_DELAY);
    return () => clearTimeout(timer);
  }, [status, flush]);

  // Backstop the debounce: leaving the tab or the page saves immediately.
  useEffect(() => {
    const handleHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };

    document.addEventListener("visibilitychange", handleHide);
    window.addEventListener("pagehide", handleHide);

    return () => {
      document.removeEventListener("visibilitychange", handleHide);
      window.removeEventListener("pagehide", handleHide);
      void flush();
    };
  }, [flush]);

  // ⌘S just means "don't wait for the debounce". Everything autosaves anyway.
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "s") return;
      event.preventDefault();
      void flush();
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [flush]);

  function handleChange(value: string) {
    applyContent(value);
    setStatus("dirty");
    window.localStorage.setItem(draftKey, value);
    if (!singleton) updatePreview(noteId, value);
  }

  async function togglePin() {
    const next = !pinned;
    setPinned(next); // optimistic — the sidebar reorders as soon as refresh lands

    const response = await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned: next }),
    });

    if (!response.ok) {
      setPinned(!next);
      return;
    }

    await refresh();
  }

  async function deleteNote() {
    const response = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    if (!response.ok) return;

    window.localStorage.removeItem(draftKey);
    savedRef.current = contentRef.current; // stop the unmount flush from recreating it
    await refresh();
    router.push("/");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        * The scratchpad has no header of its own.
        *
        * On the dashboard the timer bar above it is already a full-width row of
        * chrome, and a second one underneath saying "Scratchpad" — a page with
        * one writing surface on it — was labelling the obvious and costing the
        * writing 56px. Its save state moved into the corner of the page below;
        * see `statusLabel`.
        */}
      {!singleton && (
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="-ml-1 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-hover hover:text-ink md:hidden"
          >
            <MenuIcon />
          </button>

          <h1 className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
            {title ??
              (journalDate ? <ClientDate iso={journalDate} variant="journal" /> : deriveTitle(content))}
          </h1>

          <span className="shrink-0 text-[12px] tabular-nums text-ink-faint">
            {statusLabel(status)}
          </span>

          <button
            type="button"
            onClick={() => void togglePin()}
            title={pinned ? "Unpin from the sidebar" : "Pin to the top of the sidebar"}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-hover ${
              pinned ? "text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            <PinIcon className="h-3.5 w-3.5" />
            {pinned ? "Pinned" : "Pin"}
          </button>
          <ConfirmButton label="Delete" confirmLabel="Confirm" onConfirm={() => void deleteNote()} />
        </header>
      )}

      <div className="relative min-h-0 flex-1">
        <div className="mx-auto flex h-full w-full max-w-[46rem] flex-col px-5 sm:px-8">
          {/* Only journal entries get a dateline; a regular note is about its
              contents, not the day it happened to be started. */}
          {journalDate && (
            <p className="shrink-0 pt-7 text-[12px] text-ink-faint">
              <ClientDate iso={journalDate} variant="journalLong" />
            </p>
          )}

          <div className={`min-h-0 flex-1 ${journalDate ? "pt-3" : "pt-8"}`}>
            {/* The stand-in is positioned against this box, not the padded one
                outside it, so the first line sits exactly where CodeMirror
                will put it. */}
            <div className="relative h-full">
              <MarkdownEditor
                value={content}
                onChange={handleChange}
                autoFocus
                placeholder={PLACEHOLDERS[kind]}
                onReady={(handle) => {
                  editorRef.current = handle;
                  setEditorReady(true);
                }}
              />

              {!editorReady && content && <StaticText text={content} />}
            </div>
          </div>
        </div>

        {/* Sits in the padding above the first line, so it never crowds the text. */}
        {singleton && (
          <p className="pointer-events-none absolute right-4 top-3 text-[11.5px] tabular-nums text-ink-faint select-none">
            {statusLabel(status)}
          </p>
        )}

        {wordCount > 0 && (
          <p className="pointer-events-none absolute bottom-3 right-4 text-[11.5px] tabular-nums text-ink-faint select-none">
            {wordCount === 1 ? "1 word" : `${wordCount} words`}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The note as it looks before the editor exists — same font, size and line
 * height as `.cm-content`, so the text doesn't move when CodeMirror replaces
 * it. Markdown still reads as markdown here; only the styling is missing.
 */
function StaticText({ text }: { text: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden font-sans text-[15px] leading-[1.75] whitespace-pre-wrap text-ink"
    >
      {text}
    </div>
  );
}

function statusLabel(status: Status): string {
  switch (status) {
    case "saving":
      return "Saving…";
    case "dirty":
      return "Unsaved";
    case "error":
      return "Offline · kept locally";
    default:
      return "Saved";
  }
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
