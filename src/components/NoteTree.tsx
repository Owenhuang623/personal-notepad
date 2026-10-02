"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  canMoveFolder,
  childrenOf,
  descendantIds,
  flattenTree,
  type FolderSummary,
} from "@/lib/folder-tree";

import { useNotes, type NoteSummary } from "./AppShell";
import { type MenuItem } from "./ContextMenu";
import {
  Chevron,
  currentDrag,
  DotsIcon,
  endDrag,
  FolderIcon,
  NewFolderIcon,
  NoteRow,
  PlusIcon,
  RenameInput,
  SectionHeader,
  startDrag,
  type NoteRowProps,
} from "./SidebarRows";

const OPEN_KEY = "np:open-folders";

/** How long a drag has to rest on a closed folder before it opens to show what's inside. */
const SPRING_OPEN = 650;

type RowProps = Omit<NoteRowProps, "note" | "active" | "renaming" | "draggable"> & {
  pathname: string;
  renaming: string | null;
};

/**
 * The Notes section as a folder tree: folders first, alphabetically, then the
 * notes filed alongside them, most recently edited first.
 *
 * Everything moves by drag and drop — a note or a folder onto a folder, or
 * onto the "Notes" heading or empty space for the top level — and by "Move
 * to…" in each row's menu, which is the way in on a touch screen.
 */
