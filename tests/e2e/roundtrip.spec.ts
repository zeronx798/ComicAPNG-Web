import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { expect, test } from "@playwright/test";
import { inspectApng } from "../../src/core/apng/inspect";
import { decodeFullCanvasFrames, makePng, pixel } from "./fixtures";

test("create, extract, and read complete a fixed-canvas round trip", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.locator('.create-feature input[type="file"]').setInputFiles([
    { name: "10.png", mimeType: "image/png", buffer: makePng(2, 4, [220, 20, 30, 255]) },
    { name: "2.png", mimeType: "image/png", buffer: makePng(4, 2, [20, 220, 30, 128]) },
  ]);
  await expect(page.locator(".page-card")).toHaveCount(2);
  await page.locator(".page-card").nth(1).click();
  await page.getByRole("button", { name: "Set as cover" }).click();
  await page.locator("#cover-duration").fill("3.000");
  await page.locator("#body-duration").fill("1.000");
  await page.locator(".metadata-fields summary").click();
  await page.locator("#metadata-title").fill("Round trip");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".feature-header-actions .primary").click();
  const download = await downloadPromise;
  const comicPath = await download.path();
  expect(comicPath).not.toBeNull();
  const comic = new Uint8Array(await readFile(comicPath!));
  const info = inspectApng(comic);
  expect(info).toMatchObject({ width: 4, height: 4, frameCount: 2 });
  expect(info.durationsMs).toEqual([3000, 1000]);
  expect(info.metadata.text.Title).toBe("Round trip");
  expect(info.metadata.privateMetadata).toMatchObject({
    format: "ComicAPNG",
    version: 1,
    cover_index: 0,
  });
  const frames = decodeFullCanvasFrames(comic, 4, 4);
  expect(pixel(frames[0]!, 4, 0, 2)).toEqual([0, 0, 0, 0]);
  expect(pixel(frames[0]!, 4, 1, 2)).toEqual([220, 20, 30, 255]);
  expect(pixel(frames[1]!, 4, 2, 0)).toEqual([0, 0, 0, 0]);
  const translucentPixel = pixel(frames[1]!, 4, 2, 1);
  expect([translucentPixel[0], translucentPixel[2], translucentPixel[3]]).toEqual([20, 30, 128]);
  expect(translucentPixel[1]).toBeGreaterThanOrEqual(219);
  expect(translucentPixel[1]).toBeLessThanOrEqual(220);

  await page.locator('[data-testid="nav-extract"]:visible').click();
  await page.locator('.extract-feature input[type="file"]').setInputFiles(comicPath!);
  await expect(
    page.locator(".extract-feature .detail-grid article").filter({ hasText: "Frame count" }).locator("strong"),
  ).toHaveText("2");
  const archivePromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Extract pages" }).click();
  const archiveDownload = await archivePromise;
  const archivePath = await archiveDownload.path();
  const archive = unzipSync(new Uint8Array(await readFile(archivePath!)));
  expect(Object.keys(archive).sort()).toEqual(["1.png", "2.png"]);
  expect(inspectApng(archive["1.png"]!)).toMatchObject({ width: 4, height: 4, frameCount: 1 });
  expect(inspectApng(archive["1.png"]!).metadata.text.Title).toBe("Round trip");

  await page.locator('[data-testid="nav-read"]:visible').click();
  await page.locator('.reader-feature input[type="file"]').setInputFiles(comicPath!);
  await expect(page.locator(".reader-thumbnail-list button")).toHaveCount(2);
  await expect(page.locator(".reader-counter")).toHaveText("1 / 2");
  await page.getByRole("button", { name: "Next page" }).last().click();
  await expect(page.locator(".reader-counter")).toHaveText("2 / 2");
  await page.waitForTimeout(100);
  await page.reload();
  await page.locator('[data-testid="nav-read"]:visible').click();
  await page.locator('.reader-feature input[type="file"]').setInputFiles(comicPath!);
  await expect(page.locator(".reader-counter")).toHaveText("2 / 2");
});
