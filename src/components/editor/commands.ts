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