export function NoteTree({
  notes,
  rowProps,
  collapsed,
  onToggle,
  showMenu,
  onError,
}: {
  /** Live saved notes. Journal entries have their own section, filed by date. */
  notes: NoteSummary[];
  rowProps: RowProps;
  collapsed: boolean;
  onToggle: () => void;
  showMenu: (items: MenuItem[], x: number, y: number) => void;
  onError: (message: string) => void;
}) {
  const { folders, createNote, createFolder, renameFolder, moveFolder, deleteFolder, moveNote } = useNotes();

  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<{ parentId: string | null } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  /** The folder id under the pointer mid-drag, or "root" for the top level. */
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Which folders are open is a per-device preference, like section collapse.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OPEN_KEY);
      // First visit: top-level folders start open, so the tree shows what it holds.
      if (stored) setOpenFolders(new Set(JSON.parse(stored) as string[]));
      else setOpenFolders(new Set(folders.filter((folder) => folder.parentId === null).map((f) => f.id)));
    } catch {
      // A corrupt or blocked value just means everything starts closed.
    }
  }, []);

  const setOpen = useCallback((ids: string[], open: boolean) => {
    setOpenFolders((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (open) next.add(id);
        else next.delete(id);
      }
      try {
        window.localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        // Not remembered across reloads; the tree still works.
      }
      return next;
    });
  }, []);

  const folderIds = useMemo(() => new Set(folders.map((folder) => folder.id)), [folders]);

  /** A note's folder — or the top level if its folder has gone (deleted on another device). */
  const placeOf = useCallback(
    (note: NoteSummary) => (note.folderId && folderIds.has(note.folderId) ? note.folderId : null),
    [folderIds],
  );

  /** Every folder from the top down to `id`, so the path to it can be opened. */
  const ancestors = useCallback(
    (id: string | null) => {
      const byId = new Map(folders.map((folder) => [folder.id, folder]));
      const chain: string[] = [];
      for (let current = id ? byId.get(id) : undefined; current && !chain.includes(current.id); ) {
        chain.push(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return chain;
    },
    [folders],
  );

  // Opening a note — from search, say — opens the folders it's filed in.
  const activeId = /^\/n\/([^/]+)$/.exec(rowProps.pathname)?.[1];
  const activeFolder = notes.find((note) => note.id === activeId)?.folderId ?? null;
  useEffect(() => {
    if (activeFolder) setOpen(ancestors(activeFolder), true);
  }, [activeFolder, ancestors, setOpen]);

  // Notes inside a folder, nested folders included, for the count beside its name.
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const folder of folders) {
      const inside = descendantIds(folders, folder.id);
      result.set(folder.id, notes.filter((note) => inside.has(placeOf(note) ?? "")).length);
    }
    return result;
  }, [folders, notes, placeOf]);

  /* ---------- moving ---------- */

  async function moveItem(type: "note" | "folder", id: string, target: string | null) {
    const error = type === "note" ? await moveNote(id, target) : await moveFolder(id, target);
    if (error) onError(error);
    else if (target) setOpen(ancestors(target), true);
  }

  /** Where a dragged item may land. Dropping something where it already is isn't a move. */
  function accepts(target: string | null): boolean {
    const item = currentDrag();
    if (!item) return false;
    if (item.type === "note") {
      const note = notes.find((candidate) => candidate.id === item.id);
      return !!note && placeOf(note) !== target;
    }
    const folder = folders.find((candidate) => candidate.id === item.id);
    return !!folder && folder.parentId !== target && canMoveFolder(folders, item.id, target);
  }

  const springTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(springTimer.current);
    if (dropTarget && dropTarget !== "root" && !openFolders.has(dropTarget)) {
      springTimer.current = setTimeout(() => setOpen([dropTarget], true), SPRING_OPEN);
    }
    return () => clearTimeout(springTimer.current);
  }, [dropTarget, openFolders, setOpen]);

  /*
   * Each folder's whole subtree is a drop target, and the innermost one under
   * the pointer wins (stopPropagation) — so dropping onto a note that sits
   * inside a folder files the dragged item into that folder.
   */
  function dropProps(target: string | null): React.HTMLAttributes<HTMLElement> {
    const key = target ?? "root";
    return {
      onDragOver(event) {
        if (!currentDrag()) return;
        event.stopPropagation();
        if (!accepts(target)) {
          event.dataTransfer.dropEffect = "none";
          setDropTarget(null);
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget(key);
      },
      onDragLeave(event) {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDropTarget((current) => (current === key ? null : current));
      },
      onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        const item = currentDrag();
        const ok = accepts(target);
        setDropTarget(null);
        endDrag();
        if (item && ok) void moveItem(item.type, item.id, target);
      },
    };
  }

  /* ---------- menus ---------- */

  function openNoteMenu(note: NoteSummary, x: number, y: number) {
    rowProps.openMenu(note, x, y);
  }

  function folderMenu(folder: FolderSummary, x: number, y: number) {
    const inside = counts.get(folder.id) ?? 0;
    const hasSubfolders = folders.some((candidate) => candidate.parentId === folder.id);

    showMenu(
      [
        {
          label: "New note here",
          onSelect: () => {
            setOpen([folder.id], true);
            void createNote(folder.id);
          },
        },
        {
          label: "New folder inside",
          onSelect: () => {
            setOpen([folder.id], true);
            setDraft({ parentId: folder.id });
          },
        },
        { label: "Rename", separated: true, onSelect: () => setRenamingFolder(folder.id) },
        {
          label: "Move to…",
          onSelect: () =>
            showMenu(
              buildMoveTargets(folders, folder.parentId, descendantIds(folders, folder.id), (target) =>
                void moveItem("folder", folder.id, target),
              ),
              x,
              y,
            ),
        },
        {
          // Say plainly what happens to what's inside, since it's the worry.
          label: inside || hasSubfolders ? "Delete folder, keep its notes" : "Delete folder",
          danger: true,
          confirm: true,
          separated: true,
          onSelect: async () => {
            const error = await deleteFolder(folder.id);
            if (error) onError(error);
          },
        },
      ],
      x,
      y,
    );
  }

  /* ---------- rendering ---------- */

  async function commitDraft(name: string) {
    const parentId = draft?.parentId ?? null;
    setDraft(null);
    if (!name.trim()) return;
    const error = await createFolder(name, parentId);
    if (error) onError(error);
    else if (parentId) setOpen(ancestors(parentId), true);
  }

  function renderLevel(parentId: string | null) {
    const childFolders = childrenOf(folders, parentId);
    const childNotes = notes.filter((note) => placeOf(note) === parentId);
    const showDraft = draft !== null && draft.parentId === parentId;

    if (parentId && !childFolders.length && !childNotes.length && !showDraft) {
      return <p className="px-2.5 py-1 text-[12.5px] text-ink-faint">Empty</p>;
    }

    return (
      <ul className="space-y-px">
        {showDraft && (
          <li className="flex items-center gap-2 rounded-lg bg-active px-2.5 py-[7px] ring-1 ring-line-strong">
            <span className="text-ink-faint">
              <FolderIcon />
            </span>
            <RenameInput
              initial=""
              label="Folder name"
              placeholder="Folder name"
              onCommit={(value) => void commitDraft(value)}
              onCancel={() => setDraft(null)}
            />
          </li>
        )}

        {childFolders.map((folder) => renderFolder(folder))}

        {childNotes.map((note) => (
          <li key={note.id}>
            <NoteRow
              note={note}
              active={rowProps.pathname === `/n/${note.id}`}
              openNote={rowProps.openNote}
              showDate={rowProps.showDate}
              renaming={rowProps.renaming === note.id}
              setRenaming={rowProps.setRenaming}
              openMenu={openNoteMenu}
              onRename={rowProps.onRename}
              draggable
            />
          </li>
        ))}
      </ul>
    );
  }

  function renderFolder(folder: FolderSummary) {
    const isOpen = openFolders.has(folder.id);
    const isTarget = dropTarget === folder.id;
    const count = counts.get(folder.id) ?? 0;

    return (
      <li key={folder.id} {...dropProps(folder.id)}>
        <div
          className={`group relative flex items-center rounded-lg transition-colors ${
            isTarget ? "bg-accent-soft ring-1 ring-accent/35" : "hover:bg-hover"
          }`}
        >
          {renamingFolder === folder.id ? (
            <div className="flex w-full items-center gap-2 rounded-lg bg-active px-2.5 py-[7px] ring-1 ring-line-strong">
              <span className="text-ink-faint">
                <FolderIcon open={isOpen} />
              </span>
              <RenameInput
                initial={folder.name}
                label="Folder name"
                onCommit={async (value) => {
                  setRenamingFolder(null);
                  if (!value.trim() || value.trim() === folder.name) return;
                  const error = await renameFolder(folder.id, value.trim());
                  if (error) onError(error);
                }}
                onCancel={() => setRenamingFolder(null)}
              />
            </div>
          ) : (
            <button
              type="button"
              draggable
              onDragStart={(event) => startDrag(event, { type: "folder", id: folder.id })}
              onDragEnd={() => {
                endDrag();
                setDropTarget(null);
              }}
              onClick={() => setOpen([folder.id], !isOpen)}
              onDoubleClick={() => setRenamingFolder(folder.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                folderMenu(folder, event.clientX, event.clientY);
              }}
              aria-expanded={isOpen}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-[7px] pr-14 pl-1 text-left text-[13.5px] text-ink/85"
            >
              <span className="flex w-3.5 justify-center text-ink-faint">
                <Chevron collapsed={!isOpen} className="h-2.5 w-2.5" />
              </span>
              <span className={isOpen || isTarget ? "text-accent" : "text-ink-faint"}>
                <FolderIcon open={isOpen || isTarget} />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
              <span className="text-[11.5px] tabular-nums text-ink-faint transition-opacity md:group-hover:opacity-0">
                {count || ""}
              </span>
            </button>
          )}

          {renamingFolder !== folder.id && (
            <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
              <button
                type="button"
                aria-label={`New note in ${folder.name}`}
                title="New note here"
                onClick={() => {
                  setOpen([folder.id], true);
                  void createNote(folder.id);
                }}
                className="rounded-md p-1 text-ink-faint hover:bg-hover hover:text-ink"
              >
                <PlusIcon />
              </button>
              <button
                type="button"
                aria-label={`Actions for ${folder.name}`}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  folderMenu(folder, rect.left, rect.bottom + 4);
                }}
                className="rounded-md p-1 text-ink-faint hover:bg-hover hover:text-ink"
              >
                <DotsIcon />
              </button>
            </div>
          )}
        </div>

        {isOpen && (
          // The rule down the left is the folder's extent, like a file browser's guide.
          <div className="mt-px ml-[13px] border-l border-line pl-1.5">{renderLevel(folder.id)}</div>
        )}
      </li>
    );
  }

  const empty = notes.length === 0 && folders.length === 0 && !draft;
  const rootProps = dropProps(null);

  return (
    <section className="mb-3">
      <SectionHeader
        label="Notes"
        collapsed={collapsed}
        onToggle={onToggle}
        dropProps={rootProps}
        dropActive={dropTarget === "root"}
        actions={[
          {
            label: "New folder",
            icon: <NewFolderIcon />,
            onSelect: () => {
              if (collapsed) onToggle();
              setDraft({ parentId: null });
            },
          },
          { label: "New note", onSelect: () => void createNote(null) },
        ]}
      />

      {!collapsed && (
        <div
          {...rootProps}
          onDragEnd={() => setDropTarget(null)}
          className={`min-h-10 rounded-lg pb-6 transition-colors ${dropTarget === "root" ? "bg-accent-soft" : ""}`}
        >
          {empty ? (
            <p className="px-2.5 py-1.5 text-[12.5px] text-ink-faint">Nothing saved yet.</p>
          ) : (
            renderLevel(null)
          )}
        </div>
      )}
    </section>
  );
}

