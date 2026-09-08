import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * One table for every kind of note.
 *
 * `scratch` is a singleton: exactly one row, enforced by the partial unique
 * index below, reached by the dashboard rather than through the sidebar list.
 * `saved` and `daily` rows are the ones the sidebar lists.
 */
export const SINGLETON_KINDS = ["scratch"] as const;

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
    index("notes_saved_updated_at").on(table.kind, table.updatedAt.desc()),
    uniqueIndex("notes_one_per_day")
      .on(table.journalDate)
      .where(sql`${table.kind} = 'daily'`),
  ],
);

export type Note = typeof notes.$inferSelect;

/**
 * One row per block of work.
 *
 * The week's total is a SUM over these rather than a counter that gets reset:
 * nothing has to happen at midnight on Sunday for the number to be right, the
 * window simply moves. A reset that never runs can't lose a week, and every
 * past week stays queryable.
 */
export const workSessions = pgTable(
  "work_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * The day this block counts toward, as the writer's local date. The week
     * runs from local midnight on Sunday; the server is in UTC and would file
     * an evening session under the following day — and every so often under
     * the following *week*.
     */
    localDate: date("local_date", { mode: "string" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null while the stopwatch is still running. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /**
     * The length of the block, in seconds; 0 while it is still running.
     *
     * Redundant with `ended_at - started_at`, and deliberately kept equal to
     * it, so that totalling a week is an integer sum rather than interval
     * arithmetic over a few hundred rows.
     */
    durationSeconds: integer("duration_seconds").notNull().default(0),
    /** `manual` rows were typed in after the fact; their clock times mean nothing. */
    source: text("source", { enum: ["timer", "manual"] }).notNull().default("timer"),
    /** Set when the cap closed this session rather than the writer. */
    autoStopped: boolean("auto_stopped").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("work_sessions_local_date").on(table.localDate),
    /*
     * At most one stopwatch running at a time — the same partial-index trick as
     * the singleton notes above, over a predicate that is constantly true
     * within the rows it indexes. Two tabs both pressing Start is then a
     * conflict the database settles, rather than two clocks racing.
     */
    uniqueIndex("work_sessions_one_running")
      .on(sql`(${table.endedAt} is null)`)
      .where(sql`${table.endedAt} is null`),
  ],
);

export type WorkSession = typeof workSessions.$inferSelect;
