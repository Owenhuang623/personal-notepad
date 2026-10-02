import { AppShell } from "@/components/AppShell";
import { listSidebar } from "@/lib/notes";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { notes, folders } = await listSidebar();

  return (
    <AppShell initialNotes={notes} initialFolders={folders}>
      {children}
    </AppShell>
  );
}
