/**
 * Writes a complete, offline copy of the database to ./backups.
 *
 *   npm run backup
 *
 * Three forms, on purpose: notes.json is the exact contents of every table and
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
const folders = await sql`select * from folders order by created_at`;
const imageRows = await sql`select * from images order by created_at`;

const stamp = new Date().toISOString().replace(/:/g, "-").slice(0, 16);
const dir = path.join("backups", stamp);
await fs.mkdir(path.join(dir, "markdown"), { recursive: true });

await fs.writeFile(
  path.join(dir, "notes.json"),
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      // 2 added work_sessions; 3 added folders (and notes.folder_id); 4 added
      // images. A file without folders means "all top level"; without images,
      // that there were none to copy.
      format: 4,
      count: rows.length,
      notes: rows,
      folders,
      // Each image is also written to images/ as a real file.
      images: imageRows,
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

/** A folder name that is safe as a directory name everywhere, still readable. */
function dirName(name) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/^\.+/, "").trim().slice(0, 64) || "folder";
}

/** The directory path of a folder, from the top down. Stops on a corrupt cycle. */
const byId = new Map(folders.map((folder) => [folder.id, folder]));
function folderDirs(id) {
  const parts = [];
  const seen = new Set();
  for (let folder = byId.get(id); folder && !seen.has(folder.id); folder = byId.get(folder.parent_id)) {
    seen.add(folder.id);
    parts.unshift(dirName(folder.name));
  }
  return parts;
}

/*
 * Images as ordinary files, and the markdown copies pointed at them — so a
 * note opened from this folder in any editor shows its pictures, with no app
 * and no server involved.
 */
const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const imageFile = new Map(imageRows.map((image) => [image.id, `${image.id}.${EXTENSIONS[image.mime] ?? "bin"}`]));
if (imageRows.length) await fs.mkdir(path.join(dir, "images"), { recursive: true });
for (const image of imageRows) {
  await fs.writeFile(path.join(dir, "images", imageFile.get(image.id)), Buffer.from(image.data, "base64"));
}

for (const row of rows) {
  const dirs = row.folder_id ? folderDirs(row.folder_id) : [];
  const where = path.join(dir, "markdown", ...dirs);
  await fs.mkdir(where, { recursive: true });

  const toImages = path.posix.join(...new Array(dirs.length + 1).fill(".."), "images");
  const content = row.content.replace(/\/api\/images\/([0-9a-f-]{36})/gi, (whole, id) =>
    imageFile.has(id.toLowerCase()) ? `${toImages}/${imageFile.get(id.toLowerCase())}` : whole,
  );
  await fs.writeFile(path.join(where, slug(row)), content);
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
  `Backed up ${rows.length} notes (${trashed} in trash), ${folders.length} folders, ` +
    `${imageRows.length} images and ` +
    `${sessions.length} work sessions (${(seconds / 3600).toFixed(1)}h` +
    `${open ? `, ${open} still running` : ""}) to ${dir}`,
);
