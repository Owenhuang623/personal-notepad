"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  keymap,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

import { autoSpaceAfterMarker } from "./editor/autoSpace";
import { imagePasting } from "./editor/images";
import {
  continueListTight,
  deleteMarkerBackward,
  exitEmptyQuote,
  setListStyle,
  toggleTask,
} from "./editor/commands";
import { livePreview } from "./editor/livePreview";
import { Hashtag, Highlight } from "./editor/syntax";
import { notepadTheme } from "./editor/theme";

export type MarkdownEditorHandle = { focus: () => void };

/**
 * The handle arrives through onReady rather than a ref: this component is
 * loaded lazily, and a callback passes through a dynamic import unambiguously
 * where a forwarded ref does not.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
  onReady,
  onTag,
  onNotice,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onReady?: (handle: MarkdownEditorHandle) => void;
  /** ⌘-click on a #tag. */
  onTag?: (tag: string) => void;
  /** Something worth a moment's message — an image that couldn't be uploaded. */
  onNotice?: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // Kept in a ref so the editor is built once and never torn down mid-typing
  // just because the parent re-rendered with a new callback identity.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const onTagRef = useRef(onTag);
  onTagRef.current = onTag;

  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  useEffect(() => {
    if (!host.current) return;

    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          EditorView.lineWrapping,
          // addKeymap: false — markdown() would otherwise install its keymap at high
          // precedence, ahead of the marker-aware Backspace and Enter below.
          markdown({ base: markdownLanguage, extensions: [Highlight, Hashtag], addKeymap: false }),
          livePreview({ onTag: (tag) => onTagRef.current?.(tag) }),
          autoSpaceAfterMarker,
          imagePasting({ onError: (message) => onNoticeRef.current?.(message) }),
          // Styled transparent; it's only here to tell the heading marks which
          // line the cursor is on.
          highlightActiveLine(),
          notepadTheme,
          placeholder ? placeholderExtension(placeholder) : [],
          keymap.of([
            { key: "Mod-Enter", run: toggleTask },
            // As in Apple Notes: ⌘⇧7 numbered, ⌘⇧8 bullets, ⌘⇧9 checklist.
            { key: "Mod-Shift-7", run: setListStyle("ordered"), preventDefault: true },
            { key: "Mod-Shift-8", run: setListStyle("bullet"), preventDefault: true },
            { key: "Mod-Shift-9", run: setListStyle("task"), preventDefault: true },
            { key: "Backspace", run: deleteMarkerBackward },
            { key: "Enter", run: exitEmptyQuote },
            // Ahead of markdownKeymap's own Enter, which would add blank lines.
            { key: "Enter", run: continueListTight },
            // Tab indents rather than moving focus — nested lists need it.
            indentWithTab,
            // Before defaultKeymap so Enter continues a list instead of just
            // breaking the line.
            ...markdownKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });

    view.current = instance;
    if (autoFocus) instance.focus();
    onReadyRef.current?.({ focus: () => instance.focus() });

    return () => {
      instance.destroy();
      view.current = null;
    };
    // Built once per mount. The note id keys this component, so switching notes
    // remounts it with the right document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile changes that came from outside the editor — draft recovery on
  // load, or Clear on the scratchpad.
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;

    const current = instance.state.doc.toString();
    if (value === current) return;

    instance.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div ref={host} className="h-full [&_.cm-editor]:h-full" />;
}
