import { describe, expect, it } from "vitest";
import {
  LAYOUT_THRESHOLDS,
  classifyLayout,
  type LayoutMode,
  type ViewportSize,
} from "../../src/layouts/LayoutMode";

const examples: Array<[ViewportSize, LayoutMode]> = [
  [{ width: 390, height: 844 }, "compact"],
  [{ width: 430, height: 932 }, "compact"],
  [{ width: 768, height: 1024 }, "comfortable"],
  [{ width: 1024, height: 1366 }, "expanded"],
  [{ width: 1366, height: 1024 }, "expanded"],
  [{ width: 900, height: 1400 }, "comfortable"],
];

describe("layout mode classifier", () => {
  it.each(examples)("classifies %o as %s", (viewport, expected) => {
    expect(classifyLayout(viewport)).toBe(expected);
  });

  it("uses composition boundaries rather than orientation", () => {
    expect(
      classifyLayout({
        width: LAYOUT_THRESHOLDS.comfortableWidth - 1,
        height: 1600,
      }),
    ).toBe("compact");
    expect(
      classifyLayout({
        width: LAYOUT_THRESHOLDS.comfortableWidth,
        height: 1600,
      }),
    ).toBe("comfortable");
    expect(
      classifyLayout({
        width: LAYOUT_THRESHOLDS.expandedWidth,
        height: LAYOUT_THRESHOLDS.expandedHeight - 1,
      }),
    ).toBe("comfortable");
    expect(
      classifyLayout({
        width: LAYOUT_THRESHOLDS.expandedWidth,
        height: LAYOUT_THRESHOLDS.expandedHeight,
      }),
    ).toBe("expanded");
  });
});
