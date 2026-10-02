import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, type Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { continueListTight, needsMarkerSpace, setListStyle, type ListStyle } from "./commands";

/** Press Enter with the cursor at the "|" in `doc`; returns the document and cursor after. */
function enter(doc: string): string {
  const at = doc.indexOf("|");
  let state = EditorState.create({
    doc: doc.replace("|", ""),
    selection: EditorSelection.cursor(at),
    extensions: markdown({ base: markdownLanguage }),
  });
  ensureSyntaxTree(state, state.doc.length, 5000);

  let next: Transaction | null = null;
  continueListTight({ state, dispatch: (tr) => (next = tr) });
  if (next) state = (next as Transaction).state;

  const text = state.doc.toString();
  const head = state.selection.main.head;
  return text.slice(0, head) + "|" + text.slice(head);
}

describe("Enter in a list", () => {
  it("continues a tight list on the next line", () => {
    expect(enter("- one|")).toBe("- one\n- |");
  });

  it("continues a loose list on the next line too — no blank line", () => {
    // The first two items are separated by a blank line, which made the old
    // Enter insert one before every new item in the list.
    expect(enter("- one\n\n- two|")).toBe("- one\n\n- two\n- |");
  });

  it("leaves the blank lines already in the note alone", () => {
    expect(enter("- a\n\n- b\n- c|")).toBe("- a\n\n- b\n- c\n- |");
  });

  it("does the same for numbered lists, renumbering as it goes", () => {
    expect(enter("1. one\n\n2. two|")).toBe("1. one\n\n2. two\n3. |");
  });

  it("does the same for tasks", () => {
    expect(enter("- [ ] one\n\n- [x] two|")).toBe("- [ ] one\n\n- [x] two\n- [ ] |");
  });

  it("doesn't open a gap when Enter is pressed on an empty second item", () => {
    // That used to push the item down a line, turning the list loose.
    expect(enter("- one\n- |")).not.toContain("\n\n");
  });

  it("still splits an item in the middle, one line down", () => {
    // The space after the cursor travels with the text, as it always has.
    expect(enter("- one| two")).toBe("- one\n- | two");
  });

  it("does nothing outside a list, so plain Enter handles it", () => {
    expect(enter("plain text|")).toBe("plain text|");
  });
});

describe("the space after a list marker", () => {
  it("is added for every kind of list when a word starts", () => {
    expect(needsMarkerSpace("-", "t")).toBe(true);
    expect(needsMarkerSpace("+", "t")).toBe(true);
    expect(needsMarkerSpace("*", "t")).toBe(true);
    expect(needsMarkerSpace("1.", "t")).toBe(true);
    expect(needsMarkerSpace("12)", "t")).toBe(true);
    expect(needsMarkerSpace("- [ ]", "t")).toBe(true);
    expect(needsMarkerSpace("- [x]", "3")).toBe(true);
  });

  it("works on nested lines and for letters beyond ASCII", () => {
    expect(needsMarkerSpace("    -", "é")).toBe(true);
    expect(needsMarkerSpace("\t1.", "日")).toBe(true);
  });

  it("starts a checkbox from '-['", () => {
    expect(needsMarkerSpace("-", "[")).toBe(true);
  });

  it("leaves ordinary writing alone", () => {
    expect(needsMarkerSpace("-", "5")).toBe(false); // -5°
    expect(needsMarkerSpace("-", "-")).toBe(false); // -- and ---
    expect(needsMarkerSpace("*", "*")).toBe(false); // **bold**
    expect(needsMarkerSpace("1.", "5")).toBe(false); // 1.5
    expect(needsMarkerSpace("-", " ")).toBe(false); // already spaced
    expect(needsMarkerSpace("a-", "t")).toBe(false); // mid-word
    expect(needsMarkerSpace("- x", "t")).toBe(false); // already a list item
  });
});

/** Run a list shortcut on `doc`, where [ and ] mark the selection (or | a bare cursor). */
function shortcut(style: ListStyle, doc: string): string {
  const anchor = doc.includes("|") ? doc.indexOf("|") : doc.indexOf("[[");
  const plain = doc.replace("|", "").replace("[[", "").replace("]]", "");
  const head = doc.includes("|") ? anchor : doc.replace("[[", "").indexOf("]]");
  let state = EditorState.create({ doc: plain, selection: EditorSelection.range(anchor, head) });
  setListStyle(style)({ state, dispatch: (tr) => (state = tr.state) });
  const at = state.selection.main.head;
  const text = state.doc.toString();
  return text.slice(0, at) + "|" + text.slice(at);
}

describe("list shortcuts", () => {
  it("⌘⇧8 makes the line a bullet, and again takes it off", () => {
    expect(shortcut("bullet", "hello|")).toBe("- hello|");
    expect(shortcut("bullet", "- hello|")).toBe("hello|");
  });

  it("⌘⇧9 makes a checkbox, and again takes it off", () => {
    expect(shortcut("task", "buy milk|")).toBe("- [ ] buy milk|");
    expect(shortcut("task", "- [ ] buy milk|")).toBe("buy milk|");
  });

  it("swaps one kind of list for another instead of stacking markers", () => {
    expect(shortcut("task", "- bullet|")).toBe("- [ ] bullet|");
    expect(shortcut("bullet", "- [ ] task|")).toBe("- task|");
    expect(shortcut("bullet", "3. numbered|")).toBe("- numbered|");
  });

  it("keeps a ticked box ticked when converting between checklists", () => {
    expect(shortcut("task", "[[- [x] done\nplain]]")).toBe("- [x] done\n- [ ] plain|");
  });

  it("converts every selected line, skipping blank ones", () => {
    expect(shortcut("bullet", "[[one\n\ntwo]]")).toBe("- one\n\n- two|");
  });

  it("numbers selected lines from 1", () => {
    expect(shortcut("ordered", "[[a\nb\nc]]")).toBe("1. a\n2. b\n3. c|");
  });

  it("removes only when every selected line already has that style", () => {
    expect(shortcut("bullet", "[[- one\ntwo]]")).toBe("- one\n- two|");
  });

  it("keeps nesting", () => {
    expect(shortcut("task", "  - nested|")).toBe("  - [ ] nested|");
  });

  it("puts a marker on an empty line, with the cursor after it", () => {
    expect(shortcut("bullet", "|")).toBe("- |");
    expect(shortcut("task", "|")).toBe("- [ ] |");
  });
});
