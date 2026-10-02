import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

import { needsMarkerSpace } from "./commands";

/** Inside these, a line starting "-v" is code or markup, not a list waiting to happen. */
const LITERAL = new Set(["FencedCode", "CodeBlock", "HTMLBlock", "CommentBlock"]);

/**
 * Types the space after a list marker for you: "-" then "t" gives "- t".
 * See `needsMarkerSpace` for exactly when.
 */
export const autoSpaceAfterMarker = EditorView.inputHandler.of((view, from, to, text) => {
  const { state } = view;
  if (view.composing || from !== to || state.selection.ranges.length > 1) return false;

  const line = state.doc.lineAt(from);
  if (!needsMarkerSpace(line.text.slice(0, from - line.from), text)) return false;

  for (let node = syntaxTree(state).resolveInner(from, -1); node; node = node.parent!) {
    if (LITERAL.has(node.name)) return false;
    if (!node.parent) break;
  }

  view.dispatch({
    changes: { from, insert: ` ${text}` },
    selection: { anchor: from + 1 + text.length },
    scrollIntoView: true,
    userEvent: "input.type",
  });
  return true;
});
