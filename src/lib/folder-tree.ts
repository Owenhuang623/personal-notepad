/**
 * The folder tree as plain data — no database, no React — so the sidebar, the
 * move picker and the server's cycle check all agree, and the tests can run
 * it directly.
 */

export type FolderSummary = {
  id: string;
  name: string;
  parentId: string | null;
};

/** Folders under a parent (null for the top level), sorted the way a file browser would. */
export function childrenOf<T extends FolderSummary>(folders: T[], parentId: string | null): T[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

/** The folder and everything nested in it, at any depth. */
export function descendantIds(folders: FolderSummary[], id: string): Set<string> {
  const found = new Set([id]);
  // Breadth-first over a list rather than recursion: a corrupt cycle in the
  // data then ends the loop instead of the stack.
  for (let grew = true; grew; ) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && found.has(folder.parentId) && !found.has(folder.id)) {
        found.add(folder.id);
        grew = true;
      }
    }
  }
  return found;
}

/**
 * Whether `folderId` may move under `parentId`. A folder can't go inside
 * itself or anything inside it — the subtree would come loose from the root
 * and vanish from the sidebar.
 */
export function canMoveFolder(folders: FolderSummary[], folderId: string, parentId: string | null): boolean {
  if (parentId === null) return true;
  if (!folders.some((folder) => folder.id === parentId)) return false;
  return !descendantIds(folders, folderId).has(parentId);
}

/** "Work / Shopify / Shipping" — the names from the top down to this folder. */
export function folderPath(folders: FolderSummary[], id: string | null): string[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const seen = new Set<string>();

  for (let current = id ? byId.get(id) : undefined; current; current = current.parentId ? byId.get(current.parentId) : undefined) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    names.unshift(current.name);
  }

  return names;
}

/** Every folder in display order, with its depth — for pickers that show the tree flat. */
export function flattenTree<T extends FolderSummary>(folders: T[]): { folder: T; depth: number }[] {
  const out: { folder: T; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of childrenOf(folders, parentId)) {
      out.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** A folder name as typed, tidied; null when there's nothing left to call it. */
export function cleanFolderName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.replace(/\s+/g, " ").trim().slice(0, 80);
  return trimmed === "" ? null : trimmed;
}
