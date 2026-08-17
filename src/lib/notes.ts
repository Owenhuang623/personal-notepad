import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { notes } from "@/db/schema";

/** What the sidebar needs: enough of the body to derive a title, nothing more. */
export type NoteSummary = {
  id: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteDetail = {
  id: string;
  kind: "scratch" | "saved";
  content: string;
  createdAt: string;
  updatedAt: string;
};

export async function listSavedNotes(): Promise<NoteSummary[]> {
  const rows = await getDb()
    .select({
      id: notes.id,
      preview: sql<string>`substring(${notes.content} from 1 for 200)`,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(eq(notes.kind, "saved"))
    .orderBy(desc(notes.updatedAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * The scratchpad is created lazily on first visit so a fresh database needs no
 * seeding. The unique index on `kind` makes the insert race-safe.
 */
export async function getScratchNote(): Promise<NoteDetail> {
  const [existing] = await getDb().select().from(notes).where(eq(notes.kind, "scratch")).limit(1);
  if (existing) {
    return {
      id: existing.id,
      kind: "scratch",
      content: existing.content,
      createdAt: existing.createdAt.toISOString(),
      updatedAt: existing.updatedAt.toISOString(),
    };
  }

  const [created] = await getDb()
    .insert(notes)
    .values({ kind: "scratch", content: "" })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return {
      id: created.id,
      kind: "scratch",
      content: created.content,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  // Another request won the insert race — read theirs.
  return getScratchNote();
}

export async function getSavedNote(id: string): Promise<NoteDetail | null> {
  const [row] = await getDb()
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.kind, "saved")))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    kind: "saved",
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
