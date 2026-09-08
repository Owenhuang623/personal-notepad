"use client";

import { useState } from "react";

import {
  formatClockTime,
  formatDuration,
  journalLabel,
  shiftDateKey,
  weekdayLabel,
} from "@/lib/format";
import { MAX_MANUAL_SECONDS, type WorkDay, type WorkSessionView } from "@/lib/work-rules";

import { ConfirmButton } from "./ConfirmButton";

/**
 * The week, day by day, with every block that made up the total.
 *
 * Empty days are listed rather than skipped: a week you can only see the good
 * parts of isn't much of an accountability tool.
 */
export function WorkLog({
  days,
  weekStart,
  weekEnd,
  weekOffset,
  today,
  total,
  busy,
  onWeekOffset,
  onAdd,
  onEdit,
  onRemove,
}: {
  days: WorkDay[];
  weekStart: string;
  weekEnd: string;
  /** Weeks back from the current one; 0 is this week. Never positive. */
  weekOffset: number;
  today: string;
  total: number;
  busy: boolean;
  onWeekOffset: (offset: number) => void;
  onAdd: (date: string, seconds: number) => Promise<void>;
  onEdit: (id: string, seconds: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Editing state belongs to whichever week was on screen when it opened.
  function goToWeek(offset: number) {
    setEditing(null);
    setAdding(false);
    onWeekOffset(offset);
  }

  return (
    <div className="absolute right-2 top-full z-30 mt-1 w-[min(23rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-line bg-panel shadow-lg shadow-black/5">
      <div className="flex items-center gap-0.5 border-b border-line px-2 py-2">
        <StepButton
          direction="back"
          label="Previous week"
          onClick={() => goToWeek(weekOffset - 1)}
        />
        <StepButton
          direction="forward"
          label="Next week"
          // There is nothing to see ahead of the week you are in.
          disabled={weekOffset >= 0}
          onClick={() => goToWeek(weekOffset + 1)}
        />

        <button
          type="button"
          onClick={() => goToWeek(0)}
          disabled={weekOffset === 0}
          title={weekOffset === 0 ? undefined : "Back to this week"}
          className="ml-1 flex min-w-0 items-baseline gap-2 rounded-md px-1.5 py-1 text-left transition-colors enabled:hover:bg-hover disabled:cursor-default"
        >
          <span className="shrink-0 text-[12.5px] font-medium">{weekName(weekOffset)}</span>
          <span className="truncate text-[11.5px] text-ink-faint">
            {journalLabel(weekStart)} – {journalLabel(weekEnd)}
          </span>
        </button>

        <span className="flex-1" />
        <span className="pr-1.5 text-[12.5px] font-medium tabular-nums">{formatDuration(total)}</span>
      </div>

      <div className="max-h-[min(26rem,60vh)] overflow-y-auto px-1.5 py-1.5">
        {days.map((day) => (
          <div key={day.key} className="px-2 py-1">
            <div
              className={`flex items-baseline gap-2 py-0.5 text-[12.5px] ${
                day.key === today ? "text-ink" : "text-ink-muted"
              }`}
            >
              <span className="w-8 shrink-0 font-medium">{weekdayLabel(day.key)}</span>
              <span className="text-[11.5px] text-ink-faint">{journalLabel(day.key)}</span>
              <span className="flex-1" />
              <span className="tabular-nums">
                {day.seconds > 0 ? formatDuration(day.seconds) : <span className="text-ink-faint">—</span>}
              </span>
            </div>

            {day.sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                editing={editing === session.id}
                busy={busy}
                onStartEdit={() => setEditing(session.id)}
                onCancelEdit={() => setEditing(null)}
                onSave={async (seconds) => {
                  await onEdit(session.id, seconds);
                  setEditing(null);
                }}
                onRemove={() => void onRemove(session.id)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-line px-2 py-1.5">
        {adding ? (
          <AddForm
            weekStart={weekStart}
            // Today when it falls in this week, otherwise the week's own Sunday.
            defaultDay={today >= weekStart && today <= weekEnd ? today : weekStart}
            busy={busy}
            onCancel={() => setAdding(false)}
            onSubmit={async (date, seconds) => {
              await onAdd(date, seconds);
              setAdding(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink-muted transition-colors hover:bg-hover hover:text-ink"
          >
            + Add time
          </button>
        )}
      </div>
    </div>
  );
}

/** "This week", "Last week", "5 weeks ago" — how far back you have paged. */
function weekName(offset: number): string {
  if (offset === 0) return "This week";
  if (offset === -1) return "Last week";
  return `${-offset} weeks ago`;
}

function StepButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "back" | "forward";
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md p-1 text-ink-faint transition-colors enabled:hover:bg-hover enabled:hover:text-ink disabled:opacity-30"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
        <path
          d={direction === "back" ? "M9.75 3.5 5.25 8l4.5 4.5" : "M6.25 3.5 10.75 8l-4.5 4.5"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function SessionRow({
  session,
  editing,
  busy,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
}: {
  session: WorkSessionView;
  editing: boolean;
  busy: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (seconds: number) => void;
  onRemove: () => void;
}) {
  if (editing) {
    return (
      <div className="ml-8 py-1">
        <DurationForm
          initialSeconds={session.seconds}
          busy={busy}
          submitLabel="Save"
          onCancel={onCancelEdit}
          onSubmit={onSave}
        />
      </div>
    );
  }

  return (
    <div className="group ml-8 flex items-center gap-2 rounded-md py-[3px] pl-1 pr-0.5 text-[11.5px] text-ink-faint hover:bg-hover">
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate">
        <SessionLabel session={session} />
      </span>

      <span className={`tabular-nums ${session.running ? "text-ink-muted" : ""}`}>
        {formatDuration(session.seconds)}
      </span>

      {/* The running block has no length to correct yet — pause it first. */}
      {!session.running && (
        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={onStartEdit}
            title="Change the length"
            className="rounded px-1.5 py-0.5 transition-colors hover:text-ink"
          >
            Edit
          </button>
          <ConfirmButton
            label="Remove"
            confirmLabel="Sure?"
            onConfirm={onRemove}
            className="!px-1.5 !py-0.5 !text-[11.5px]"
          />
        </span>
      )}
    </div>
  );
}

/**
 * What a block was: clock times for the stopwatch, nothing to invent for one
 * typed in by hand.
 *
 * A capped block gets a badge rather than a sentence — it's the one row here
 * that usually wants correcting, so it has to survive being read at a glance
 * and not get truncated away.
 */
function SessionLabel({ session }: { session: WorkSessionView }) {
  if (session.running) {
    return <span className="truncate">Running since {formatClockTime(session.startedAt)}</span>;
  }

  if (session.source === "manual") return <span className="truncate">Added by hand</span>;

  return (
    <>
      <span className="truncate">
        {formatClockTime(session.startedAt)} – {formatClockTime(session.endedAt!)}
      </span>
      {session.autoStopped && (
        <span className="shrink-0 text-danger" title="Left running past the cap and closed at 8h">
          capped
        </span>
      )}
    </>
  );
}

function AddForm({
  weekStart,
  defaultDay,
  busy,
  onCancel,
  onSubmit,
}: {
  weekStart: string;
  defaultDay: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (date: string, seconds: number) => void;
}) {
  const [date, setDate] = useState(defaultDay);

  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5">
      <select
        value={date}
        onChange={(event) => setDate(event.target.value)}
        aria-label="Day"
        className="rounded-md border border-line bg-canvas px-1.5 py-1 text-[12px] text-ink outline-none focus:border-line-strong"
      >
        {Array.from({ length: 7 }, (_, offset) => shiftDateKey(weekStart, offset)).map((key) => (
          <option key={key} value={key}>
            {weekdayLabel(key)} {journalLabel(key)}
          </option>
        ))}
      </select>

      <DurationForm
        initialSeconds={0}
        busy={busy}
        submitLabel="Add"
        onCancel={onCancel}
        onSubmit={(seconds) => onSubmit(date, seconds)}
      />
    </div>
  );
}

/**
 * Hours and minutes as two boxes rather than one free-text field. Both are
 * plain strings while being typed so a half-deleted "1" doesn't snap to zero
 * under the cursor.
 */
function DurationForm({
  initialSeconds,
  busy,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initialSeconds: number;
  busy: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (seconds: number) => void;
}) {
  const [hours, setHours] = useState(
    initialSeconds ? String(Math.floor(initialSeconds / 3600)) : "",
  );
  const [minutes, setMinutes] = useState(
    initialSeconds ? String(Math.floor(initialSeconds / 60) % 60) : "",
  );

  const seconds = (Number(hours || 0) * 60 + Number(minutes || 0)) * 60;
  const valid = Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_MANUAL_SECONDS;

  function submit() {
    if (valid && !busy) onSubmit(seconds);
  }

  return (
    <div
      className="flex flex-1 items-center gap-1"
      onKeyDown={(event) => {
        if (event.key === "Enter") submit();
        if (event.key === "Escape") onCancel();
      }}
    >
      <NumberBox value={hours} onChange={setHours} label="Hours" suffix="h" autoFocus />
      <NumberBox value={minutes} onChange={setMinutes} label="Minutes" suffix="m" />

      <span className="flex-1" />

      <button
        type="button"
        onClick={submit}
        disabled={!valid || busy}
        className="rounded-md px-2 py-1 text-[12px] text-ink-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
      >
        {submitLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-2 py-1 text-[12px] text-ink-faint transition-colors hover:bg-hover hover:text-ink"
      >
        Cancel
      </button>
    </div>
  );
}

function NumberBox({
  value,
  onChange,
  label,
  suffix,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  suffix: string;
  autoFocus?: boolean;
}) {
  return (
    <span className="flex items-baseline rounded-md border border-line bg-canvas pr-1 focus-within:border-line-strong">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 2))}
        inputMode="numeric"
        placeholder="0"
        aria-label={label}
        autoFocus={autoFocus}
        className="w-6 bg-transparent py-1 pl-1.5 text-right text-[12px] tabular-nums text-ink outline-none placeholder:text-ink-faint"
      />
      <span className="text-[11px] text-ink-faint">{suffix}</span>
    </span>
  );
}
