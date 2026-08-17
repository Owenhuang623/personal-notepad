import { Editor } from "@/components/Editor";
import { getScratchNote } from "@/lib/notes";

export const dynamic = "force-dynamic";

export default async function ScratchpadPage() {
  const note = await getScratchNote();

  return <Editor key={note.id} noteId={note.id} kind="scratch" initialContent={note.content} />;
}
