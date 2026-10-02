import { describe, expect, it } from "vitest";

import { extractTags } from "./tags";

describe("extractTags", () => {
  it("finds tags at the start of a line and after spaces", () => {
    expect(extractTags("#work notes about #shipping")).toEqual(["work", "shipping"]);
  });

  it("is not fooled by headings, issue numbers or anchors", () => {
    expect(extractTags("# Heading\n## Sub\nfixes #12, see a.com/#frag")).toEqual([]);
  });

  it("keeps nested and hyphenated tags, dropping trailing punctuation", () => {
    expect(extractTags("#work/shopify and #to-do- and #ideas.")).toEqual(["work/shopify", "to-do", "ideas"]);
  });

  it("ignores code", () => {
    expect(extractTags("`#define x`\n```\n#include <x>\n```\n#real")).toEqual(["real"]);
  });

  it("is case-insensitive and deduplicated", () => {
    expect(extractTags("#Ideas #ideas #IDEAS")).toEqual(["ideas"]);
  });
});
