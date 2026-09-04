import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("responsive source architecture", () => {
  it("keeps viewport decisions out of CSS media queries", () => {
    const css = readFileSync("src/styles/global.css", "utf8");
    expect(css).not.toMatch(/@media[^{]*(width|height|orientation)/i);
  });

  it("keeps feature code free of independent media query classifiers", () => {
    const featureSources = [
      "src/features/create/CreateFeature.tsx",
      "src/features/reader/ReaderFeature.tsx",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(featureSources).not.toContain("matchMedia(");
  });
});
