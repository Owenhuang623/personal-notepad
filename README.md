# personal-notepad

A single-user notepad on the web. One persistent scratchpad that autosaves as you
type, plus saved copies of it when a thought is worth keeping.

Next.js (App Router) · Postgres via Neon + Drizzle · Tailwind · deployed on Vercel.

## How it works

- **`/`** — the scratchpad. Always there, autosaves ~600ms after you stop typing,
  survives across devices. **Save a copy** (`⌘S`) snapshots the current text into a
  new saved note without disturbing what you're writing. **Clear** wipes it.
- **`/n/<id>`** — a saved note. Same editor, same autosave, plus delete.
- The sidebar pins the scratchpad at the top and lists saved notes newest-first.
  Titles are just each note's first non-empty line — there's no title field to maintain.
- Unsaved keystrokes are mirrored to `localStorage` and replayed on next load, so a
  dropped connection or a closed tab doesn't lose anything.

## Setup

### 1. Database

Create a Neon Postgres database — either from the **Storage** tab of your Vercel
project (easiest, it wires up the env var for you) or at [neon.tech](https://neon.tech).

### 2. Local env

```sh
cp .env.example .env.local
openssl rand -base64 32   # paste into AUTH_SECRET
```

Fill in `DATABASE_URL` (Neon), `NOTEPAD_PASSWORD` (whatever you want to type to get
in), and `AUTH_SECRET`.

### 3. Create the table

```sh
npm run db:push
```

### 4. Run

```sh
npm install
npm run dev
```

## Deploy

Push to GitHub, import the repo on Vercel, and set the same three variables under
**Settings → Environment Variables**. Vercel builds and deploys on every push.

Changing `AUTH_SECRET` later invalidates every signed-in device — that's the
"sign out everywhere" button.

## Auth

One password in an env var, exchanged for an HMAC-signed cookie that lasts 180 days.
No user table, no third-party auth service. `src/proxy.ts` gates every route except
`/login` and `/api/auth`; wrong-password attempts get a fixed delay to blunt guessing.

## Scripts

| | |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run db:push` | Sync `src/db/schema.ts` to the database |
| `npm run db:studio` | Browse the data |
