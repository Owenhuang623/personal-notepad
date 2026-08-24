import { sql } from "drizzle-orm";
import { date, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * One table for every kind of note.
 *
 * `scratch` and `goals` are singletons: exactly one row of each, enforced by the
 * partial unique indexes below, reached by their own route rather than through
 * the sidebar list. `saved` and `daily` rows are the ones the sidebar lists.
 */
export const SINGLETON_KINDS = ["scratch", "goals"] as const;

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: ["scratch", "saved", "daily", "goals"] })
      .notNull()
      .default("saved"),
    content: text("content").notNull().default(""),
    /** An explicit name. Null means the title is still derived from the first line. */
    title: text("title"),
    /**
     * The calendar day a journal entry belongs to, as the writer's local date
     * rather than a timestamp — an entry written at 11pm belongs to that day,
     * not to whatever day it was in UTC.
     */
    journalDate: date("journal_date", { mode: "string" }),
    /** Null means unpinned. Storing the moment rather than a flag lets pinned notes keep their own order. */
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    /**
     * Soft delete. Deleting a note sets this rather than removing the row, so a
     * mistaken delete — by a misclick or by a stray query — is recoverable.
     * Permanent removal is only permitted on rows that already have it set.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("notes_one_scratch")
      .on(table.kind)
      .where(sql`${table.kind} = 'scratch'`),
    uniqueIndex("notes_one_goals")
      .on(table.kind)
      .where(sql`${table.kind} = 'goals'`),
    index("notes_saved_updated_at").on(table.kind, table.updatedAt.desc()),
    uniqueIndex("notes_one_per_day")
      .on(table.journalDate)
      .where(sql`${table.kind} = 'daily'`),
  ],
);

export type Note = typeof notes.$inferSelect;
