import { notFound } from "next/navigation";

import { Editor } from "@/components/Editor";
import { deriveTitle } from "@/lib/format";
import { getSavedNote } from "@/lib/notes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const note = await getSavedNote(id);

  return { title: note ? deriveTitle(note.content) : "Note" };
}

export default async function NotePage({ params }: Props) {
  const { id } = await params;
  const note = await getSavedNote(id);

  if (!note) notFound();

  return <Editor key={note.id} noteId={note.id} kind="saved" initialContent={note.content} createdAt={note.createdAt} />;
}
