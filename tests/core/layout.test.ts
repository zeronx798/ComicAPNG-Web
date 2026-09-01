import { describe, expect, it } from "vitest";
import { calculateCanvas, calculateFit } from "../../src/core/image/layout";

describe("fixed canvas layout", () => {
  it("uses the largest independent source dimensions", () => {
    expect(calculateCanvas([[100, 200], [300, 80]])).toEqual([300, 200]);
  });

  it("enlarges proportionally and centers transparent space", () => {
    expect(calculateFit([20, 40], [100, 100])).toEqual({
      sourceWidth: 20,
      sourceHeight: 40,
      renderWidth: 50,
      renderHeight: 100,
      offsetX: 25,
      offsetY: 0,
    });
  });

  it("never crops or stretches a page", () => {
    const layout = calculateFit([17, 31], [100, 80]);
    expect(layout.renderWidth).toBeLessThanOrEqual(100);
    expect(layout.renderHeight).toBeLessThanOrEqual(80);
    expect(Math.abs(layout.renderWidth / layout.renderHeight - 17 / 31)).toBeLessThan(0.01);
  });
});
