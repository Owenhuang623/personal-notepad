import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

import { highlightTag } from "./syntax";

const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";

/** One marker's width — a bullet, a checkbox or "10." sits in a box this wide. */
const MARKER = "1.55em";

/**
 * Everything is expressed against the app's CSS variables, so one theme covers
 * light and dark — the tokens swap underneath it. Size and leading come from
 * `.np-editor` in globals.css, shared with the stand-in that renders first.
 */
const base = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--text-size)",
    color: "var(--ink)",
    backgroundColor: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-sans)",
    lineHeight: "var(--text-leading)",
    overflow: "auto",
  },
  // Half a viewport of slack below the last line, so the line being written
  // never sits pinned to the bottom edge.
  ".cm-content": {
    padding: "0",
    paddingLeft: "var(--gutter)",
    paddingBottom: "50vh",
    caretColor: "var(--accent)",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 20%, transparent) !important",
  },
  ".cm-placeholder": { color: "var(--ink-faint)" },

  /* Headings: weight and size do the work, and a little air above each. */
  ".cm-line.cm-h": { position: "relative", fontWeight: "650", letterSpacing: "-0.012em" },
  ".cm-line.cm-h1": { fontSize: "1.6em", lineHeight: "1.3", paddingTop: "0.55em", paddingBottom: "0.1em" },
  ".cm-line.cm-h2": { fontSize: "1.3em", lineHeight: "1.38", paddingTop: "0.5em", paddingBottom: "0.05em" },
  ".cm-line.cm-h3": { fontSize: "1.1em", lineHeight: "1.5", paddingTop: "0.4em" },
  ".cm-line.cm-h4, .cm-line.cm-h5, .cm-line.cm-h6": { paddingTop: "0.3em" },
  ".cm-line.cm-h5, .cm-line.cm-h6": { color: "var(--ink-muted)" },

  /*
   * The hashes hang in the gutter, out of flow, so the heading's first letter
   * stays on the text's left edge. Faint until you're on the line or hovering
   * it — enough to say "this is an h2" when you look for it, invisible when
   * you're reading.
   */
  ".cm-heading-mark": {
    position: "absolute",
    // Scaled rather than set smaller, so it keeps the heading's line box and
    // sits level with the text instead of floating above it.
    transform: "translateX(calc(-100% - 0.3em)) scale(0.6)",
    transformOrigin: "right center",
    fontWeight: "600",
    letterSpacing: "0.04em",
    color: "var(--accent)",
    opacity: "0",
    transition: "opacity 120ms ease",
    userSelect: "none",
    pointerEvents: "none",
  },
  ".cm-line:hover .cm-heading-mark": { opacity: "0.45" },
  ".cm-activeLine .cm-heading-mark": { opacity: "0.85" },
  ".cm-activeLine": { backgroundColor: "transparent" },

  /*
   * Hanging indent for list items: pad by depth, pull the first line back by
   * one marker, and the wrapped lines start under the first word.
   */
  ".cm-line.cm-li": {
    paddingLeft: `calc(var(--depth) * ${MARKER})`,
    textIndent: `calc(-1 * ${MARKER})`,
  },
  ".cm-marker": {
    display: "inline-block",
    width: MARKER,
    textIndent: "0",
    userSelect: "none",
  },
  ".cm-bullet": {
    color: "var(--accent)",
    fontWeight: "700",
    paddingLeft: "0.3em",
  },
  ".cm-ordinal": {
    color: "var(--ink-muted)",
    fontVariantNumeric: "tabular-nums",
  },

  ".cm-task-checkbox": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    width: "1.02em",
    height: "1.02em",
    verticalAlign: "-0.15em",
    border: "1.5px solid var(--line-strong)",
    borderRadius: "0.3em",
    cursor: "pointer",
    transition: "background-color 120ms ease, border-color 120ms ease",
  },
  ".cm-task-checkbox:hover": { borderColor: "var(--accent)" },
  ".cm-task-checkbox.is-checked": {
    backgroundColor: "var(--accent)",
    borderColor: "var(--accent)",
    // A tick, drawn rather than typed, so it doesn't depend on the font.
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.4l2.6 2.6L12 5.4' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
    backgroundSize: "100% 100%",
  },
  ".cm-task-done": {
    color: "var(--ink-faint)",
    textDecoration: "line-through",
    textDecorationColor: "color-mix(in srgb, var(--ink-faint) 70%, transparent)",
  },

  ".cm-line.cm-hr": {
    backgroundImage: "linear-gradient(var(--line-strong), var(--line-strong))",
    backgroundSize: "100% 1px",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  },

  ".cm-line.cm-quote": {
    borderLeft: "3px solid color-mix(in srgb, var(--accent) 45%, transparent)",
    paddingLeft: "0.9em",
    color: "var(--ink-muted)",
    fontStyle: "italic",
  },

  ".cm-line.cm-codeblock": {
    fontFamily: MONO,
    fontSize: "0.86em",
    lineHeight: "1.65",
    backgroundColor: "var(--hover)",
    padding: "0 0.9em",
  },
  ".cm-line.cm-code-first": { borderTopLeftRadius: "8px", borderTopRightRadius: "8px", paddingTop: "0.45em" },
  ".cm-line.cm-code-last": { borderBottomLeftRadius: "8px", borderBottomRightRadius: "8px", paddingBottom: "0.45em" },
  ".cm-line.cm-code-fence": { color: "var(--ink-faint)" },

  /*
   * Inline code and tags are styled as marks from the live preview rather than
   * through the highlight style: code inside a fenced block shares inline
   * code's highlight tag and mustn't get the pill, and a highlight rule that
   * names a class drops its own styles.
   */
  ".cm-inline-code": {
    fontSize: "0.86em",
    backgroundColor: "var(--hover)",
    border: "1px solid var(--line)",
    borderRadius: "4px",
    padding: "0.1em 0.3em",
  },
  ".cm-hashtag": {
    color: "var(--accent)",
    backgroundColor: "var(--accent-soft)",
    borderRadius: "5px",
    padding: "0.08em 0.32em",
    fontWeight: "500",
    fontSize: "0.94em",
  },

  ".cm-link-text": {
    color: "var(--accent)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--accent) 35%, transparent)",
    textUnderlineOffset: "3px",
  },
  ".cm-bare-url": {
    color: "var(--accent)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--accent) 35%, transparent)",
    textUnderlineOffset: "3px",
  },
  /* A picture sits on its own row, at most the column's width. */
  ".cm-image": {
    display: "block",
    margin: "0.35em 0",
    lineHeight: "0",
  },
  ".cm-image img": {
    display: "inline-block",
    maxWidth: "100%",
    maxHeight: "32rem",
    borderRadius: "8px",
    border: "1px solid var(--line)",
    backgroundColor: "var(--hover)",
  },
  ".cm-image-pending": {
    display: "inline-block",
    lineHeight: "1.5",
    padding: "0.5em 0.85em",
    borderRadius: "8px",
    border: "1px dashed var(--line-strong)",
    color: "var(--ink-faint)",
    fontSize: "0.88em",
  },

  "&.cm-follow .cm-link-text, &.cm-follow .cm-bare-url, &.cm-follow .cm-hashtag": { cursor: "pointer" },
});

const highlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--ink)" },
  { tag: tags.strong, fontWeight: "650" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--ink-faint)" },
  { tag: tags.monospace, fontFamily: MONO },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--ink-faint)" },
  { tag: tags.quote, color: "var(--ink-muted)" },
  { tag: highlightTag, backgroundColor: "var(--mark)", borderRadius: "3px", padding: "0.05em 0" },
  // Markdown syntax characters, visible only while the cursor is on them.
  { tag: tags.processingInstruction, color: "var(--ink-faint)", fontWeight: "400" },
  { tag: tags.contentSeparator, color: "var(--ink-faint)" },
]);

export const notepadTheme: Extension = [base, syntaxHighlighting(highlight)];
