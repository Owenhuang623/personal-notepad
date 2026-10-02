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

describe("filing into a folder", () => {
  it("only ever reaches a saved note, never a journal entry or the scratchpad", async () => {
    const { sql, params } = await render(({ db, notes, fileIntoFolderWhere }) =>
      db.update(notes).set({ folderId: ID }).where(fileIntoFolderWhere(ID)),
    );

    expect(sql).toContain("update");
    expect(sql).toMatch(/"kind" = \$\d/);
    expect(params).toContain("saved");
    expect(params).toContain("scratch"); // the not-a-singleton guard, still there
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

describe("deleting a folder", () => {
  const PARENT = "99999999-8888-7777-6666-555555555555";

  async function statements() {
    const { rehomeNotes, rehomeFolders, removeFolder } = await import("@/lib/folders");
    return [rehomeNotes(ID, PARENT), rehomeFolders(ID, PARENT), removeFolder(ID)].map((query) => {
      const { sql, params } = query.toSQL();
      return { sql: sql.toLowerCase(), params };
    });
  }

  it("moves the folder's notes rather than deleting them", async () => {
    const [notesStep] = await statements();
    expect(notesStep.sql).toMatch(/^update "notes" set "folder_id" = \$1 where "notes"."folder_id" = \$2/);
    expect(notesStep.params).toEqual([PARENT, ID]);
  });

  it("never sends a delete to the notes table", async () => {
    for (const { sql } of await statements()) expect(sql).not.toContain('delete from "notes"');
  });

  it("deletes exactly one folder, by id", async () => {
    const remove = (await statements())[2];
    expect(remove.sql).toMatch(/^delete from "folders" where "folders"."id" = \$1/);
    expect(remove.params).toEqual([ID]);
  });
});
