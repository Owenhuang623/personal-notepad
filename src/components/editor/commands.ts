import { insertNewlineContinueMarkupCommand } from "@codemirror/lang-markdown";
import { EditorSelection, type StateCommand, type Transaction } from "@codemirror/state";
import { type Command } from "@codemirror/view";

const TASK = /^(\s*)([-*+]\s+)\[([ xX])\]/;
const BULLET = /^(\s*)([-*+]\s+)/;

/**
 * Ticks or unticks every line the selection touches, promoting plain lines and
 * bullets into tasks on the way. If anything in range is unchecked the whole
 * range gets checked, which is what you want when sweeping a finished list.
 */
export const toggleTask: Command = (view) => {
  const { state } = view;
  const lines: number[] = [];

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let line = first; line <= last; line++) {
      if (!lines.includes(line)) lines.push(line);
    }
  }

  const targets = lines
    .map((number) => state.doc.line(number))
    .filter((line) => line.text.trim() !== "");

  if (targets.length === 0) return false;

  const shouldCheck = targets.some((line) => {
    const task = TASK.exec(line.text);
    return !task || task[3] === " ";
  });
  const box = shouldCheck ? "x" : " ";

  const changes = targets.map((line) => {
    const task = TASK.exec(line.text);
    if (task) {
      const at = line.from + task[1].length + task[2].length + 1;
      return { from: at, to: at + 1, insert: box };
    }

    const bullet = BULLET.exec(line.text);
    if (bullet) {
      const at = line.from + bullet[0].length;
      return { from: at, to: at, insert: `[${box}] ` };
    }

    const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
    return { from: line.from + indent, to: line.from + indent, insert: `- [${box}] ` };
  });

  view.dispatch({ changes });
  return true;
};

/** A block marker at the start of a line: list item (with or without a task box), heading or quote. */
const BLOCK_MARKER = /^(?:\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|#{1,6}\s+|(?:\s*>\s?)+)/;

/**
 * Backspace at the start of a heading, list item or quote removes the marker
 * whole and leaves a plain line.
 *
 * The markers are drawn as bullets, checkboxes and hanging hashes rather than
 * shown as characters, so the cursor right after one looks like the start of
 * the line. CodeMirror's markdown Backspace would turn "- " into two spaces of
 * continuation indent — invisible here, and it silently shoved every following
 * line over. Deleting the marker is what pressing Backspace there looks like it
 * should do.
 */
export const deleteMarkerBackward: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length > 1) return false;

  const line = state.doc.lineAt(range.head);
  const marker = BLOCK_MARKER.exec(line.text);
  if (!marker || range.head !== line.from + marker[0].length) return false;

  view.dispatch({
    changes: { from: line.from, to: range.head },
    selection: { anchor: line.from },
    userEvent: "delete.backward",
  });
  return true;
};

/**
 * Enter on an empty quote line ends the quote, the way Enter on an empty list
 * item ends the list. Otherwise there is no visible way out of a blockquote.
 */
export const exitEmptyQuote: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length > 1) return false;

  const line = state.doc.lineAt(range.head);
  if (!/^\s*>\s*$/.test(line.text)) return false;

  view.dispatch({
    changes: { from: line.from, to: line.to },
    selection: { anchor: line.from },
    userEvent: "delete",
  });
  return true;
};

const continueMarkup = insertNewlineContinueMarkupCommand({ nonTightLists: false });

/** A newline, then a line holding nothing but quote marks or spaces, then a newline. */
const LOOSE_GAP = /^(\r?\n)[ \t>]*\r?\n/;

/**
 * Enter in a list continues it on the very next line — always one line down.
 *
 * CodeMirror's markdown Enter mirrors the list's spacing: if the first two
 * items have a blank line between them (a "loose" list, in markdown's terms),
 * every new item gets a blank line too. Notes here are full of bullets broken
 * into groups by a blank line, which made Enter drop two lines in exactly the
 * lists that are used most. So this runs CodeMirror's command and strips the
 * blank line out of what it would insert. Blank lines already in the note are
 * left exactly as they are.
 */
