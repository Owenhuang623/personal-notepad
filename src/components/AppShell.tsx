"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { Sidebar } from "./Sidebar";

export type NoteSummary = {
  id: string;
  preview: string;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type NotesContextValue = {
  notes: NoteSummary[];
  /** Refetches from the server — reorders the list. Use after create/delete. */
  refresh: () => Promise<void>;
  /**
   * Reflects in-progress typing in the sidebar without reordering, so the list
   * doesn't shuffle under the cursor mid-sentence.
   */
  updatePreview: (id: string, content: string) => void;
};

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const NotesContext = createContext<NotesContextValue | null>(null);
const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useNotes() {
  const value = useContext(NotesContext);
  if (!value) throw new Error("useNotes must be used inside AppShell");
  return value;
}

export function useSidebar() {
  const value = useContext(SidebarContext);
  if (!value) throw new Error("useSidebar must be used inside AppShell");
  return value;
}

export function AppShell({
  initialNotes,
  children,
}: {
  initialNotes: NoteSummary[];
  children: React.ReactNode;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Server-rendered navigation brings a fresh list with it.
  useEffect(() => setNotes(initialNotes), [initialNotes]);

  // The drawer is a mobile-only overlay; it shouldn't survive a navigation.
  useEffect(() => setOpen(false), [pathname]);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/notes");
    if (!response.ok) return;
    const data = (await response.json()) as { notes: NoteSummary[] };
    setNotes(data.notes);
  }, []);

  const updatePreview = useCallback((id: string, content: string) => {
    setNotes((current) =>
      current.map((note) =>
        note.id === id
          ? { ...note, preview: content.slice(0, 200), updatedAt: new Date().toISOString() }
          : note,
      ),
    );
  }, []);

  const notesValue = useMemo(
    () => ({ notes, refresh, updatePreview }),
    [notes, refresh, updatePreview],
  );
  const sidebarValue = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <NotesContext.Provider value={notesValue}>
      <SidebarContext.Provider value={sidebarValue}>
        <div className="flex h-dvh overflow-hidden">
          {open && (
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-20 bg-black/25 md:hidden"
            />
          )}

          <Sidebar />

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </SidebarContext.Provider>
    </NotesContext.Provider>
  );
}
