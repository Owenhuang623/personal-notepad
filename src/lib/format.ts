/** A note's title is just its first non-empty line. No separate title field to keep in sync. */
export function deriveTitle(content: string): string {
  const line = content
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);

  if (!line) return "Untitled";
  return line.length > 64 ? `${line.slice(0, 64).trimEnd()}…` : line;
}

/** The line under the title in the sidebar — the start of the body, minus the title line. */
export function deriveSnippet(content: string): string {
  const lines = content.split("\n").map((l) => l.trim());
  const titleIndex = lines.findIndex(Boolean);
  if (titleIndex === -1) return "";

  const rest = lines
    .slice(titleIndex + 1)
    .filter(Boolean)
    .join(" ");

  return rest.length > 80 ? `${rest.slice(0, 80).trimEnd()}…` : rest;
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
