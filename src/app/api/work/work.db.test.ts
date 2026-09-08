import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The timer, end to end, against the real database — because there is only one.
 *
 * Rules this file keeps, and the reason `npm test` does not run it:
 *
 *  - It touches `work_sessions` and nothing else. There is no statement here
 *    against `notes`, and the note guards are covered by reading SQL instead.
 *  - Every row it destroys is one it inserted itself moments earlier, and whose
 *    id it captured from the insert. It never deletes by a query, a date range,
 *    or "the first match".
 *  - It refuses to run at all if a stopwatch is already going, because pausing
 *    one it did not start would corrupt a real day's total.
 *
 * Run with: npm run test:db
 */

import { getDb } from "@/db";
import { workSessions } from "@/db/schema";
import { MAX_SESSION_SECONDS } from "@/lib/work-rules";

import { GET, POST } from "./route";
import { DELETE, PATCH } from "./[id]/route";
import { POST as TIMER } from "./timer/route";

const DAY = "2015-06-14"; // A Sunday, years before this app existed.
const WEEK_END = "2015-06-20";

/** Every row this file creates, so cleanup can name them one by one. */
const created = new Set<string>();

function req(body?: unknown, url = "http://test/api/work") {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function addBlock(seconds: number, date = DAY) {
  const response = await POST(req({ date, seconds }));
  const { session } = await json<{ session: { id: string } }>(response);
  created.add(session.id);
  return session as { id: string; durationSeconds: number; localDate: string };
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const running = await getDb().select().from(workSessions).where(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (await import("drizzle-orm")).isNull(workSessions.endedAt),
  );

  if (running.length > 0) {
    throw new Error(
      "A stopwatch is currently running. Pause it before running the database tests — " +
        "these tests start and stop the timer and would otherwise close your real session.",
    );
  }
});

afterAll(async () => {
  // Only the ids gathered above, one statement each. Nothing is matched by
  // date, kind or recency, so a bug here cannot widen into someone's real week.
  const { eq } = await import("drizzle-orm");
  for (const id of created) {
    await getDb().delete(workSessions).where(eq(workSessions.id, id));
  }

  const leftovers = await getDb()
    .select({ id: workSessions.id })
    .from(workSessions)
    .where((await import("drizzle-orm")).eq(workSessions.localDate, DAY));

  expect(leftovers, "the test day must be empty again").toHaveLength(0);
});

describe("recording a block by hand", () => {
  it("stores the duration it was given", async () => {
    const session = await addBlock(5400);
    expect(session.durationSeconds).toBe(5400);
    expect(session.localDate).toBe(DAY);
  });

  it("keeps ended_at - started_at equal to the duration", async () => {
    const session = await addBlock(3600);
    const [row] = await getDb()
      .select()
      .from(workSessions)
      .where((await import("drizzle-orm")).eq(workSessions.id, session.id));

    const span = (row.endedAt!.getTime() - row.startedAt.getTime()) / 1000;
    expect(span).toBe(row.durationSeconds);
  });

  it("rejects a block with no length", async () => {
    expect((await POST(req({ date: DAY, seconds: 0 }))).status).toBe(400);
    expect((await POST(req({ date: DAY, seconds: -60 }))).status).toBe(400);
  });

  it("rejects a block longer than a day", async () => {
    expect((await POST(req({ date: DAY, seconds: 86_401 }))).status).toBe(400);
  });

  it("rejects a malformed date rather than guessing one", async () => {
    expect((await POST(req({ date: "14/06/2015", seconds: 60 }))).status).toBe(400);
    expect((await POST(req({ seconds: 60 }))).status).toBe(400);
  });
});

