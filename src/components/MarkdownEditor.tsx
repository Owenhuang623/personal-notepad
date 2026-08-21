"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExtension } from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { toggleTask } from "./editor/commands";
import { livePreview } from "./editor/livePreview";
import { notepadTheme } from "./editor/theme";

export type MarkdownEditorHandle = { focus: () => void };

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
  }
>(function MarkdownEditor({ value, onChange, placeholder, autoFocus }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // Kept in a ref so the editor is built once and never torn down mid-typing
  // just because the parent re-rendered with a new callback identity.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useImperativeHandle(ref, () => ({ focus: () => view.current?.focus() }), []);

  useEffect(() => {
    if (!host.current) return;

    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          livePreview(),
          notepadTheme,
          placeholder ? placeholderExtension(placeholder) : [],
          keymap.of([
            { key: "Mod-Enter", run: toggleTask },
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
});
