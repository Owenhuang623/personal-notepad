import "server-only";

import { and, desc, eq, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { notes } from "@/db/schema";

/** What the sidebar needs: enough of the body to derive a title, nothing more. */
export type NoteKind = "scratch" | "saved" | "daily";

export type NoteSummary = {
  id: string;
  kind: NoteKind;
  title: string | null;
  preview: string;
  journalDate: string | null;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteDetail = {
  id: string;
  kind: NoteKind;
  title: string | null;
  content: string;
  journalDate: string | null;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listSavedNotes(): Promise<NoteSummary[]> {
  const rows = await getDb()
    .select({
      id: notes.id,
      kind: notes.kind,
      title: notes.title,
      preview: sql<string>`substring(${notes.content} from 1 for 200)`,
      journalDate: notes.journalDate,
      pinnedAt: notes.pinnedAt,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    // Everything but the scratchpad; the sidebar splits these into sections.
    .where(ne(notes.kind, "scratch"))
    // Pinned first (nulls sort last), most recently pinned at the top of that
    // group; everything else falls back to most recently edited.
    .orderBy(
      sql`${notes.pinnedAt} is null`,
      desc(notes.pinnedAt),
      sql`${notes.journalDate} desc nulls last`,
      desc(notes.updatedAt),
    );

  return rows.map((row) => ({
    ...row,
    pinnedAt: row.pinnedAt?.toISOString() ?? null,
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
      title: existing.title,
      content: existing.content,
      journalDate: existing.journalDate,
      pinnedAt: existing.pinnedAt?.toISOString() ?? null,
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
      title: created.title,
      content: created.content,
      journalDate: created.journalDate,
      pinnedAt: created.pinnedAt?.toISOString() ?? null,
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
    .where(and(eq(notes.id, id), ne(notes.kind, "scratch")))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    journalDate: row.journalDate,
    pinnedAt: row.pinnedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
