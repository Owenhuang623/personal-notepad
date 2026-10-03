@AGENTS.md

# personal-notepad

A single-user notepad. Next.js App Router, Neon Postgres via Drizzle, Tailwind,
deployed on Vercel. See README.md for setup.

## The database holds real, irreplaceable data

**There is one database.** `.env.local` points at the same Neon database the
deployed site uses. There is no separate dev or test database. Every note in it
is something the user actually wrote and has no other copy of.

This has already caused one real loss: a `DELETE` was sent to a UUID scraped out
of page HTML with `grep | head -1`, on the assumption it was the scratchpad. It
was the user's pinned note, and it was destroyed.

`npm run backup` writes both tables to `./backups/<stamp>/` — `notes.json` for
a restore, `markdown/` so the writing outlives this app, and `work.csv` so the
hours open in a spreadsheet. Run it before anything structural. `/api/export`
serves the same payload (format 2) to any device.

### Rules for touching data

1. **Never issue a destructive request against a row you did not create in this
   session.** Capture the id at creation time from the API response. Do not
   recover ids by scraping rendered HTML, guessing, or taking the first match
   from a list.

2. **Verify identity before destroying anything.** `SELECT` the row and check
   its content matches what you expect. An id that merely came back from a query
   is not proof you have the right row.

3. **Clean up only your own test rows**, and list what remains afterwards so the
   user can see their data is intact. If ownership of a row is ambiguous, leave
   it — an orphaned empty note costs nothing, a deleted real one is gone.

4. **Deletion is soft by default.** `DELETE /api/notes/:id` sets `deleted_at`.
   Permanent removal requires `?permanent=1` *and* only succeeds on rows that are
   already in the trash. Do not add code paths that bypass this, and do not run
   raw `DELETE FROM notes` against the database.

5. **Prefer read-only verification.** Most behaviour can be checked with
   `SELECT`, an API response body, or a status code. Reach for a destructive
   call only when the deletion path itself is what's under test — and then only
   against a row created moments earlier for that purpose.

6. **Schema changes must be additive.** New columns nullable, new kinds added to
   enums. Never drop or rename a column holding user content; `drizzle-kit push`
   will happily execute a destructive diff.

## Tests

`npm test` is safe to run at any time and **never opens a database connection**.
It covers the date and week arithmetic, the timer's totals, and — importantly —
the SQL that the destructive note paths generate, rendered with Drizzle's
`toSQL()` rather than executed. Removing a guard from `purgeWhere`,
`softDeleteWhere` or `structuralUpdateWhere` fails the suite.

`npm run test:db` is opt-in and does talk to the real Neon database. It touches
`work_sessions` only, destroys only rows it inserted itself and holds the ids
of, and refuses to start if a stopwatch is running. Never point a test at
`notes`; assert on generated SQL instead.

Keep the destructive `where` clauses in `lib/notes.ts` rather than inline in a
route — one expression, one test, no second copy to drift.

## Conventions

- Notes are plain markdown text in `content`. Never migrate to a structured
  document model — portability is the point.
- `scratch` is a singleton (`SINGLETON_KINDS` in `db/schema.ts`), with a partial
  unique index on `kind`, and it lives on the dashboard at `/`. Only its
  `content` is mutable: renaming, pinning, moving or deleting it is rejected,
  because the dashboard would then lazily create a fresh empty row and strand
  the writing behind it. It is excluded from the sidebar list and from `/n/:id`.
- `title` is optional; when null the title derives from the first line with
  words on it, markdown stripped (`plainLine` in `lib/format.ts`).
- The layout sends every listable note *with its full text* to the browser
  (tens of KB). `AppShell` holds them; opening a note is `history.pushState`
  plus a lookup, never a server render — that round trip was the app's main
  lag. `/n/[id]/page.tsx` renders nothing; `NoteView` draws the note. The
  route's own page stays mounted (hidden) while a note is open, because
  remounting the dashboard would rebuild the scratchpad from stale cached text.
  A refresh never overwrites a note's text while it has unsaved keystrokes or
  a newer `updatedAt` than the server sent (`merge` in `AppShell`).
