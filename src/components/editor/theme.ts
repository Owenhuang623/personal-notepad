import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * Everything is expressed against the app's CSS variables, so one theme covers
 * light and dark — the tokens swap underneath it.
 */
const base = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "15px",
    color: "var(--ink)",
    backgroundColor: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-sans)",
    lineHeight: "1.75",
    overflow: "auto",
  },
  // Half a viewport of slack below the last line, so the line being written
  // never sits pinned to the bottom edge.
  ".cm-content": { padding: "0", paddingBottom: "50vh", caretColor: "var(--ink)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ink)", borderLeftWidth: "1.5px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--ink) 16%, transparent)",
  },
  ".cm-placeholder": { color: "var(--ink-faint)" },

  ".cm-h1": { fontSize: "1.5em", fontWeight: "600", lineHeight: "1.4", paddingTop: "0.5em" },
  ".cm-h2": { fontSize: "1.28em", fontWeight: "600", lineHeight: "1.45", paddingTop: "0.4em" },
  ".cm-h3": { fontSize: "1.12em", fontWeight: "600", lineHeight: "1.5", paddingTop: "0.3em" },
  ".cm-h4, .cm-h5, .cm-h6": { fontWeight: "600" },

  ".cm-task-checkbox": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1em",
    height: "1em",
    marginRight: "0.15em",
    verticalAlign: "-0.12em",
    border: "1.5px solid var(--line-strong)",
    borderRadius: "3px",
    fontSize: "0.78em",
    lineHeight: "1",
    cursor: "pointer",
    color: "var(--canvas)",
    userSelect: "none",
  },
  ".cm-task-checkbox.is-checked": {
    backgroundColor: "var(--ink)",
    borderColor: "var(--ink)",
  },
  ".cm-task-done": { color: "var(--ink-faint)", textDecoration: "line-through" },
  ".cm-bullet": { color: "var(--ink-faint)" },
  ".cm-hr": { borderBottom: "1px solid var(--line-strong)" },
  ".cm-codeblock": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "0.92em",
    backgroundColor: "var(--hover)",
  },
  ".cm-quote": {
    borderLeft: "2px solid var(--line-strong)",
    paddingLeft: "0.75em",
    color: "var(--ink-muted)",
  },
});

const highlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--ink)" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--ink-faint)" },
  {
    tag: tags.monospace,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "0.92em",
    backgroundColor: "var(--hover)",
    borderRadius: "3px",
  },
  { tag: tags.link, color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: "2px" },
  { tag: tags.url, color: "var(--ink-faint)" },
  { tag: tags.quote, color: "var(--ink-muted)" },
  // Markdown syntax characters, visible only on the cursor's own line.
  { tag: tags.processingInstruction, color: "var(--ink-faint)" },
  { tag: tags.contentSeparator, color: "var(--ink-faint)" },
]);

export const notepadTheme: Extension = [base, syntaxHighlighting(highlight)];