export const continueListTight: StateCommand = ({ state, dispatch }) => {
  let produced: Transaction | null = null;
  if (!continueMarkup({ state, dispatch: (tr) => (produced = tr) })) return false;
  const tr = produced as Transaction | null;
  if (!tr) return true;

  const changes: { from: number; to: number; insert: string }[] = [];
  let removed = 0;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const text = inserted.toString();
    const tight = text.replace(LOOSE_GAP, "$1");
    removed += text.length - tight.length;
    changes.push({ from: fromA, to: toA, insert: tight });
  });

  // Nothing to tighten, or several cursors at once: keep CodeMirror's version.
  if (removed === 0 || tr.selection === undefined || tr.selection.ranges.length > 1) {
    dispatch(tr);
    return true;
  }

  dispatch(
    state.update({
      changes,
      selection: EditorSelection.cursor(tr.selection.main.head - removed),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

const BULLET_ONLY = /^\s*[-+*]$/;
const NUMBER_ONLY = /^\s*\d{1,9}[.)]$/;
const TASK_ONLY = /^\s*[-+*] \[[ xX]\]$/;
const HEADING_ONLY = /^ {0,3}#{2,6}$/;

/**
 * Whether typing `typed` right after `before` (the line so far) should first
 * put a space in, so "-t" becomes "- t" and the line turns into a list item.
 *
 * Markdown needs that space, and the stored text stays standard markdown — the
 * editor supplies the space rather than the parser learning to do without it.
 * Deliberately narrow, so ordinary writing never sprouts bullets:
 *   - bullets (-, +, *) react to a letter, or `[` to start a checkbox — not to
 *     digits or punctuation, so "-5°", "--", "---" and "**bold**" are left be;
 *   - numbers (1. or 1)) react only to a letter, so "1.5" stays a decimal;
 *   - a checkbox, "- [ ]", reacts to a letter or digit;
 *   - a heading reacts to a letter or digit, but only from "##" up: "#word"
 *     is a tag, so a level-one heading still needs its space typed.
 */
export function needsMarkerSpace(before: string, typed: string): boolean {
  if (typed.length !== 1 && [...typed].length !== 1) return false;
  if (BULLET_ONLY.test(before)) return /^[\p{L}[]$/u.test(typed);
  if (NUMBER_ONLY.test(before)) return /^\p{L}$/u.test(typed);
  if (TASK_ONLY.test(before)) return /^[\p{L}\p{N}]$/u.test(typed);
  if (HEADING_ONLY.test(before)) return /^[\p{L}\p{N}]$/u.test(typed);
  return false;
}

export type ListStyle = "bullet" | "task" | "ordered";

/** Indent, then a bullet (optionally with a checkbox) or a number — whatever list marker a line has. */
const LIST_PREFIX = /^(\s*)(?:([-+*])\s+(?:\[([ xX])\]\s+)?|\d{1,9}[.)]\s+)/;

function listPrefix(text: string): { style: ListStyle | null; indent: number; end: number; checked: boolean } {
  const match = LIST_PREFIX.exec(text);
  if (!match) {
    const indent = /^\s*/.exec(text)![0].length;
    return { style: null, indent, end: indent, checked: false };
  }
  const style: ListStyle = match[3] !== undefined ? "task" : match[2] ? "bullet" : "ordered";
  return { style, indent: match[1].length, end: match[0].length, checked: /x/i.test(match[3] ?? "") };
}

/**
 * ⌘⇧8 / ⌘⇧9 / ⌘⇧7: make the current line — or every selected line — a bullet,
 * a checkbox or a numbered item. If they all already are, take the marker
 * off instead, so the same keys turn a list back into plain lines.
 *
 * Any other list marker is swapped rather than stacked, so bullets become
 * checkboxes in one go; a ticked box stays ticked when the style changes.
 * Blank lines in a selection are skipped, unless the cursor is on one alone —
 * then it gets a fresh marker to type after.
 */
export function setListStyle(style: ListStyle): StateCommand {
  return ({ state, dispatch }) => {
    const numbers = new Set<number>();
    for (const range of state.selection.ranges) {
      const first = state.doc.lineAt(range.from).number;
      const last = state.doc.lineAt(range.to).number;
      for (let n = first; n <= last; n++) numbers.add(n);
    }

    const lines = [...numbers].sort((a, b) => a - b).map((n) => state.doc.line(n));
    const written = lines.filter((line) => line.text.trim() !== "");
    const targets = written.length ? written : lines;

    const removing = targets.every((line) => listPrefix(line.text).style === style);

    const changes = targets.map((line, index) => {
      const prefix = listPrefix(line.text);
      const from = line.from + prefix.indent;
      const to = line.from + prefix.end;
      if (removing) return { from, to, insert: "" };

      const insert =
        style === "bullet" ? "- " : style === "task" ? `- [${prefix.checked ? "x" : " "}] ` : `${index + 1}. `;
      return { from, to, insert };
    });

    const changeSet = state.changes(changes);
    dispatch(
      state.update({
        changes: changeSet,
        // Cursors move with their text; one sitting at a new marker lands after it.
        selection: state.selection.map(changeSet, 1),
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  };
}
