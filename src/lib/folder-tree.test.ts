import { describe, expect, it } from "vitest";

import {
  canMoveFolder,
  childrenOf,
  cleanFolderName,
  descendantIds,
  flattenTree,
  folderPath,
  type FolderSummary,
} from "./folder-tree";

// Work ─ Shopify ─ Shipping
//      └ Reading
// Personal
const TREE: FolderSummary[] = [
  { id: "work", name: "Work", parentId: null },
  { id: "shopify", name: "Shopify", parentId: "work" },
  { id: "shipping", name: "Shipping", parentId: "shopify" },
  { id: "reading", name: "reading", parentId: "work" },
  { id: "personal", name: "Personal", parentId: null },
];

describe("childrenOf", () => {
  it("sorts by name, ignoring case", () => {
    expect(childrenOf(TREE, "work").map((f) => f.id)).toEqual(["reading", "shopify"]);
    expect(childrenOf(TREE, null).map((f) => f.id)).toEqual(["personal", "work"]);
  });

  it("sorts numbers the way people count", () => {
    const numbered = ["Week 10", "Week 2", "Week 1"].map((name) => ({ id: name, name, parentId: null }));
    expect(childrenOf(numbered, null).map((f) => f.name)).toEqual(["Week 1", "Week 2", "Week 10"]);
  });
});

describe("canMoveFolder", () => {
  it("refuses to move a folder into itself", () => {
    expect(canMoveFolder(TREE, "work", "work")).toBe(false);
  });

  it("refuses to move a folder into its own descendant", () => {
    expect(canMoveFolder(TREE, "work", "shipping")).toBe(false);
  });

  it("allows moving sideways, up, and to the top level", () => {
    expect(canMoveFolder(TREE, "shipping", "personal")).toBe(true);
    expect(canMoveFolder(TREE, "shipping", "work")).toBe(true);
    expect(canMoveFolder(TREE, "shipping", null)).toBe(true);
  });

  it("refuses a parent that doesn't exist", () => {
    expect(canMoveFolder(TREE, "shipping", "nope")).toBe(false);
  });
});

describe("descendantIds", () => {
  it("includes the folder and everything below it", () => {
    expect([...descendantIds(TREE, "work")].sort()).toEqual(["reading", "shipping", "shopify", "work"]);
  });

  it("terminates on corrupt data that loops", () => {
    const loop = [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ];
    expect([...descendantIds(loop, "a")].sort()).toEqual(["a", "b"]);
    expect(folderPath(loop, "a")).toHaveLength(2);
  });
});

describe("folderPath", () => {
  it("names the folders from the top down", () => {
    expect(folderPath(TREE, "shipping")).toEqual(["Work", "Shopify", "Shipping"]);
    expect(folderPath(TREE, null)).toEqual([]);
  });
});

describe("flattenTree", () => {
  it("lists every folder depth-first with its depth", () => {
    expect(flattenTree(TREE).map(({ folder, depth }) => `${depth}:${folder.id}`)).toEqual([
      "0:personal",
      "0:work",
      "1:reading",
      "1:shopify",
      "2:shipping",
    ]);
  });
});

describe("cleanFolderName", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanFolderName("  Work   stuff ")).toBe("Work stuff");
  });

  it("rejects blanks and non-strings", () => {
    expect(cleanFolderName("   ")).toBeNull();
    expect(cleanFolderName(undefined)).toBeNull();
  });
});
