import { Editor } from "@/components/Editor";
import { getGoalsNote } from "@/lib/notes";

export const dynamic = "force-dynamic";

export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  const note = await getGoalsNote();

  return (
    <Editor
      key={note.id}
      noteId={note.id}
      kind="goals"
      initialContent={note.content}
      initialPinned={false}
      title={note.title}
      journalDate={null}
    />
  );
}
