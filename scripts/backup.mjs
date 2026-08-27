/**
 * Writes a complete, offline copy of every note to ./backups.
 *
 *   npm run backup
 *
 * Two forms, on purpose: notes.json is the exact database contents and is what
 * a restore would read; the markdown/ folder is the same text in files any
 * editor can open, so the backup stays useful even if this app is gone.
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

const rows = await neon(url)`select * from notes order by created_at desc`;

const stamp = new Date().toISOString().replace(/:/g, "-").slice(0, 16);
const dir = path.join("backups", stamp);
await fs.mkdir(path.join(dir, "markdown"), { recursive: true });

await fs.writeFile(
  path.join(dir, "notes.json"),
  JSON.stringify({ exportedAt: new Date().toISOString(), format: 1, count: rows.length, notes: rows }, null, 2),
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

const trashed = rows.filter((row) => row.deleted_at).length;
console.log(`Backed up ${rows.length} notes (${trashed} in trash) to ${dir}`);
