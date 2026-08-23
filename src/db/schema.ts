import { sql } from "drizzle-orm";
import { date, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * One table for both kinds of note.
 *
 * `scratch` is the singleton notepad that opens by default — there is exactly
 * one row with this kind, enforced by the partial unique index below.
 * `saved` rows are the copies that show up in the sidebar.
 */
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: ["scratch", "saved", "daily"] })
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("notes_one_scratch")
      .on(table.kind)
      .where(sql`${table.kind} = 'scratch'`),
    index("notes_saved_updated_at").on(table.kind, table.updatedAt.desc()),
    uniqueIndex("notes_one_per_day")
      .on(table.journalDate)
      .where(sql`${table.kind} = 'daily'`),
  ],
);

export type Note = typeof notes.$inferSelect;