describe("the week query", () => {
  it("returns only the days asked for", async () => {
    await addBlock(1800);

    const response = await GET(req(undefined, `http://test/api/work?from=${DAY}&to=${WEEK_END}`));
    const { sessions } = await json<{ sessions: { localDate: string }[] }>(response);

    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.localDate >= DAY && s.localDate <= WEEK_END)).toBe(true);
  });

  it("excludes a neighbouring week", async () => {
    const response = await GET(req(undefined, "http://test/api/work?from=2015-06-21&to=2015-06-27"));
    const { sessions } = await json<{ sessions: unknown[] }>(response);
    expect(sessions).toHaveLength(0);
  });

  it("refuses a malformed range", async () => {
    expect((await GET(req(undefined, "http://test/api/work?from=nope&to=nope"))).status).toBe(400);
  });
});

describe("the stopwatch", () => {
  it("starts, reports itself running, and stops with a recorded length", async () => {
    const started = await json<{ running: { id: string; endedAt: string | null } }>(
      await TIMER(req({ action: "start", date: DAY })),
    );
    created.add(started.running.id);
    expect(started.running.endedAt).toBeNull();

    const stopped = await json<{ session: { id: string; durationSeconds: number; endedAt: string } }>(
      await TIMER(req({ action: "stop" })),
    );

    expect(stopped.session.id).toBe(started.running.id);
    expect(stopped.session.endedAt).not.toBeNull();
    expect(stopped.session.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(stopped.session.durationSeconds).toBeLessThanOrEqual(MAX_SESSION_SECONDS);
  });

  it("allows only one running session — a second start returns the first", async () => {
    const first = await json<{ running: { id: string } }>(
      await TIMER(req({ action: "start", date: DAY })),
    );
    created.add(first.running.id);

    const second = await json<{ running: { id: string } }>(
      await TIMER(req({ action: "start", date: DAY })),
    );

    expect(second.running.id).toBe(first.running.id);

    const open = await getDb()
      .select()
      .from(workSessions)
      .where((await import("drizzle-orm")).isNull(workSessions.endedAt));
    expect(open).toHaveLength(1);

    await TIMER(req({ action: "stop" }));
  });

  it("refuses to stop when nothing is running", async () => {
    expect((await TIMER(req({ action: "stop" }))).status).toBe(409);
  });

  it("rejects an unknown action", async () => {
    expect((await TIMER(req({ action: "reset" }))).status).toBe(400);
  });
});

describe("correcting a block", () => {
  it("changes the length and keeps the timestamps consistent with it", async () => {
    const session = await addBlock(3600);

    const response = await PATCH(req({ seconds: 1800 }), { params: Promise.resolve({ id: session.id }) });
    const { session: updated } = await json<{ session: { durationSeconds: number; startedAt: string; endedAt: string } }>(response);

    expect(updated.durationSeconds).toBe(1800);
    expect((Date.parse(updated.endedAt) - Date.parse(updated.startedAt)) / 1000).toBe(1800);
  });

  it("will not edit the running block — there is no length to correct yet", async () => {
    const started = await json<{ running: { id: string } }>(
      await TIMER(req({ action: "start", date: DAY })),
    );
    created.add(started.running.id);

    const response = await PATCH(req({ seconds: 60 }), { params: Promise.resolve({ id: started.running.id }) });
    expect(response.status).toBe(404);

    await TIMER(req({ action: "stop" }));
  });

  it("rejects an impossible length", async () => {
    const session = await addBlock(600);
    const response = await PATCH(req({ seconds: 999_999 }), { params: Promise.resolve({ id: session.id }) });
    expect(response.status).toBe(400);
  });
});

describe("removing a block", () => {
  it("removes the one named and reports a miss for anything else", async () => {
    const session = await addBlock(900);

    const gone = await DELETE(req(), { params: Promise.resolve({ id: session.id }) });
    expect(gone.status).toBe(200);
    created.delete(session.id);

    const again = await DELETE(req(), { params: Promise.resolve({ id: session.id }) });
    expect(again.status).toBe(404);

    const missing = await DELETE(req(), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(missing.status).toBe(404);
  });
});
