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

## Conventions

- Notes are plain markdown text in `content`. Never migrate to a structured
  document model — portability is the point.
- `scratch` and `goals` are singletons (`SINGLETON_KINDS` in `db/schema.ts`),
  each with a partial unique index on `kind` and its own route. Only their
  `content` is mutable: renaming, pinning, moving or deleting one is rejected,
  because its route would then lazily create a fresh empty row and strand the
  writing behind it. They are excluded from the sidebar list and from `/n/:id`.
- `title` is optional; when null the title derives from the first non-empty line.
- Dates that represent a *day* (journal entries) are computed in the browser.
  The server runs in UTC and would misfile anything written late in the evening.
- Client components render dates only after mount, via `ClientDate`, for the
  same reason.