/**
 * "Move to…": the tree, flat and indented, with where the item already is
 * greyed out. `exclude` drops a folder's own subtree, where it can't go.
 */
function buildMoveTargets(
  folders: FolderSummary[],
  current: string | null,
  exclude: Set<string>,
  pick: (target: string | null) => void,
): MenuItem[] {
  return [
    {
      key: "root",
      label: "Notes (top level)",
      icon: <TopLevelIcon />,
      disabled: current === null,
      onSelect: () => pick(null),
    },
    ...flattenTree(folders)
      .filter(({ folder }) => !exclude.has(folder.id))
      .map(({ folder, depth }) => ({
        key: folder.id,
        label: folder.name,
        indent: depth + 1,
        icon: <FolderIcon />,
        disabled: folder.id === current,
        onSelect: () => pick(folder.id),
      })),
  ];
}

/** "Move to folder…" for a note, used by the sidebar's note menu. */
export function useMoveNoteTargets() {
  const { folders, moveNote } = useNotes();
  return useCallback(
    (note: NoteSummary, onError: (message: string) => void): MenuItem[] => {
      const current = note.folderId && folders.some((folder) => folder.id === note.folderId) ? note.folderId : null;
      return buildMoveTargets(folders, current, new Set(), async (target) => {
        const error = await moveNote(note.id, target);
        if (error) onError(error);
      });
    },
    [folders, moveNote],
  );
}

function TopLevelIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-[15px] w-[15px]" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 6h11" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
