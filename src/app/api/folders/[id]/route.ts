import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { folders } from "@/db/schema";
import { canMoveFolder, cleanFolderName } from "@/lib/folder-tree";
import { deleteFolder, listFolders } from "@/lib/folders";
import { isUuid } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

/** Renames a folder, moves it under another, or both. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const updates: { name?: string; parentId?: string | null } = {};

  if (body?.name !== undefined) {
    const name = cleanFolderName(body.name);
    if (!name) return NextResponse.json({ error: "A folder needs a name" }, { status: 400 });
    updates.name = name;
  }

  if (body?.parentId !== undefined) {
    const parentId = body.parentId;
    if (parentId !== null && !isUuid(parentId)) {
      return NextResponse.json({ error: "parentId must be a folder id or null" }, { status: 400 });
    }

    // The tree is a few dozen rows at most; reading it whole is one cheap query
    // and makes the cycle check exact.
    if (!canMoveFolder(await listFolders(), id, parentId)) {
      return NextResponse.json({ error: "A folder can't go inside itself" }, { status: 409 });
    }
    updates.parentId = parentId;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const [updated] = await getDb()
    .update(folders)
    .set(updates)
    .where(eq(folders.id, id))
    .returning({ id: folders.id, name: folders.name, parentId: folders.parentId });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ folder: updated });
}

/**
 * Deletes a folder. Its notes and subfolders move up to its parent first — see
 * `deleteFolder` — so no note is ever removed by this.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id) || !(await deleteFolder(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
