import { notFound } from "next/navigation";

import { Editor } from "@/components/Editor";
import { deriveTitle } from "@/lib/format";
import { getSavedNote } from "@/lib/notes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const note = await getSavedNote(id);

  if (!note) return { title: "Note" };
  return { title: note.title ?? (note.journalDate ? `Journal — ${note.journalDate}` : deriveTitle(note.content)) };
}

export default async function NotePage({ params }: Props) {
  const { id } = await params;
  const note = await getSavedNote(id);

  if (!note) notFound();

  return <Editor key={note.id} noteId={note.id} kind="saved" initialContent={note.content} initialPinned={note.pinnedAt !== null} title={note.title} journalDate={note.journalDate} />;
}
