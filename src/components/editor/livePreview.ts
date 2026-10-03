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
import { type SyntaxNode } from "@lezer/common";

import { UPLOADING_PREFIX, uploadStatus } from "./images";

/**
 * Live preview, in the manner of Bear.
 *
 * Markdown renders as formatting while you write. There are two rules for when
 * the raw characters come back:
 *
 * - **Block markers never do.** Headings, bullets, checkboxes and quotes stay
 *   drawn even on the line being edited. The earlier version revealed the
 *   whole line the cursor sat on, which made the text jump sideways every time
 *   the cursor arrived — the single most "un-premium" thing about the editor.
 *   Each marker is atomic instead: Backspace at the start of a heading or list
 *   item deletes the marker whole and leaves a plain line, which is what you
 *   meant. Heading hashes hang in the left margin, so the heading's first
 *   letter lines up with the body text and never moves.
 *
 * - **Inline markers do, but only their own.** `**`, `_`, `~~`, `==`, backticks
 *   and link syntax appear when the cursor touches that one element, so bold on
 *   one side of a sentence stays rendered while you edit italics on the other.
 */

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly box: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.box === this.box;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-marker";

    const box = document.createElement("span");
    box.className = `cm-task-checkbox${this.checked ? " is-checked" : ""}`;
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    wrap.appendChild(box);

    // mousedown rather than click, so the editor doesn't move the cursor first.
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({
        changes: { from: this.box, to: this.box + 3, insert: this.checked ? "[ ]" : "[x]" },
      });
    });

    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

/** A bullet or a number, in a fixed-width box the item's wrapped lines align to. */
/**
 * An image, drawn in place of its `![alt](url)`. Compared by url and alt, so
 * moving the cursor around the note never reloads the picture.
 */
class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.url === this.url && other.alt === this.alt;
  }

  get estimatedHeight() {
    return 240;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-image";

    if (this.url.startsWith(UPLOADING_PREFIX)) {
      const status = uploadStatus(this.url.slice(UPLOADING_PREFIX.length));
      wrap.classList.add("cm-image-pending");
      wrap.textContent =
        status === "pending"
          ? "Uploading image…"
          : "This image didn't finish uploading — delete this line and add it again";
      return wrap;
    }

    const img = document.createElement("img");
    img.src = this.url;
    img.alt = this.alt;
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    // The line grows when the picture arrives; let the editor re-measure.
    img.addEventListener("load", () => view.requestMeasure());
    img.addEventListener("error", () => {
      wrap.classList.add("cm-image-pending");
      wrap.textContent = `Image not found: ${this.alt || this.url}`;
      view.requestMeasure();
    });
    wrap.appendChild(img);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

class MarkerWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: MarkerWidget) {
    return other.text === this.text;
  }

  toDOM() {
    const marker = document.createElement("span");
    marker.className = this.text === "•" ? "cm-marker cm-bullet" : "cm-marker cm-ordinal";
    marker.textContent = this.text;
    return marker;
  }
}

/** `##`, drawn out of flow to the left of the heading. */
class HeadingMarkWidget extends WidgetType {
  constructor(readonly level: number) {
    super();
  }

  eq(other: HeadingMarkWidget) {
    return other.level === this.level;
  }

  toDOM() {
    const mark = document.createElement("span");
    mark.className = "cm-heading-mark";
    mark.textContent = "#".repeat(this.level);
    mark.setAttribute("aria-hidden", "true");
    return mark;
  }
}

/**
 * Whether the selection overlaps [from, to], counting the endpoints — so a
 * cursor resting just after `**bold**` still shows the markers while you're
 * finishing the word. Type a space and the text formats.
 */
function touches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

/** Every line touched by a cursor or selection. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let line = first; line <= last; line++) lines.add(line);
  }

  return lines;
}

/** How many lists deep a list item sits; 1 for a top-level item. */
function listDepth(item: SyntaxNode): number {
  let depth = 0;
  for (let node: SyntaxNode | null = item.parent; node; node = node.parent) {
    if (node.name === "BulletList" || node.name === "OrderedList") depth++;
  }
  return Math.max(depth, 1);
}

/** Shown when hovering a link: following one needs the modifier, so say which. */
const FOLLOW_HINT =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? "⌘-click to open"
    : "Ctrl-click to open";

