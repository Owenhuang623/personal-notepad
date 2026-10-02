"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { countWords } from "@/lib/format";

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
  journalDate,
  trashed = false,
}: {
  noteId: string;
  kind: "scratch" | "saved" | "daily";
  initialContent: string;
  initialPinned: boolean;
  journalDate: string | null;
  trashed?: boolean;
}) {
  /*
   * The text this editor opened with, frozen. The parent re-renders with every
   * keystroke (the list in memory follows the typing), and the draft check
   * below must compare against what was loaded, not against itself.
   */
  const [loaded] = useState(initialContent);
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<Status>("saved");
  const [pinned, setPinned] = useState(initialPinned);

  const contentRef = useRef(loaded);
  const savedRef = useRef(loaded);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  const { refresh, updateContent, markSaved } = useNotes();
  const { setOpen, openSearch } = useSidebar();
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
      const { updatedAt } = (await response.json()) as { updatedAt: string };

      savedRef.current = value;
      if (contentRef.current === value) markSaved(noteId, updatedAt);
      window.localStorage.removeItem(draftKey);
      // Only clear the indicator if nothing was typed while the request was in flight.
      setStatus(contentRef.current === value ? "saved" : "dirty");
    } catch {
      setStatus("error");
    }
  }, [noteId, draftKey, markSaved]);

  /**
   * A draft in localStorage means a previous save never landed — the tab closed
   * or the network dropped. Trust it over the server copy and re-save.
   */
  useEffect(() => {
    const draft = window.localStorage.getItem(draftKey);
    if (draft !== null && draft !== loaded) {
      applyContent(draft);
      setStatus("dirty");
      if (!singleton) updateContent(noteId, draft);
    }
  }, [draftKey, loaded, applyContent, singleton, updateContent, noteId]);

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
    if (!singleton) updateContent(noteId, value);
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

  async function restoreNote() {
    const response = await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    if (response.ok) await refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        * The scratchpad has no header of its own: on the dashboard the timer
        * bar above it is already a full-width row of chrome. Its save state
        * sits in the corner of the page instead; see `SaveState`.
        *
        * A note's header carries no title either. The first line of the note
        * is the title, drawn as one just below — repeating it in a
        * bordered bar was the heaviest thing on the page. What's left is a few
        * quiet controls floating over the paper.
        */}
      {!singleton && (
        <header className="flex h-12 shrink-0 items-center gap-1 px-3 sm:px-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="-ml-1 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-hover hover:text-ink md:hidden"
          >
            <MenuIcon />
          </button>

          {trashed && (
            <span className="ml-1 rounded-full bg-hover px-2.5 py-1 text-[12px] text-ink-muted">
              In the trash
            </span>
          )}

          <div className="flex-1" />

          <SaveState status={status} />

          {trashed ? (
            <button
              type="button"
              onClick={() => void restoreNote()}
              className="rounded-md px-2.5 py-1.5 text-[13px] text-ink-muted transition-colors hover:bg-hover hover:text-ink"
            >
              Restore
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void togglePin()}
                aria-pressed={pinned}
                aria-label={pinned ? "Unpin" : "Pin"}
                title={pinned ? "Unpin from the sidebar" : "Pin to the top of the sidebar"}
                className={`rounded-md p-2 transition-colors hover:bg-hover ${
                  pinned ? "text-accent" : "text-ink-faint hover:text-ink"
                }`}
              >
                <PinIcon className="h-[15px] w-[15px]" />
              </button>
              <ConfirmButton label="Delete" confirmLabel="Move to trash?" onConfirm={() => void deleteNote()} />
            </>
          )}
        </header>
      )}

      <div className="relative min-h-0 flex-1">
        <div className="mx-auto flex h-full w-full max-w-[44rem] flex-col px-6 sm:px-10">
          {/* Only journal entries get a dateline; a regular note is about its
              contents, not the day it happened to be started. */}
          {journalDate && (
            <p className="shrink-0 pt-4 text-[12.5px] font-medium tracking-wide text-ink-faint uppercase">
              <ClientDate iso={journalDate} variant="journalLong" />
            </p>
          )}

          <div className={`min-h-0 flex-1 ${journalDate ? "pt-3" : singleton ? "pt-10" : "pt-4"}`}>
            {/* The stand-in is positioned against this box, not the padded one
                outside it, so the first line sits exactly where CodeMirror
                will put it. The negative margin hands the editor a strip of
                the page's padding to hang heading marks in. */}
            <div className="np-editor relative h-full">
              <MarkdownEditor
                value={content}
                onChange={handleChange}
                autoFocus
                placeholder={PLACEHOLDERS[kind]}
                onTag={(tag) => openSearch(`#${tag}`)}
                onReady={(handle) => {
                  editorRef.current = handle;
                  setEditorReady(true);
                }}
              />

              {!editorReady && content && <StaticText text={content} />}
            </div>
          </div>
        </div>

        {singleton && (
          <div className="pointer-events-none absolute right-4 top-3">
            <SaveState status={status} />
          </div>
        )}

        {wordCount > 0 && (
          <p className="pointer-events-none absolute bottom-3 right-4 rounded-full bg-canvas/80 px-2 py-0.5 text-[11.5px] tabular-nums text-ink-faint backdrop-blur-sm select-none">
            {wordCount === 1 ? "1 word" : `${wordCount.toLocaleString()} words`}
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
      className="np-static pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap text-ink"
    >
      {text}
    </div>
  );
}

/**
 * Saving is the normal state of things, so it isn't announced. A small dot
 * says the latest words haven't reached the server yet; it goes away on its
 * own a moment later. Only a failure gets words, because only a failure asks
 * anything of you.
 */
function SaveState({ status }: { status: Status }) {
  if (status === "error") {
    return (
      <span className="px-2 text-[12px] text-danger" role="status">
        Offline · kept on this device
      </span>
    );
  }

  const pending = status === "dirty" || status === "saving";
  return (
    <span
      role="status"
      aria-label={pending ? "Saving" : "Saved"}
      title={pending ? "Saving…" : "Saved"}
      className="flex h-6 w-6 items-center justify-center"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full bg-ink-faint transition-opacity duration-500 ${
          pending ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
