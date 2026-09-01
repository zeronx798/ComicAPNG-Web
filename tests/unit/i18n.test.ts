import { describe, expect, it } from "vitest";
import en from "../../src/i18n/en.json";
import zhCn from "../../src/i18n/zh-CN.json";

describe("localization resources", () => {
  it("keeps English and Simplified Chinese key sets identical", () => {
    expect(Object.keys(zhCn).sort()).toEqual(Object.keys(en).sort());
  });

  it("contains no empty translations", () => {
    expect(Object.values(en).every(Boolean)).toBe(true);
    expect(Object.values(zhCn).every(Boolean)).toBe(true);
  });
});
