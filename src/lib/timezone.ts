/**
 * The viewer's timezone, remembered in a cookie.
 *
 * The server runs in UTC and cannot know which day — let alone which week — it
 * is where the writing happens. Everywhere else in this app that is solved by
 * deferring to the browser, which is correct but costs a round trip: the page
 * paints, hydrates, asks for the week, and only then can show a number.
 *
 * So the browser tells the server once, in a cookie, and the server can render
 * the right week into the HTML from then on. The cookie is a hint and nothing
 * more — the client checks the week it was given against the week it computes
 * itself and re-fetches if they disagree, which is what happens on the first
 * ever visit and after a flight.
 */

export const TIMEZONE_COOKIE = "np_tz";

/** A year: this changes when the writer moves, not on a schedule. */
export const TIMEZONE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Today's date key in `timeZone`, or null if the zone isn't one.
 *
 * `en-CA` formats as YYYY-MM-DD, which is the shape every date key in this app
 * already has. Going through Intl rather than an offset means DST is handled by
 * the same tables the browser used.
 */
export function dateKeyIn(timeZone: string, at: Date = new Date()): string | null {
  // A bad cookie must degrade to "ask the client", never throw a page.
  if (!/^[A-Za-z0-9_+\-/]{1,64}$/.test(timeZone)) return null;

  try {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);

    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
  } catch {
    return null;
  }
}
