/**
 * The journal's folders, derived rather than stored.
 *
 * Every entry carries the local day it belongs to (`journal_date`), so its
 * year and month are already known — keeping folders for them in the database
 * would only be a second copy of the date that could disagree with the first.
 * The sidebar groups by the date itself, so an entry can't be misfiled and a
 * month folder can't be renamed out from under it.
 */

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type JournalMonth<T> = { key: string; month: number; name: string; entries: T[] };
export type JournalYear<T> = { year: number; months: JournalMonth<T>[]; count: number };

/** Entries grouped into years and months, newest first at every level. */
export function groupJournal<T extends { journalDate: string | null }>(entries: T[]): JournalYear<T>[] {
  const dated = entries
    .filter((entry): entry is T & { journalDate: string } => /^\d{4}-\d{2}-\d{2}$/.test(entry.journalDate ?? ""))
    .sort((a, b) => b.journalDate.localeCompare(a.journalDate));

  const years: JournalYear<T>[] = [];
  for (const entry of dated) {
    const year = Number(entry.journalDate.slice(0, 4));
    const month = Number(entry.journalDate.slice(5, 7));

    let bucket = years.at(-1);
    if (bucket?.year !== year) years.push((bucket = { year, months: [], count: 0 }));

    let monthBucket = bucket.months.at(-1);
    if (monthBucket?.month !== month) {
      monthBucket = { key: entry.journalDate.slice(0, 7), month, name: MONTH_NAMES[month - 1], entries: [] };
      bucket.months.push(monthBucket);
    }

    monthBucket.entries.push(entry);
    bucket.count++;
  }
  return years;
}
