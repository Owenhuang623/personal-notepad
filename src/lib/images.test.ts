import { describe, expect, it } from "vitest";

import { imageExtension, imageUrl, referencedImageIds, sniffImageType } from "./images";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);

describe("sniffImageType", () => {
  it("recognises the four accepted formats by their first bytes", () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("image/gif");
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });

  it("refuses SVG, HTML and anything else, whatever it claims to be", () => {
    const text = (s: string) => new TextEncoder().encode(s);
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImageType(text("<!doctype html><script></script>"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
    // RIFF but not WEBP (a WAV file, say)
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toBeNull();
  });
});

describe("referencedImageIds", () => {
  it("finds every stored image a note uses, once each", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const text = `![a](${imageUrl(id)})\n![b](${imageUrl(id)}) and ![c](https://example.com/x.png)`;
    expect(referencedImageIds(text)).toEqual([id]);
  });
});

describe("imageExtension", () => {
  it("names files by type", () => {
    expect(imageExtension("image/webp")).toBe("webp");
    expect(imageExtension("image/jpeg")).toBe("jpg");
  });
});
