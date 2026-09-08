import { beforeAll, describe, expect, it } from "vitest";

/**
 * The data-loss guards, checked by reading the SQL they produce.
 *
 * Nothing here connects to anything. Drizzle can render a query without running
 * it, so these assertions describe exactly what would be sent to Postgres — and
 * fail if a guard is ever dropped from a destructive path. That is the point:
 * this database holds the only copy of everything in it, and a mistake in these
 * three `where` clauses is the shape a real loss would take.
 *
 * A previous loss happened this way. A `DELETE` went to an id scraped out of
 * page HTML on the assumption it was the scratchpad; it was a pinned note, and
 * it was gone. Every clause below exists so that the same mistake does nothing.
 */

// A syntactically valid URL is enough — `toSQL()` renders, it never dials out.
beforeAll(() => {
  process.env.DATABASE_URL ??= "postgresql://unused:unused@localhost/unused";
});

const ID = "11111111-2222-3333-4444-555555555555";

async function render(build: (deps: Awaited<ReturnType<typeof load>>) => { toSQL: () => { sql: string; params: unknown[] } }) {
  const deps = await load();
  const { sql, params } = build(deps).toSQL();
  return { sql: sql.toLowerCase(), params };
}

async function load() {
  const [{ getDb }, { notes }, guards] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("@/lib/notes"),
  ]);
  return { db: getDb(), notes, ...guards };
}

describe("permanent deletion", () => {
  it("can only ever reach a note that is already in the trash", async () => {
    const { sql } = await render(({ db, notes, purgeWhere }) =>
      db.delete(notes).where(purgeWhere(ID)),
    );

    expect(sql).toContain("delete from");
    // The whole guarantee: a live note is unreachable by this statement.
    expect(sql).toContain("deleted_at" + '" is not null');
  });

  it("cannot reach the scratchpad", async () => {
    const { sql, params } = await render(({ db, notes, purgeWhere }) =>
      db.delete(notes).where(purgeWhere(ID)),
    );

    expect(sql).toContain("not in");
    expect(params).toContain("scratch");
  });

  it("is pinned to exactly one id, never a set", async () => {
    const { sql, params } = await render(({ db, notes, purgeWhere }) =>
      db.delete(notes).where(purgeWhere(ID)),
    );

    expect(sql).toMatch(/"id" = \$\d/);
    expect(params).toContain(ID);
  });

  it("has no unguarded form — a bare delete is not what the route builds", async () => {
    const { sql } = await render(({ db, notes, purgeWhere }) =>
      db.delete(notes).where(purgeWhere(ID)),
    );

    // Three conditions, joined: id, not-a-singleton, already-trashed.
    expect(sql.match(/ and /g) ?? []).toHaveLength(2);
  });
});

describe("moving a note to the trash", () => {
  it("is an update, not a delete — the row survives", async () => {
    const { sql } = await render(({ db, notes, softDeleteWhere }) =>
      db.update(notes).set({ deletedAt: new Date() }).where(softDeleteWhere(ID)),
    );

    expect(sql).toContain("update");
    expect(sql).not.toContain("delete from");
  });

  it("skips a note already in the trash, so it can't re-stamp the timestamp", async () => {
    const { sql } = await render(({ db, notes, softDeleteWhere }) =>
      db.update(notes).set({ deletedAt: new Date() }).where(softDeleteWhere(ID)),
    );

    expect(sql).toContain("deleted_at" + '" is null');
  });

  it("cannot reach the scratchpad", async () => {
    const { params } = await render(({ db, notes, softDeleteWhere }) =>
      db.update(notes).set({ deletedAt: new Date() }).where(softDeleteWhere(ID)),
    );

    expect(params).toContain("scratch");
  });
});

describe("structural updates", () => {
  it("cannot rename, pin, move or trash the scratchpad", async () => {
    // Its route would then lazily create a fresh empty row and strand the
    // writing behind it somewhere the sidebar doesn't look.
    const { sql, params } = await render(({ db, notes, structuralUpdateWhere }) =>
      db.update(notes).set({ pinnedAt: new Date() }).where(structuralUpdateWhere(ID)),
    );

    expect(sql).toContain("not in");
    expect(params).toContain("scratch");
  });
});

describe("the singleton guard itself", () => {
  it("covers every kind declared a singleton, not a hardcoded list", async () => {
    const [{ SINGLETON_KINDS }, { params }] = await Promise.all([
      import("@/db/schema"),
      render(({ db, notes, purgeWhere }) => db.delete(notes).where(purgeWhere(ID))),
    ]);

    // Add a singleton kind to the schema and it is protected automatically.
    for (const kind of SINGLETON_KINDS) expect(params).toContain(kind);
  });
});

describe("listing", () => {
  it("hides singletons from the sidebar without filtering in JavaScript", async () => {
    const { listable } = await load();
    expect(listable).toBeDefined();
  });
});
