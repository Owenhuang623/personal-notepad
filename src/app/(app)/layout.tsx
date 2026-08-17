import { AppShell } from "@/components/AppShell";
import { listSavedNotes } from "@/lib/notes";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const notes = await listSavedNotes();

  return <AppShell initialNotes={notes}>{children}</AppShell>;
}
