import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  ZipImportError,
  readZipArchive,
} from "../../src/core/archive/zipImport";

function bytes(value: number): Uint8Array {
  return new Uint8Array([value]);
}

function metadata(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value));
}

function replaceAscii(value: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error("Replacement names must have equal length");
  const result = value.slice();
  const source = strToU8(from);
  const target = strToU8(to);
  for (let offset = 0; offset <= result.length - source.length; offset += 1) {
    if (source.every((item, index) => result[offset + index] === item)) {
      result.set(target, offset);
    }
  }
  return result;
}

function markEncrypted(value: Uint8Array): Uint8Array {
  const result = value.slice();
  for (let offset = 0; offset <= result.length - 4; offset += 1) {
    const signature =
      result[offset]! |
      (result[offset + 1]! << 8) |
      (result[offset + 2]! << 16) |
      (result[offset + 3]! << 24);
    if (signature === 0x04034b50) result[offset + 6] = result[offset + 6]! | 1;
    if (signature === 0x02014b50) result[offset + 8] = result[offset + 8]! | 1;
  }
  return result;
}

describe("ZIP import", () => {
  it("imports supported images in natural order without metadata", () => {
    const archive = zipSync({
      "10.png": bytes(10),
      "2.webp": bytes(2),
      "1.jpg": bytes(1),
      "README.txt": strToU8("ignored"),
    });
    const result = readZipArchive(archive);
    expect(result.metadataStatus).toBe("absent");
    expect(result.pages.map((page) => page.name)).toEqual(["1.jpg", "2.webp", "10.png"]);
    expect(result.pages.map((page) => page.isCover)).toEqual([true, false, false]);
  });

  it("uses exact metadata bindings, order, timing, cover, and book settings", () => {
    const archive = zipSync({
      "1.png": bytes(1),
      "2.webp": bytes(2),
      "metadata.json": metadata({
        format: "ComicAPNG",
        version: 1,
        book: {
          reading_direction: "rtl",
          cover_duration_ms: 2400,
          body_duration_ms: 800,
          text: { Title: "Archive title", Author: "Archive author" },
        },
        pages: [
          { filename: "2.webp", source_width: 20, source_height: 10, duration_ms: 222 },
          { filename: "1.png", source_width: 10, source_height: 20, duration_ms: 111 },
        ],
        cover: "1.png",
      }),
    });
    const result = readZipArchive(archive);
    expect(result.metadataStatus).toBe("valid");
    expect(result.pages.map((page) => page.name)).toEqual(["2.webp", "1.png"]);
    expect(result.pages.map((page) => page.durationMs)).toEqual([222, 111]);
    expect(result.pages.map((page) => page.isCover)).toEqual([false, true]);
    expect(result.settings).toEqual({
      readingDirection: "rtl",
      coverDurationMs: 2400,
      bodyDurationMs: 800,
      title: "Archive title",
      author: "Archive author",
    });
  });

  it("drops every page binding when metadata does not match all images", () => {
    const archive = zipSync({
      "1.png": bytes(1),
      "2.png": bytes(2),
      "metadata.json": metadata({
        format: "ComicAPNG",
        version: 1,
        book: { reading_direction: "rtl", text: { Title: "Untrusted" } },
        pages: [{ filename: "1.png", duration_ms: 777 }],
        cover: "1.png",
      }),
    });
    const result = readZipArchive(archive);
    expect(result.metadataStatus).toBe("mismatch");
    expect(result.pages.map((page) => page.name)).toEqual(["1.png", "2.png"]);
    expect(result.pages.map((page) => page.durationMs)).toEqual([undefined, undefined]);
    expect(result.pages.map((page) => page.isCover)).toEqual([true, false]);
    expect(result.settings).toBeUndefined();
  });

  it("imports images without malformed metadata", () => {
    const archive = zipSync({
      "page.png": bytes(1),
      "metadata.json": strToU8("{invalid"),
    });
    const result = readZipArchive(archive);
    expect(result.metadataStatus).toBe("malformed");
    expect(result.pages).toHaveLength(1);
    expect(result.settings).toBeUndefined();
  });

  it.each(["../page.png", "/page.png", "C:/page.png", "..\\page.png"])(
    "rejects unsafe entry path %s",
    (name) => {
      const archive = zipSync({ [name]: bytes(1), "safe.png": bytes(2) });
      expect(() => readZipArchive(archive)).toThrowError(
        expect.objectContaining<Partial<ZipImportError>>({ code: "archive.unsafe_path" }),
      );
    },
  );

  it("rejects duplicate filenames before extraction", () => {
    const archive = replaceAscii(
      zipSync({ "one.png": bytes(1), "two.png": bytes(2) }, { level: 0 }),
      "two.png",
      "one.png",
    );
    expect(() => readZipArchive(archive)).toThrowError(
      expect.objectContaining<Partial<ZipImportError>>({ code: "archive.duplicate_name" }),
    );
  });

  it("rejects encrypted image entries before extraction", () => {
    const archive = markEncrypted(zipSync({ "page.png": bytes(1) }, { level: 0 }));
    expect(() => readZipArchive(archive)).toThrowError(
      expect.objectContaining<Partial<ZipImportError>>({ code: "archive.encrypted" }),
    );
  });
});
