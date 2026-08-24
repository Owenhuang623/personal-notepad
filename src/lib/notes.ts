import "server-only";

import { and, desc, eq, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { notes, SINGLETON_KINDS, type Note } from "@/db/schema";

/** What the sidebar needs: enough of the body to derive a title, nothing more. */
export type NoteKind = "scratch" | "saved" | "daily" | "goals";

/** Kinds with exactly one row, each reached by its own route. */
type SingletonKind = (typeof SINGLETON_KINDS)[number];

/** Everything the sidebar lists — i.e. everything that isn't a singleton. */
const listable = notInArray(notes.kind, [...SINGLETON_KINDS]);

export type NoteSummary = {
  id: string;
  kind: NoteKind;
  title: string | null;
  preview: string;
  journalDate: string | null;
  pinnedAt: string | null;
  deletedAt: string | null;
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
      deletedAt: notes.deletedAt,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    // Everything but the singletons; the sidebar splits these into sections.
    .where(listable)
    // Pinned first (nulls sort last), most recently pinned at the top of that
    // group; everything else falls back to most recently edited.
    .orderBy(
      sql`${notes.deletedAt} is not null`,
      sql`${notes.pinnedAt} is null`,
      desc(notes.pinnedAt),
      sql`${notes.journalDate} desc nulls last`,
      desc(notes.updatedAt),
    );

  return rows.map((row) => ({
    ...row,
    pinnedAt: row.pinnedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Singletons are created lazily on first visit so a fresh database needs no
 * seeding. The partial unique index on `kind` makes the insert race-safe.
 */
async function getSingletonNote(kind: SingletonKind): Promise<NoteDetail> {
  const [existing] = await getDb().select().from(notes).where(eq(notes.kind, kind)).limit(1);
  if (existing) return toDetail(existing);

  const [created] = await getDb()
    .insert(notes)
    .values({ kind, content: "" })
    .onConflictDoNothing()
    .returning();

  // No row back means another request won the insert race — read theirs.
  return created ? toDetail(created) : getSingletonNote(kind);
}

export function getScratchNote(): Promise<NoteDetail> {
  return getSingletonNote("scratch");
}

export function getGoalsNote(): Promise<NoteDetail> {
  return getSingletonNote("goals");
}

export async function getSavedNote(id: string): Promise<NoteDetail | null> {
  const [row] = await getDb()
    .select()
    .from(notes)
    // Singletons live at their own routes; /n/<id> must not become a second way
    // in, where they would be shown a Delete button that can't apply to them.
    .where(and(eq(notes.id, id), listable))
    .limit(1);

  return row ? toDetail(row) : null;
}

function toDetail(row: Note): NoteDetail {
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
