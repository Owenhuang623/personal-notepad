/** A note's title is just its first non-empty line. No separate title field to keep in sync. */
export function deriveTitle(content: string): string {
  const line = content
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);

  if (!line) return "Untitled";
  return line.length > 64 ? `${line.slice(0, 64).trimEnd()}…` : line;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Compact, for the sidebar: "Aug 17", or "Aug 17, 2025" once the year differs. */
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** The dateline above a note: "Monday, August 17, 2026". */
export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** YYYY-MM-DD in the viewer's own timezone — never derive this on the server. */
export function localDateKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parsed as local midnight; `new Date("2026-08-23")` would be read as UTC. */
function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * A journal entry's name: "Aug 23", or "Aug 23, 2025" once the year differs.
 *
 * Deliberately absolute rather than "Today"/"Yesterday" — a title that changes
 * overnight isn't a title, and these are what the entries are called.
 *
 * Formatted by hand rather than through toLocaleDateString because this renders
 * during SSR: Node and the browser resolve the default locale differently, so
 * the server would emit one string and hydration would replace it with another.
 */
export function journalLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const suffix = year === new Date().getFullYear() ? "" : `, ${year}`;
  return `${MONTHS[month - 1]} ${day}${suffix}`;
}

/** The dateline above a journal entry: "Wednesday, August 21, 2026". */
export function journalLongLabel(key: string): string {
  return fromDateKey(key).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;

  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(then).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/**
 * The Sunday that starts the week `key` falls in.
 *
 * Computed from a local date key rather than a timestamp, so the boundary is
 * local midnight on Sunday wherever the writer is — the same reason journal
 * entries carry a day rather than an instant.
 */
export function startOfWeekKey(key: string): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() - date.getDay());
  return localDateKey(date);
}

/** Walks a date key by whole days. Goes through Date so months and DST work out. */
export function shiftDateKey(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sun". Hand-formatted for the same SSR reason as `journalLabel`. */
export function weekdayLabel(key: string): string {
  return WEEKDAYS[fromDateKey(key).getDay()];
}

/**
 * A length of time as you'd say it: "12h 40m", "40m", "0m".
 *
 * Rounds down to the minute — a total that ticks its last digit every second is
 * a number you watch rather than read, and the week's total is meant to be read.
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** The running clock: "00:42:15". Seconds always shown — that's the point of it. */
export function formatStopwatch(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

/** "9:02 AM" — when a stopwatch session started or stopped. */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
