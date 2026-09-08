import "server-only";

import { and, desc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { notes, SINGLETON_KINDS, type Note } from "@/db/schema";

/** What the sidebar needs: enough of the body to derive a title, nothing more. */
export type NoteKind = "scratch" | "saved" | "daily";

/** Kinds with exactly one row, reached by the dashboard rather than the list. */
type SingletonKind = (typeof SINGLETON_KINDS)[number];

/**
 * Everything the sidebar lists — i.e. everything that isn't a singleton.
 *
 * Also the guard on every write that could strand or destroy a note: the
 * scratchpad must never be reachable by an id, because trashing it would leave
 * the dashboard to lazily create a fresh empty row and hide the writing behind
 * it. Exported so the route handlers share this exact predicate rather than
 * each rebuilding their own, and so the tests can assert it is really there.
 */
export const listable = notInArray(notes.kind, [...SINGLETON_KINDS]);

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
 * The scratchpad is created lazily on first visit so a fresh database needs no
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

export async function getSavedNote(id: string): Promise<NoteDetail | null> {
  const [row] = await getDb()
    .select()
    .from(notes)
    // The scratchpad lives on the dashboard; /n/<id> must not become a second
    // way in, where it would be shown a Delete button that can't apply to it.
    .where(and(eq(notes.id, id), listable))
    .limit(1);

  return row ? toDetail(row) : null;
}

/*
 * The `where` clause of every destructive path, in one place.
 *
 * These are the reason a stray query can't cost you a note, so they are built
 * here rather than inline at the call site: each one is a single expression a
 * test can render to SQL and check, and there is no second copy to drift.
 */

/** Renaming, pinning, moving, trashing — anything but editing the text. */
export function structuralUpdateWhere(id: string) {
  return and(eq(notes.id, id), listable);
}

/** Trashing a note. Refuses a row that is already in the trash, and singletons. */
export function softDeleteWhere(id: string) {
  return and(eq(notes.id, id), listable, isNull(notes.deletedAt));
}

/**
 * Destroying a note for good.
 *
 * `isNotNull(deletedAt)` is the load-bearing part: permanent removal is only
 * ever reachable for a row that is *already* in the trash, so a single stray
 * DELETE against a live note can do nothing at all. It is not a convenience —
 * it is the whole guarantee, and `notes-guards.test.ts` fails if it goes.
 */
export function purgeWhere(id: string) {
  return and(eq(notes.id, id), listable, isNotNull(notes.deletedAt));
}

/** The sidebar's view of a row. Used by the create endpoints so a new note can
 *  be shown without re-listing everything. */
export function toSummary(row: Note): NoteSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    preview: row.content.slice(0, 200),
    journalDate: row.journalDate,
    pinnedAt: row.pinnedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
