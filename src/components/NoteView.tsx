"use client";

import Link from "next/link";
import { useEffect } from "react";

import { deriveTitle, journalLabel } from "@/lib/format";

import { useNotes } from "./AppShell";
import { Editor } from "./Editor";

/**
 * The open note, drawn straight from the list in memory.
 *
 * Keyed by id, so switching notes swaps the editor in the same frame as the
 * click — and the note being left flushes its last keystrokes as it unmounts.
 */
export function NoteView({ id }: { id: string }) {
  const { notes } = useNotes();
  const note = notes.find((candidate) => candidate.id === id && candidate.kind !== "scratch");

  const name = note
    ? (note.title ?? (note.journalDate ? journalLabel(note.journalDate) : deriveTitle(note.content)))
    : null;

  useEffect(() => {
    document.title = name ? `${name} · Notepad` : "Notepad";
  }, [name]);

  if (!note) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-[14px] text-ink-muted">This note doesn&apos;t exist anymore.</p>
        <Link href="/" className="text-[13px] text-accent hover:underline">
          Back to the dashboard
        </Link>
      </div>
    );
  }

  return (
    <Editor
      key={note.id}
      noteId={note.id}
      kind={note.kind}
      // Read once, at mount: the editor owns the text from then on.
      initialContent={note.content}
      initialPinned={note.pinnedAt !== null}
      journalDate={note.journalDate}
      trashed={note.deletedAt !== null}
    />
  );
}