- Editor rendering is Bear-style (`editor/livePreview.ts`): block markers —
  headings, bullets, task boxes, quotes — are always drawn and atomic, never
  revealed by the cursor, so text doesn't jump; Backspace right after one
  deletes it whole (`deleteMarkerBackward`). Inline marks reveal only when
  the cursor touches that element. `markdown()` is created with
  `addKeymap: false` so these keys aren't pre-empted.
- `==highlight==` and `#tags` are parsed by `editor/syntax.ts`; tags have no
  table — they're read out of the text (`lib/tags.ts`).
- Folders (`folders` table, `notes.folder_id`) are for saved notes only and
  nest to any depth. Deleting a folder moves its notes and subfolders up to
  its parent first (`lib/folders.ts`, tested in `notes-guards.test.ts`), and
  both foreign keys are `on delete set null` as a backstop: no folder
  operation may ever delete a note. Moves are refused if they'd put a folder
  inside itself (`canMoveFolder` in `lib/folder-tree.ts`, checked on both ends).
- The journal is its own section and files itself: year → month → one entry
  per day, derived from `journal_date` by `groupJournal` (`lib/journal.ts`).
  Those year and month folders are never stored — don't add rows for them.
  Journal entries never carry a `folder_id`; `fileIntoFolderWhere` refuses it.
- Images live in the `images` table (base64 text) and notes refer to them as
  `![](/api/images/<id>)`, served behind the same sign-in. Uploads are shrunk
  in the browser (`editor/images.ts`) and the server accepts only PNG, JPEG,
  GIF and WebP by their magic bytes (`sniffImageType`) — never SVG. There is
  no delete path for images, on purpose: editing a note must never be able
  to destroy a file. Don't add one without a soft-delete like notes have.
- Backups are format 4: `notes.json` includes folders and images, images are
  also written to `images/` as files, and the `markdown/` copies mirror the
  folder tree with image links pointed at those files. `/api/export` lists
  images without their bytes (`imagesIncluded: false`) — Vercel caps a
  response at 4.5 MB.
- Dates that represent a *day* (journal entries) are computed in the browser.
  The server runs in UTC and would misfile anything written late in the evening.
- Client components render dates only after mount, via `ClientDate`, for the
  same reason. The dashboard's timer is the one exception: the browser leaves
  its timezone in the `np_tz` cookie so the server can render the right week
  into the HTML, and the client re-fetches only when the week it computes
  disagrees with the one it was handed. Treat the cookie as a hint that may be
  stale, never as the source of truth.
- Working hours live in `work_sessions`, one row per block, each carrying the
  browser-local day it counts toward. The week's total is a `SUM` over the seven
  days of whichever week the browser says it is — there is no counter and
  nothing resets on Sunday, so a reset that fails to run can't lose a week.
  Because of that, past weeks are just a different `from`/`to` on the same
  query, which is what the log's back/forward paging is. The bar's total is
  always the current week and is fetched separately, so paging through history
  never changes the number on screen.
- The Neon HTTP driver bills a network round trip per statement, so reads are
  written as one query where they can be: `getWeek` returns the week *and* the
  running session, and the cap's corrective `UPDATE` only runs when the row it
  would fix is already in hand. Adding a convenience `select` to a hot path is
  not free.
- A running stopwatch is a row with a null `ended_at`, and at most one exists at
  a time (`work_sessions_one_running`). Elapsed time is the browser subtracting
  `started_at` from now, never a number held in the page — reloading or opening
  another device shows the same session still running.
- The stopwatch reads the whole *day's* total, not the open session's. Pausing
  leaves the number where it is and Start picks up from there; it returns to
  zero only when the day turns over, because the day it counts for is derived
  each tick rather than reset by anything.
- A session left open past `MAX_SESSION_SECONDS` is closed *at* the cap on the
  next read and flagged `auto_stopped`. Keep `ended_at - started_at` equal to
  `duration_seconds` on every closed row; the sum trusts the integer and the log
  displays the timestamps.
- Totals are shown to the minute, so nothing above `Stopwatch` re-renders once a
  second. `Stopwatch` owns the only per-second interval on the page and renders
  a single `<span>`; keep live seconds out of `WorkTimer` state or the whole
  log panel starts re-rendering sixty times a minute for the same strings.
- Everything the browser and the server both need lives in `lib/work-rules.ts`,
  which imports neither the database nor React. That is what makes the totals
  testable, and it is why `lib/work.ts` is `server-only` but the rules are not.
