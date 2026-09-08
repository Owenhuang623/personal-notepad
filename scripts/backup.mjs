/**
 * Writes a complete, offline copy of the database to ./backups.
 *
 *   npm run backup
 *
 * Three forms, on purpose: notes.json is the exact contents of both tables and
 * is what a restore would read; the markdown/ folder is the same text in files
 * any editor can open; and work.csv is the hours in a shape a spreadsheet
 * understands. The backup stays useful even if this app is gone.
 *
 * Read-only — it never writes to the database.
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs/promises";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run this through `npm run backup`.");
  process.exit(1);
}

const sql = neon(url);
const rows = await sql`select * from notes order by created_at desc`;
const sessions = await sql`select * from work_sessions order by local_date, started_at`;

const stamp = new Date().toISOString().replace(/:/g, "-").slice(0, 16);
const dir = path.join("backups", stamp);
await fs.mkdir(path.join(dir, "markdown"), { recursive: true });

await fs.writeFile(
  path.join(dir, "notes.json"),
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      // Bumped when work_sessions joined the backup. A format 1 file has notes
      // and no hours; a reader should not mistake that for a week of zeros.
      format: 2,
      count: rows.length,
      notes: rows,
      workSessions: sessions,
    },
    null,
    2,
  ),
);

/** A note's name for filing purposes: explicit title, else its day, else its first line. */
function label(row) {
  if (row.title) return row.title;
  // The driver hands back `date` columns as Date objects, not strings.
  if (row.journal_date) return new Date(row.journal_date).toISOString().slice(0, 10);
  return row.content.split("\n").find((line) => line.trim()) ?? "untitled";
}

/** A filename that survives every filesystem, still recognisable at a glance. */
function slug(row) {
  const safe = label(row)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  // The id suffix keeps two notes with the same first line from colliding.
  return `${row.kind}-${safe || "untitled"}-${row.id.slice(0, 8)}.md`;
}

for (const row of rows) {
  await fs.writeFile(path.join(dir, "markdown", slug(row)), row.content);
}

/*
 * The hours again as CSV. JSON is what a restore reads, but a year of working
 * time is the sort of thing you eventually want to look at in a spreadsheet,
 * and that shouldn't require this app or a script to get at.
 */
const csv = [
  "local_date,started_at,ended_at,duration_seconds,hours,source,auto_stopped",
  ...sessions.map((row) =>
    [
      new Date(row.local_date).toISOString().slice(0, 10),
      row.started_at.toISOString(),
      row.ended_at ? row.ended_at.toISOString() : "",
      row.duration_seconds,
      (row.duration_seconds / 3600).toFixed(2),
      row.source,
      row.auto_stopped,
    ].join(","),
  ),
].join("\n");

await fs.writeFile(path.join(dir, "work.csv"), `${csv}\n`);

const trashed = rows.filter((row) => row.deleted_at).length;
const seconds = sessions.reduce((total, row) => total + row.duration_seconds, 0);
const open = sessions.filter((row) => !row.ended_at).length;

console.log(
  `Backed up ${rows.length} notes (${trashed} in trash) and ` +
    `${sessions.length} work sessions (${(seconds / 3600).toFixed(1)}h` +
    `${open ? `, ${open} still running` : ""}) to ${dir}`,
);
