import { describe, expect, it } from "vitest";
import { naturalSorted } from "../../src/core/comic/naturalSort";
import { pagesForExport, type ComicPage } from "../../src/core/comic/types";

function page(name: string, isCover = false): ComicPage {
  return {
    id: name,
    name,
    file: new File([], name),
    width: 10,
    height: 20,
    thumbnailUrl: "blob:test",
    isCover,
  };
}

describe("comic model", () => {
  it("sorts numeric filename runs naturally", () => {
    expect(naturalSorted([page("10.png"), page("2.png"), page("1.png")]).map((item) => item.name)).toEqual([
      "1.png",
      "2.png",
      "10.png",
    ]);
  });

  it("moves the cover to frame zero without duplicating it", () => {
    const pages = [page("one.png"), page("two.png", true), page("three.png")];
    const exported = pagesForExport(pages, 10_000, 5_000);
    expect(exported.map((item) => item.name)).toEqual(["two.png", "one.png", "three.png"]);
    expect(exported.map((item) => item.durationMs)).toEqual([10_000, 5_000, 5_000]);
  });

  it("keeps imported frame timing attached to reordered pages", () => {
    const first = { ...page("one.png"), durationMs: 125 };
    const second = { ...page("two.png", true), durationMs: 375 };
    const exported = pagesForExport([first, second], 10_000, 5_000);
    expect(exported.map((item) => item.name)).toEqual(["two.png", "one.png"]);
    expect(exported.map((item) => item.durationMs)).toEqual([375, 125]);
  });
});
