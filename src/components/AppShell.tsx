"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { canMoveFolder, type FolderSummary } from "@/lib/folder-tree";
import { localDateKey } from "@/lib/format";

import { NoteView } from "./NoteView";
import { QuickOpen } from "./QuickOpen";
import { Sidebar } from "./Sidebar";

export type NoteSummary = {
  id: string;
  kind: "scratch" | "saved" | "daily";
  title: string | null;
  content: string;
  journalDate: string | null;
  folderId: string | null;
  pinnedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type NotesContextValue = {
  notes: NoteSummary[];
  /** Refetches from the server — reorders the list. Use after create/delete. */
  refresh: () => Promise<void>;
  /**
   * Reflects in-progress typing everywhere else — the sidebar's title, search,
   * and the copy a note reopens from — without reordering the list under the
   * cursor mid-sentence.
   */
  updateContent: (id: string, content: string) => void;
  /** Records that a save landed, so a refresh that raced it can't roll it back. */
  markSaved: (id: string, updatedAt: string) => void;
  /**
   * Shows a just-created note straight away. Waiting on refresh() before
   * navigating cost a second server round trip on every new note.
   */
  addNote: (note: NoteSummary) => void;
  /** Opens a note without asking the server for anything. */
  openNote: (id: string) => void;
  /** Creates an empty note — inside a folder, if given — and opens it. */
  createNote: (folderId?: string | null) => Promise<void>;
  /** Opens today's journal entry, creating it only if today doesn't have one yet. */
  openToday: () => Promise<void>;

  folders: FolderSummary[];
  /*
   * Folder operations apply to the tree in memory first and are undone if the
   * server refuses. Each resolves to an error message, or null on success.
   */
  createFolder: (name: string, parentId: string | null) => Promise<string | null>;
  renameFolder: (id: string, name: string) => Promise<string | null>;
  moveFolder: (id: string, parentId: string | null) => Promise<string | null>;
  deleteFolder: (id: string) => Promise<string | null>;
  moveNote: (id: string, folderId: string | null) => Promise<string | null>;
};

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The ⌘K switcher, optionally pre-filled — tags open it with their own name. */
  openSearch: (query?: string) => void;
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

const NOTE_PATH = /^\/n\/([^/]+)$/;

/** Coming back to a tab you left a moment ago doesn't need a fresh list. */
const REFRESH_AFTER = 30_000;

export function AppShell({
  initialNotes,
  initialFolders,
  children,
}: {
  initialNotes: NoteSummary[];
  initialFolders: FolderSummary[];
  children: React.ReactNode;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [folders, setFolders] = useState(initialFolders);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const pathname = usePathname();

  /*
   * Notes with keystrokes the server hasn't acknowledged yet. A refresh must
   * never replace their text: the copy in memory is newer than anything the
   * server could send back, and it's what the note reopens from.
   */
  const unsaved = useRef(new Set<string>());

  /**
   * Server rows win unless this browser holds something newer — either unsaved
   * typing, or a save that landed after the list request left.
   */
  const merge = useCallback((incoming: NoteSummary[]) => {
    setNotes((current) => {
      const local = new Map(current.map((note) => [note.id, note]));
      return incoming.map((note) => {
        const mine = local.get(note.id);
        if (!mine) return note;
        const newer = unsaved.current.has(note.id) || mine.updatedAt > note.updatedAt;
        return newer ? { ...note, content: mine.content, updatedAt: mine.updatedAt } : note;
      });
    });
  }, []);

  // Server-rendered navigation brings a fresh list with it.
  useEffect(() => merge(initialNotes), [initialNotes, merge]);
  useEffect(() => setFolders(initialFolders), [initialFolders]);

  // The drawer is a mobile-only overlay; it shouldn't survive a navigation.
  useEffect(() => setOpen(false), [pathname]);

  const lastRefresh = useRef(Date.now());
  const refresh = useCallback(async () => {
    lastRefresh.current = Date.now();
    const response = await fetch("/api/notes");
    if (!response.ok) return;
    const data = (await response.json()) as { notes: NoteSummary[]; folders: FolderSummary[] };
    merge(data.notes);
    setFolders(data.folders);
  }, [merge]);

  // Pick up what another device wrote while this tab sat in the background.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh.current < REFRESH_AFTER) return;
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const updateContent = useCallback((id: string, content: string) => {
    unsaved.current.add(id);
    setNotes((current) =>
      current.map((note) => (note.id === id ? { ...note, content } : note)),
    );
  }, []);

  const markSaved = useCallback((id: string, updatedAt: string) => {
    unsaved.current.delete(id);
    setNotes((current) => current.map((note) => (note.id === id ? { ...note, updatedAt } : note)));
  }, []);

  const addNote = useCallback((note: NoteSummary) => {
    setNotes((current) => (current.some((n) => n.id === note.id) ? current : [note, ...current]));
  }, []);

  /*
   * Notes open by rewriting the URL, not by navigating. Every note is already
   * in memory, so a server render would only fetch what's on hand — and that
   * round trip was the whole of the delay between clicking a note and seeing
   * it. Next keeps usePathname in step with pushState, and back/forward work.
   */
  const openNote = useCallback((id: string) => {
    const href = `/n/${id}`;
    if (window.location.pathname !== href) window.history.pushState(null, "", href);
  }, []);

  /*
   * Create, show, open — in that order, with nothing awaited in between that
   * the user has to wait on. The row the POST returns is the same row a fresh
   * list would have contained.
   */
  const creating = useRef(false);
  const createNote = useCallback(async (folderId: string | null = null) => {
    if (creating.current) return;
    creating.current = true;
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "", folderId }),
      });
      if (!response.ok) return;

      const { id, note } = (await response.json()) as { id: string; note: NoteSummary };
      addNote(note);
      openNote(id);
    } finally {
      creating.current = false;
    }
  }, [addNote, openNote]);

  const openToday = useCallback(async () => {
    if (creating.current) return;
    creating.current = true;
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: localDateKey() }),
      });
      if (!response.ok) return;

      const { id, note } = (await response.json()) as { id: string; note?: NoteSummary };
      // Only a freshly created entry needs adding; an existing one is already listed.
      if (note) addNote(note);
      openNote(id);
    } finally {
      creating.current = false;
    }
  }, [addNote, openNote]);

  const createFolder = useCallback(async (name: string, parentId: string | null) => {
    const result = await send("/api/folders", "POST", { name, parentId });
    if (typeof result === "string") return result;
    const { folder } = result as { folder: FolderSummary };
    setFolders((current) => [...current, folder]);
    return null;
  }, []);

  /** Applies a change to the tree now; puts the old tree back if the server says no. */
  const optimistic = useCallback(
    async (apply: (current: FolderSummary[]) => FolderSummary[], url: string, method: string, body?: unknown) => {
      let before: FolderSummary[] = [];
      setFolders((current) => {
        before = current;
        return apply(current);
      });
      const result = await send(url, method, body);
      if (typeof result === "string") {
        setFolders(before);
        return result;
      }
      return null;
    },
    [],
  );

  const renameFolder = useCallback(
    (id: string, name: string) =>
      optimistic(
        (current) => current.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
        `/api/folders/${id}`,
        "PATCH",
        { name },
      ),
    [optimistic],
  );

  const moveFolder = useCallback(
    async (id: string, parentId: string | null) => {
      if (!canMoveFolder(folders, id, parentId)) return "A folder can't go inside itself";
      return optimistic(
        (current) => current.map((folder) => (folder.id === id ? { ...folder, parentId } : folder)),
        `/api/folders/${id}`,
        "PATCH",
        { parentId },
      );
    },
    [folders, optimistic],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      const folder = folders.find((candidate) => candidate.id === id);
      if (!folder) return null;
      const parentId = folder.parentId;

      // Mirror the server: everything inside moves up a level, nothing is lost.
      const error = await optimistic(
        (current) =>
          current
            .filter((candidate) => candidate.id !== id)
            .map((candidate) => (candidate.parentId === id ? { ...candidate, parentId } : candidate)),
        `/api/folders/${id}`,
        "DELETE",
      );
      if (!error) {
        setNotes((current) =>
          current.map((note) => (note.folderId === id ? { ...note, folderId: parentId } : note)),
        );
      }
      return error;
    },
    [folders, optimistic],
  );

  const moveNote = useCallback(async (id: string, folderId: string | null) => {
    let previous: string | null = null;
    setNotes((current) =>
      current.map((note) => {
        if (note.id !== id) return note;
        previous = note.folderId;
        return { ...note, folderId };
      }),
    );
    const result = await send(`/api/notes/${id}`, "PATCH", { folderId });
    if (typeof result === "string") {
      setNotes((current) => current.map((note) => (note.id === id ? { ...note, folderId: previous } : note)));
      return result;
    }
    return null;
  }, []);

  const openSearch = useCallback((query = "") => setSearch(query), []);

  // ⌘K / Ctrl+K from anywhere, including from inside the editor.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch((current) => (current === null ? "" : null));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /*
   * Fetch the editor while the page is idle. It's split out so the first paint
   * doesn't wait on it, but there's no reason the first click should either.
   */
  useEffect(() => {
    const warm = () => void import("./MarkdownEditor");
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(warm, 500);
    return () => clearTimeout(timer);
  }, []);

  const notesValue = useMemo(
    () => ({
      notes,
      refresh,
      updateContent,
      markSaved,
      addNote,
      openNote,
      createNote,
      openToday,
      folders,
      createFolder,
      renameFolder,
      moveFolder,
      deleteFolder,
      moveNote,
    }),
    [
      notes,
      refresh,
      updateContent,
      markSaved,
      addNote,
      openNote,
      createNote,
      openToday,
      folders,
      createFolder,
      renameFolder,
      moveFolder,
      deleteFolder,
      moveNote,
    ],
  );
  const sidebarValue = useMemo(() => ({ open, setOpen, openSearch }), [open, openSearch]);

  const noteId = NOTE_PATH.exec(pathname)?.[1] ?? null;

  return (
    <NotesContext.Provider value={notesValue}>
      <SidebarContext.Provider value={sidebarValue}>
        <div className="flex h-dvh overflow-hidden">
          {open && (
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-20 bg-black/25 backdrop-blur-[1px] md:hidden"
            />
          )}

          <Sidebar />

          {/*
            * The route's own page stays mounted while a note is open, only
            * hidden. Unmounting the dashboard would throw away its editor, and
            * coming Back would rebuild it from the router's cached copy of the
            * page — text from before whatever was typed since.
            */}
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className={noteId ? "hidden" : "contents"}>{children}</div>
            {noteId && <NoteView id={noteId} />}
          </main>
        </div>

        {search !== null && <QuickOpen initialQuery={search} onClose={() => setSearch(null)} />}
      </SidebarContext.Provider>
    </NotesContext.Provider>
  );
}

/** A JSON request; resolves to the parsed body, or to an error message to show. */
async function send(url: string, method: string, body?: unknown): Promise<unknown> {
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) return data?.error ?? "Something went wrong";
    return data;
  } catch {
    return "You're offline — try again in a moment";
  }
}
