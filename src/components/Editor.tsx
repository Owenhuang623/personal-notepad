"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { countWords, deriveTitle } from "@/lib/format";

import { useNotes, useSidebar } from "./AppShell";
import { ClientDate } from "./ClientDate";
import { ConfirmButton } from "./ConfirmButton";
import { PinIcon } from "./PinIcon";

const AUTOSAVE_DELAY = 600;
const RETRY_DELAY = 5000;

type Status = "saved" | "dirty" | "saving" | "error";

export function Editor({
  noteId,
  kind,
  initialContent,
  createdAt,
  initialPinned,
}: {
  noteId: string;
  kind: "scratch" | "saved";
  initialContent: string;
  createdAt: string;
  initialPinned: boolean;
}) {
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<Status>("saved");
  const [flash, setFlash] = useState<string | null>(null);
  const [pinned, setPinned] = useState(initialPinned);

  const contentRef = useRef(initialContent);
  const savedRef = useRef(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { refresh, updatePreview } = useNotes();
  const { setOpen } = useSidebar();
  const router = useRouter();

  const draftKey = `np:draft:${noteId}`;
  const wordCount = countWords(content);

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

  const saveCopy = useCallback(async () => {
    if (!contentRef.current.trim()) return;

    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: contentRef.current }),
    });
    if (!response.ok) return;

    await refresh();
    setFlash("Copy saved");
  }, [refresh]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "s") return;
      event.preventDefault();
      if (kind === "scratch") void saveCopy();
      else void flush();
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [kind, saveCopy, flush]);

  function handleChange(value: string) {
    applyContent(value);
    setStatus("dirty");
    window.localStorage.setItem(draftKey, value);
    if (kind === "saved") updatePreview(noteId, value);
  }

  function clearScratchpad() {
    handleChange("");
    textareaRef.current?.focus();
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
    <div className="flex h-dvh flex-col">
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
          {kind === "scratch" ? "Scratchpad" : deriveTitle(content)}
        </h1>

        <span className="shrink-0 text-[12px] tabular-nums text-ink-faint">
          {flash ?? statusLabel(status)}
        </span>

        {kind === "scratch" ? (
          <>
            <button
              type="button"
              onClick={() => void saveCopy()}
              disabled={!content.trim()}
              title="Save a copy (⌘S)"
              className="rounded-md px-2.5 py-1.5 text-[13px] text-ink-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
            >
              Save a copy
            </button>
            <ConfirmButton label="Clear" confirmLabel="Confirm" onConfirm={clearScratchpad} />
          </>
        ) : (
          <>
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
          </>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="mx-auto flex h-full w-full max-w-[46rem] flex-col px-5 sm:px-8">
          {kind === "saved" && (
            <p className="shrink-0 pt-7 text-[12px] text-ink-faint">
              <ClientDate iso={createdAt} variant="long" />
            </p>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => handleChange(event.target.value)}
            autoFocus
            spellCheck
            placeholder={kind === "scratch" ? "Start typing…" : "Empty note"}
            /*
             * The tall bottom padding is deliberate: it lets you keep scrolling
             * past the last line so the line you're writing never sits pinned
             * against the bottom edge of the window.
             */
            className={`min-h-0 w-full flex-1 resize-none bg-transparent pb-[50vh] text-[15px] leading-7 outline-none placeholder:text-ink-faint ${
              kind === "saved" ? "pt-3" : "pt-8"
            }`}
          />
        </div>

        {wordCount > 0 && (
          <p className="pointer-events-none absolute bottom-3 right-4 text-[11.5px] tabular-nums text-ink-faint select-none">
            {wordCount === 1 ? "1 word" : `${wordCount} words`}
          </p>
        )}
      </div>
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
