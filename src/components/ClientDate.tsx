"use client";

import { useEffect, useState } from "react";

import {
  formatLongDate,
  formatShortDate,
  journalLabel,
  journalLongLabel,
  relativeTime,
} from "@/lib/format";

const formatters = {
  short: formatShortDate,
  long: formatLongDate,
  relative: relativeTime,
  // These take a YYYY-MM-DD key rather than an ISO timestamp.
  journal: journalLabel,
  journalLong: journalLongLabel,
};

/**
 * Dates render blank on the server and fill in after mount.
 *
 * The server sits in UTC and the browser doesn't, so formatting during SSR
 * would print one date into the HTML and a different one after hydration —
 * an entry written late in the evening would show as the following day.
 */
export function ClientDate({ iso, variant }: { iso: string; variant: keyof typeof formatters }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => setLabel(formatters[variant](iso)), [iso, variant]);

  return <span suppressHydrationWarning>{label ?? " "}</span>;
}