const INLINE_MARKS = new Set(["EmphasisMark", "StrikethroughMark", "HighlightMark"]);

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

  const lineClass = (pos: number, attributes: Record<string, string>) => {
    const at = state.doc.lineAt(pos).from;
    decorations.push(Decoration.line({ attributes }).range(at, at));
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
          lineClass(line.from, { class: `cm-h cm-h${heading[1]}` });
          return;
        }

        if (node.name === "HeaderMark") {
          const parent = node.node.parent;
          if (parent && parent.from === node.from) {
            replaceWith(node.from, withTrailingSpace(node.to), new HeadingMarkWidget(node.to - node.from));
          } else if (!isActive) {
            // Optional closing hashes ("## Title ##") are clutter once rendered.
            hide(node.from, node.to);
          }
          return;
        }

        if (node.name === "ListItem") {
          const mark = node.node.getChild("ListMark");
          if (!mark) return;

          const markLine = state.doc.lineAt(mark.from);
          // TaskMarker sits under an intermediate Task node: ListItem > Task > TaskMarker.
          const task = node.node.getChild("Task")?.getChild("TaskMarker") ?? null;

          /*
           * Hanging indent. The line is padded by its depth and pulled back by
           * one marker's width, so the marker sits in the padding and every
           * wrapped line starts under the first word rather than under the
           * bullet. The source's own leading spaces are hidden — depth comes
           * from the tree, so mixed tabs and spaces still line up.
           */
          lineClass(markLine.from, {
            class: task ? "cm-li cm-li-task" : "cm-li",
            style: `--depth: ${listDepth(node.node)}`,
          });
          if (/^\s+$/.test(state.doc.sliceString(markLine.from, mark.from))) {
            hide(markLine.from, mark.from);
          }

          if (task) {
            const checked = /x/i.test(state.doc.sliceString(task.from, task.to));
            replaceWith(mark.from, withTrailingSpace(task.to), new CheckboxWidget(checked, task.from));

            if (checked) {
              const textFrom = withTrailingSpace(task.to);
              const textTo = state.doc.lineAt(task.to).to;
              if (textTo > textFrom) {
                decorations.push(Decoration.mark({ class: "cm-task-done" }).range(textFrom, textTo));
              }
            }
          } else {
            const text = state.doc.sliceString(mark.from, mark.to);
            replaceWith(
              mark.from,
              withTrailingSpace(mark.to),
              new MarkerWidget(/^[-*+]$/.test(text) ? "•" : text),
            );
          }
          return;
        }

        if (node.name === "HorizontalRule") {
          lineClass(line.from, { class: "cm-hr" });
          if (!isActive) hide(line.from, line.to);
          return;
        }

        if (node.name === "Blockquote") {
          for (let pos = node.from; pos <= node.to; ) {
            const quoteLine = state.doc.lineAt(pos);
            lineClass(quoteLine.from, { class: "cm-quote" });
            if (quoteLine.to >= node.to) break;
            pos = quoteLine.to + 1;
          }
          return;
        }

        if (node.name === "QuoteMark") {
          hide(node.from, withTrailingSpace(node.to));
          return;
        }

        if (node.name === "FencedCode") {
          const first = state.doc.lineAt(node.from).number;
          const last = state.doc.lineAt(node.to).number;
          for (let number = first; number <= last; number++) {
            const codeLine = state.doc.line(number);
            const edge = number === first ? " cm-code-first" : number === last ? " cm-code-last" : "";
            const fence = number === first || (number === last && last > first) ? " cm-code-fence" : "";
            lineClass(codeLine.from, { class: `cm-codeblock${edge}${fence}` });
          }
          return false;
        }

        /*
         * An image shows as the picture. With the cursor on it, the markdown
         * comes back for editing and the picture stays drawn just after it,
         * so nothing below jumps when you click onto the line.
         */
        if (node.name === "Image") {
          const url = node.node.getChild("URL");
          const marks = node.node.getChildren("LinkMark");
          const src = url ? state.doc.sliceString(url.from, url.to) : "";
          const alt = marks.length >= 2 ? state.doc.sliceString(marks[0].to, marks[1].from) : "";
          if (!src) return;

          const widget = new ImageWidget(src, alt);
          if (touches(state, node.from, node.to)) {
            decorations.push(Decoration.widget({ widget, side: 1 }).range(node.to));
            return;
          }
          replaceWith(node.from, node.to, widget);
          return false;
        }

        // Leaves just the link text: the brackets, parens and URL all hide.
        if (node.name === "LinkMark" || node.name === "URL") {
          const parent = node.node.parent;
          const kind = parent?.name;
          if (parent && (kind === "Link" || kind === "Image")) {
            if (!touches(state, parent.from, parent.to)) hide(node.from, node.to);
          } else if (node.name === "URL") {
            // A bare URL is a link too, and should look like one.
            decorations.push(
              Decoration.mark({ class: "cm-bare-url", attributes: { title: FOLLOW_HINT } }).range(node.from, node.to),
            );
          }
          return;
        }

        if (node.name === "Link") {
          const label = node.node.getChild("LinkMark");
          const close = node.node.getChildren("LinkMark")[1];
          if (label && close && close.from > label.to) {
            decorations.push(
              Decoration.mark({ class: "cm-link-text", attributes: { title: FOLLOW_HINT } }).range(label.to, close.from),
            );
          }
          return;
        }

        if (node.name === "Hashtag") {
          decorations.push(Decoration.mark({ class: "cm-hashtag" }).range(node.from, node.to));
          return;
        }

        if (node.name === "InlineCode") {
          decorations.push(Decoration.mark({ class: "cm-inline-code" }).range(node.from, node.to));
          return;
        }

        if (INLINE_MARKS.has(node.name)) {
          const parent = node.node.parent;
          if (parent && !touches(state, parent.from, parent.to)) hide(node.from, node.to);
          return;
        }

        // Only inline code — a code block's fences stay, so you can see where it ends.
        if (node.name === "CodeMark" && node.node.parent?.name === "InlineCode") {
          const parent = node.node.parent;
          if (!touches(state, parent.from, parent.to)) hide(node.from, node.to);
        }
      },
    });
  }

  return {
    decorations: Decoration.set(decorations, true),
    atomic: Decoration.set(atomic, true),
  };
}

