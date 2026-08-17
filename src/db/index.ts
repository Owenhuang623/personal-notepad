import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

let instance: Database | undefined;

/**
 * Connected lazily so that importing a route or page never requires the env
 * var — only actually running a query does. Keeps `next build` working without
 * a database reachable.
 */
export function getDb(): Database {
  if (instance) return instance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }

  instance = drizzle(neon(url), { schema });
  return instance;
}
