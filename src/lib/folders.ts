import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { folders, notes } from "@/db/schema";
import { type FolderSummary } from "@/lib/folder-tree";

export async function listFolders(): Promise<FolderSummary[]> {
  return getDb().select({ id: folders.id, name: folders.name, parentId: folders.parentId }).from(folders);
}

/*
 * Deleting a folder, as three statements sent in one transaction.
 *
 * The folder's notes and subfolders move up to its parent before the folder
 * row goes, so deleting a folder only ever changes where things are filed —
 * never whether they exist. Built here, as named statements, so the test can
 * render them and check that the only DELETE among them is aimed at `folders`.
 */

/** Its notes move up a level. An UPDATE: no note is removed. */
export function rehomeNotes(id: string, parentId: string | null) {
  return getDb().update(notes).set({ folderId: parentId }).where(eq(notes.folderId, id));
}

/** Its subfolders move up a level. */
export function rehomeFolders(id: string, parentId: string | null) {
  return getDb().update(folders).set({ parentId }).where(eq(folders.parentId, id));
}

/** Then the folder itself, which by now is empty. */
export function removeFolder(id: string) {
  return getDb().delete(folders).where(eq(folders.id, id)).returning({ id: folders.id });
}

export async function deleteFolder(id: string): Promise<boolean> {
  const db = getDb();
  const [folder] = await db
    .select({ parentId: folders.parentId })
    .from(folders)
    .where(eq(folders.id, id))
    .limit(1);
  if (!folder) return false;

  const [, , removed] = await db.batch([
    rehomeNotes(id, folder.parentId),
    rehomeFolders(id, folder.parentId),
    removeFolder(id),
  ]);
  return removed.length > 0;
}