/** The URL under a position, for a link or a bare address. */
function urlAt(state: EditorState, pos: number): string | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === "URL") return state.doc.sliceString(node.from, node.to);
    if (node.name === "Link" || node.name === "Image") {
      const url = node.getChild("URL");
      return url ? state.doc.sliceString(url.from, url.to) : null;
    }
  }
  return null;
}

/** The tag under a position, without its hash. */
function tagAt(state: EditorState, pos: number): string | null {
  const node = syntaxTree(state).resolveInner(pos, 1);
  if (node.name !== "Hashtag") return null;
  return state.doc.sliceString(node.from + 1, node.to);
}

export function livePreview({ onTag }: { onTag?: (tag: string) => void } = {}): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      atomic: DecorationSet;

      constructor(view: EditorView) {
        const built = build(view);
        this.decorations = built.decorations;
        this.atomic = built.atomic;
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          const built = build(update.view);
          this.decorations = built.decorations;
          this.atomic = built.atomic;
        }
      }
    },
    {
      decorations: (instance) => instance.decorations,
      // Without this the cursor can land inside hidden syntax and appear stuck.
      provide: (instance) =>
        EditorView.atomicRanges.of((view) => view.plugin(instance)?.atomic ?? Decoration.none),
    },
  );

  /*
   * ⌘-click (Ctrl-click elsewhere) follows a link or opens a tag. A plain
   * click still just puts the cursor there — links in a document you're
   * editing shouldn't steal clicks meant for the text.
   */
  const follow = EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const url = urlAt(view.state, pos);
      if (url) {
        event.preventDefault();
        const href = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
        window.open(href, "_blank", "noopener,noreferrer");
        return true;
      }

      const tag = tagAt(view.state, pos);
      if (tag && onTag) {
        event.preventDefault();
        onTag(tag);
        return true;
      }

      return false;
    },
  });

  // Holding ⌘ says "I'm about to follow something" — show it in the cursor.
  const modifierClass = ViewPlugin.fromClass(
    class {
      constructor(readonly view: EditorView) {
        window.addEventListener("keydown", this.sync);
        window.addEventListener("keyup", this.sync);
        window.addEventListener("blur", this.clear);
      }
      sync = (event: KeyboardEvent) =>
        this.view.dom.classList.toggle("cm-follow", event.metaKey || event.ctrlKey);
      clear = () => this.view.dom.classList.remove("cm-follow");
      destroy() {
        window.removeEventListener("keydown", this.sync);
        window.removeEventListener("keyup", this.sync);
        window.removeEventListener("blur", this.clear);
      }
    },
  );

  return [plugin, follow, modifierClass];
}
