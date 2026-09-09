import { cookies } from "next/headers";

import { Editor } from "@/components/Editor";
import { WorkTimer } from "@/components/WorkTimer";
import { shiftDateKey, startOfWeekKey } from "@/lib/format";
import { getScratchNote } from "@/lib/notes";
import { dateKeyIn, TIMEZONE_COOKIE } from "@/lib/timezone";
import { getWeek } from "@/lib/work";

export const dynamic = "force-dynamic";

/**
 * The dashboard: this week's working hours across the top, the scratchpad
 * underneath.
 *
 * The scratchpad keeps the whole page below the bar rather than being demoted
 * to a card — it is still what this app is for, and the timer is a strip you
 * glance at, not a thing to look at.
 *
 * Both halves are fetched together: the timer's week used to be requested by
 * the browser after hydration, which left the total reading "—" for a quarter
 * of a second on every single load. With the timezone hint it is in the HTML.
 */
export default async function DashboardPage() {
  const [note, initialWeek] = await Promise.all([getScratchNote(), readWeekForCookie()]);

  return (
    <>
      <WorkTimer initialWeek={initialWeek} />
      <Editor
        key={note.id}
        noteId={note.id}
        kind="scratch"
        initialContent={note.content}
        initialPinned={note.pinnedAt !== null}
        title={note.title}
        journalDate={note.journalDate}
      />
    </>
  );
}

/**
 * The current week according to the timezone the browser last reported, or null
 * if it hasn't reported one yet — in which case the client asks for it, exactly
 * as it did before.
 */
async function readWeekForCookie() {
  const timeZone = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  if (!timeZone) return null;

  const today = dateKeyIn(timeZone);
  if (!today) return null;

  const weekStart = startOfWeekKey(today);
  const { sessions, running } = await getWeek(weekStart, shiftDateKey(weekStart, 6));

  return { weekStart, sessions, running };
}
