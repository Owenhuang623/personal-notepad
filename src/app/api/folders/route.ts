import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { folders } from "@/db/schema";
import { cleanFolderName } from "@/lib/folder-tree";
import { isMissingFolder, isUuid } from "@/lib/validate";

/** Creates a folder at the top level, or inside `parentId`. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const name = cleanFolderName(body?.name);
  if (!name) return NextResponse.json({ error: "A folder needs a name" }, { status: 400 });

  const parentId = body?.parentId ?? null;
  if (parentId !== null && !isUuid(parentId)) {
    return NextResponse.json({ error: "parentId must be a folder id or null" }, { status: 400 });
  }

  try {
    const [created] = await getDb()
      .insert(folders)
      .values({ name, parentId })
      .returning({ id: folders.id, name: folders.name, parentId: folders.parentId });
    return NextResponse.json({ folder: created }, { status: 201 });
  } catch (error) {
    if (isMissingFolder(error)) {
      return NextResponse.json({ error: "The parent folder doesn't exist" }, { status: 404 });
    }
    throw error;
  }
}
