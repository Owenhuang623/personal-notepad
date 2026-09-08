import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * `npm test` never touches the database.
 *
 * The default suite is pure logic plus the SQL that the destructive paths
 * generate — no connection is ever opened, so running the tests cannot cost a
 * note. The few tests that do talk to Neon live in `*.db.test.ts` and are only
 * collected by `npm run test:db`, which asks for them explicitly.
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
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.db.test.ts", "node_modules/**"],
  },
});
