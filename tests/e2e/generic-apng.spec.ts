import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { expect, test } from "@playwright/test";
import { inspectApng } from "../../src/core/apng/inspect";
import { decodeStaticPng, makeGenericPartialApng, pixel } from "./fixtures";

test("@smoke extract composites generic partial frames without private metadata", async ({ page }) => {
  await page.goto("./");
  await page.locator('[data-testid="nav-extract"]:visible').click();
  const input = makeGenericPartialApng();
  expect(inspectApng(input).metadata.privateMetadata).toEqual({});
  await page.locator('.extract-feature input[type="file"]').setInputFiles({
    name: "generic.apng",
    mimeType: "image/png",
    buffer: input,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Extract pages" }).click();
  const archivePath = await (await downloadPromise).path();
  const archive = unzipSync(new Uint8Array(await readFile(archivePath!)));
  expect(Object.keys(archive).sort()).toEqual(["1.png", "2.png", "3.png"]);

  const second = decodeStaticPng(archive["2.png"]!);
  expect(pixel(second.rgba, second.width, 0, 0)).toEqual([200, 20, 30, 255]);
  expect(pixel(second.rgba, second.width, 1, 1)).toEqual([20, 210, 40, 255]);

  const third = decodeStaticPng(archive["3.png"]!);
  expect(pixel(third.rgba, third.width, 0, 0)).toEqual([30, 50, 220, 255]);
  expect(pixel(third.rgba, third.width, 1, 1)).toEqual([0, 0, 0, 0]);
  expect(pixel(third.rgba, third.width, 3, 3)).toEqual([200, 20, 30, 255]);
});
