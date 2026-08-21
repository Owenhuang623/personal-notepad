import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

/**
 * Obsidian-style live preview.
 *
 * Markdown syntax is hidden and the text renders as formatting, except on the
 * line the cursor is on — there the raw characters come back so they can be
 * edited. This works here (and not over a textarea) because CodeMirror renders
 * the document itself, so replacing a range with nothing, or with a checkbox
 * widget, reflows honestly instead of desynchronising from a hidden input.
 */

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view: EditorView) {
    const box = document.createElement("span");
    box.className = `cm-task-checkbox${this.checked ? " is-checked" : ""}`;
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));

    // mousedown rather than click: the editor would otherwise move the cursor
    // into the line first, which un-hides the syntax and removes this widget
    // before the click completes.
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({
        changes: { from: this.from, to: this.from + 3, insert: this.checked ? "[ ]" : "[x]" },
      });
    });

    return box;
  }

  ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const dot = document.createElement("span");
    dot.className = "cm-bullet";
    dot.textContent = "•";
    return dot;
  }
}

/** Every line touched by a cursor or selection — these render as raw markdown. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let line = first; line <= last; line++) lines.add(line);
  }

  return lines;
}

function build(view: EditorView) {
  const { state } = view;
  const active = activeLines(state);

  const decorations: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];

  const hide = (from: number, to: number) => {
    if (to <= from) return;
    const deco = Decoration.replace({});
    decorations.push(deco.range(from, to));
    atomic.push(deco.range(from, to));
  };

  const replaceWith = (from: number, to: number, widget: WidgetType) => {
    if (to <= from) return;
    const deco = Decoration.replace({ widget });
    decorations.push(deco.range(from, to));
    atomic.push(deco.range(from, to));
  };

  /** Swallow one trailing space so hiding "# " doesn't leave the text indented. */
  const withTrailingSpace = (to: number) =>
    state.doc.sliceString(to, to + 1) === " " ? to + 1 : to;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const line = state.doc.lineAt(node.from);
        const isActive = active.has(line.number);

        const heading = /^ATXHeading([1-6])$/.exec(node.name);
        if (heading) {
          decorations.push(
            Decoration.line({ class: `cm-h${heading[1]}` }).range(line.from, line.from),
          );
          return;
        }

        if (node.name === "HeaderMark" && !isActive) {
          hide(node.from, withTrailingSpace(node.to));
          return;
        }

        if (node.name === "ListItem") {
          const mark = node.node.getChild("ListMark");
          // TaskMarker sits under an intermediate Task node — ListItem > Task >
          // TaskMarker — so a direct getChild("TaskMarker") finds nothing.
          const task = node.node.getChild("Task")?.getChild("TaskMarker") ?? null;
          const markLine = mark ? state.doc.lineAt(mark.from).number : line.number;
          const markActive = active.has(markLine);

          if (task) {
            const checked = state.doc.sliceString(task.from, task.to).toLowerCase().includes("x");

            if (!markActive) {
              if (mark) hide(mark.from, withTrailingSpace(mark.to));
              replaceWith(task.from, task.to, new CheckboxWidget(checked, task.from));
            }

            if (checked) {
              const textFrom = withTrailingSpace(task.to);
              const textTo = state.doc.lineAt(task.to).to;
              if (textTo > textFrom) {
                decorations.push(
                  Decoration.mark({ class: "cm-task-done" }).range(textFrom, textTo),
                );
              }
            }
          } else if (mark && !markActive) {
            // Only unordered marks become bullets; "1." and "2)" carry meaning.
            const text = state.doc.sliceString(mark.from, mark.to);
            if (/^[-*+]$/.test(text)) replaceWith(mark.from, mark.to, new BulletWidget());
          }

          return;
        }

        if (node.name === "HorizontalRule") {
          decorations.push(Decoration.line({ class: "cm-hr" }).range(line.from, line.from));
          if (!isActive) hide(line.from, line.to);
          return;
        }

        if (node.name === "FencedCode") {
          for (let pos = node.from; pos <= node.to; ) {
            const codeLine = state.doc.lineAt(pos);
            decorations.push(
              Decoration.line({ class: "cm-codeblock" }).range(codeLine.from, codeLine.from),
            );
            if (codeLine.to >= node.to) break;
            pos = codeLine.to + 1;
          }
          return;
        }

        // Leaves just the link text: the brackets, parens and URL all hide.
        if (node.name === "LinkMark" || node.name === "URL") {
          const parent = node.node.parent?.name;
          if (!isActive && (parent === "Link" || parent === "Image")) hide(node.from, node.to);
          return;
        }

        if (node.name === "QuoteMark") {
          decorations.push(Decoration.line({ class: "cm-quote" }).range(line.from, line.from));
          if (!isActive) hide(node.from, withTrailingSpace(node.to));
          return;
        }

        if (node.name === "EmphasisMark" || node.name === "StrikethroughMark") {
          if (!isActive) hide(node.from, node.to);
          return;
        }

        // Only inline code — hiding the fences of a code block would be confusing.
        if (node.name === "CodeMark" && node.node.parent?.name === "InlineCode") {
          if (!isActive) hide(node.from, node.to);
        }
      },
    });
  }

  return {
    decorations: Decoration.set(decorations, true),
    atomic: Decoration.set(atomic, true),
  };
}

export function livePreview(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      atomic: DecorationSet;

      constructor(view: EditorView) {
        const built = build(view);
        this.decorations = built.decorations;
        this.atomic = built.atomic;
      }

      update(update: ViewUpdate) {
        // Selection matters as much as content here: moving the cursor onto a
        // line is what reveals its syntax.
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          const built = build(update.view);
          this.decorations = built.decorations;
          this.atomic = built.atomic;
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      // Without this the cursor can land inside hidden syntax and appear stuck.
      provide: (plugin) =>
        EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
    },
  );
}
