import { Tag, tags } from "@lezer/highlight";
import { type MarkdownConfig } from "@lezer/markdown";

/**
 * Two bits of syntax that Bear has and CommonMark doesn't: `==highlight==` and
 * `#tags`. Both are still plain characters in the stored text, so a note
 * exported as markdown reads the same anywhere — another app just won't colour
 * them.
 */

export const highlightTag = Tag.define();

const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

const EQUALS = 61;
const HASH = 35;

/** Modelled on @lezer/markdown's own Strikethrough, with `==` for `~~`. */
export const Highlight: MarkdownConfig = {
  defineNodes: [
    { name: "Highlight", style: { "Highlight/...": highlightTag } },
    { name: "HighlightMark", style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: "Highlight",
      parse(cx, next, pos) {
        if (next !== EQUALS || cx.char(pos + 1) !== EQUALS || cx.char(pos + 2) === EQUALS) return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        return cx.addDelimiter(HighlightDelim, pos, pos + 2, !/\s|^$/.test(after), !/\s|^$/.test(before));
      },
      after: "Emphasis",
    },
  ],
};

/**
 * `#word`, `#nested/tag`, `#multi-word-tag` — a hash glued to a letter, at the
 * start of a line or after whitespace. `# Heading` is never a tag: headings
 * need the space, and block parsing claims them before inline parsing runs.
 */
const TAG_BODY = /^[\p{L}\p{N}_][\p{L}\p{N}_/-]*/u;

export const Hashtag: MarkdownConfig = {
  defineNodes: [{ name: "Hashtag" }],
  parseInline: [
    {
      name: "Hashtag",
      parse(cx, next, pos) {
        if (next !== HASH) return -1;
        if (pos > cx.offset && !/\s/.test(cx.slice(pos - 1, pos))) return -1;

        const body = TAG_BODY.exec(cx.slice(pos + 1, cx.end));
        // A tag needs at least one letter: "#1" is an issue number, not a tag.
        if (!body || !/\p{L}/u.test(body[0])) return -1;

        const end = pos + 1 + body[0].replace(/[/-]+$/, "").length;
        return cx.addElement(cx.elt("Hashtag", pos, end));
      },
    },
  ],
};
