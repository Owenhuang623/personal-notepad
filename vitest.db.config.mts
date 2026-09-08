import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The opt-in suite: exercises the real route handlers against the real Neon
 * database, because there is only one of those.
 *
 * It confines itself to `work_sessions`, and within that to rows it inserted
 * itself and holds the ids of. It issues no statement against `notes` at all —
 * the note-deletion guards are covered by reading the SQL, not running it.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // See test/server-only.stub.ts — the real package refuses to load outside
    // a server bundle, and Vitest is not one.
    alias: { "server-only": fileURLToPath(new URL("./test/server-only.stub.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    // One table, shared: letting files race would make the counts lie.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
