/**
 * Tags are `#words` in a note's text — Bear's model. There is no tags table:
 * a note is tagged by what's written in it, so the tag survives export and
 * there is nothing to keep in sync. The editor's parser (editor/syntax.ts)
 * draws the same pattern.
 */

/** Every distinct tag in a body of text, lowercased, without the hash. */
export function extractTags(text: string): string[] {
  const found = new Set<string>();
  let inFence = false;

  for (const line of text.split("\n")) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) inFence = !inFence;
    if (inFence) continue;

    // Inline code would otherwise turn `#define` into a tag.
    const prose = line.replace(/`[^`]*`/g, "");
    for (const match of prose.matchAll(/(?:^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu)) {
      const tag = match[1].replace(/[/-]+$/, "");
      if (/\p{L}/u.test(tag)) found.add(tag.toLowerCase());
    }
  }

  return [...found];
}
