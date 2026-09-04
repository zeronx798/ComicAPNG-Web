import { readFile } from "node:fs/promises";
import { strToU8, zipSync } from "fflate";
import { expect, test } from "@playwright/test";
import { inspectApng } from "../../src/core/apng/inspect";
import {
  makeApng,
  makeEditableApng,
  makePng,
  makeSingleFrameApng,
} from "./fixtures";

test("APNG import creates editable pages and preserves frame timing", async ({ page }) => {
  await page.goto("./");
  const input = page.locator('.create-feature input[type="file"]');
  await input.setInputFiles({
    name: "source.apng",
    mimeType: "image/apng",
    buffer: makeApng(),
  });
  await expect(page.locator(".page-card")).toHaveCount(2);
  await expect(page.locator(".page-name")).toHaveText(["source-1.png", "source-2.png"]);

  await page.locator(".page-card").nth(1).click();
  await page.getByRole("button", { name: "Move earlier" }).click();
  await expect(page.locator(".page-name")).toHaveText(["source-2.png", "source-1.png"]);
  await page.getByRole("button", { name: "Set as cover" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".feature-header-actions .primary").click();
  const output = await (await downloadPromise).path();
  expect(output).not.toBeNull();
  const info = inspectApng(new Uint8Array(await readFile(output!)));
  expect(info.frameCount).toBe(2);
  expect(info.durationsMs).toEqual([1000, 3000]);

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".page-card")).toHaveCount(1);
});

test("single-frame APNG import preserves its duration", async ({ page }) => {
  await page.goto("./");
  await page.locator('.create-feature input[type="file"]').setInputFiles({
    name: "single.apng",
    mimeType: "image/apng",
    buffer: makeSingleFrameApng(),
  });
  await expect(page.locator(".page-card")).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".feature-header-actions .primary").click();
  const output = await (await downloadPromise).path();
  const info = inspectApng(new Uint8Array(await readFile(output!)));
  expect(info.frameCount).toBe(1);
  expect(info.durationsMs).toEqual([640]);
});

test("ComicAPNG import restores editable geometry and metadata", async ({ page }) => {
  await page.goto("./");
  await page.locator('.create-feature input[type="file"]').setInputFiles({
    name: "editable.apng",
    mimeType: "image/apng",
    buffer: makeEditableApng(),
  });
  await expect(page.locator(".page-size")).toHaveText(["1 x 2", "3 x 1"]);
  await expect(page.locator(".page-card").nth(1).locator(".cover-badge")).toBeVisible();
  await expect(page.locator("#create-direction")).toHaveValue("rtl");
  await expect(page.locator("#cover-duration")).toHaveValue("1.800");
  await expect(page.locator("#body-duration")).toHaveValue("0.900");
  await page.locator(".metadata-fields summary").click();
  await expect(page.locator("#metadata-title")).toHaveValue("Imported APNG");
  await expect(page.locator("#metadata-author")).toHaveValue("Frame author");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".feature-header-actions .primary").click();
  const output = await (await downloadPromise).path();
  const info = inspectApng(new Uint8Array(await readFile(output!)));
  expect(info).toMatchObject({ width: 3, height: 2, frameCount: 2 });
  expect(info.durationsMs).toEqual([750, 250]);
  expect(info.metadata.privateMetadata).toMatchObject({
    cover_duration_ms: 1800,
    body_duration_ms: 900,
  });
});

test("ZIP import uses natural order when metadata is absent", async ({ page }) => {
  const archive = zipSync({
    "10.png": makePng(3, 3, [10, 20, 30, 255]),
    "2.png": makePng(3, 3, [20, 30, 40, 255]),
    "1.png": makePng(3, 3, [30, 40, 50, 255]),
    "README.txt": strToU8("ignored"),
  });
  await page.goto("./");
  await page.locator('.create-feature input[type="file"]').setInputFiles({
    name: "pages.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(archive),
  });
  await expect(page.locator(".page-name")).toHaveText(["1.png", "2.png", "10.png"]);
});

test("ZIP import restores metadata only for exact page bindings", async ({ page }) => {
  const archive = zipSync({
    "1.png": makePng(3, 5, [200, 30, 40, 255]),
    "2.webp": makePng(5, 3, [30, 200, 60, 255]),
    "metadata.json": strToU8(JSON.stringify({
      format: "ComicAPNG",
      version: 1,
      book: {
        reading_direction: "rtl",
        cover_duration_ms: 2400,
        body_duration_ms: 800,
        text: { Title: "Imported title", Author: "Imported author" },
      },
      pages: [
        { filename: "2.webp", duration_ms: 222 },
        { filename: "1.png", duration_ms: 111 },
      ],
      cover: "1.png",
    })),
  });
  await page.goto("./");
  await page.locator('.create-feature input[type="file"]').setInputFiles({
    name: "document.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(archive),
  });
  await expect(page.locator(".page-name")).toHaveText(["2.webp", "1.png"]);
  await expect(page.locator(".page-card").nth(1).locator(".cover-badge")).toBeVisible();
  await expect(page.locator("#create-direction")).toHaveValue("rtl");
  await page.locator(".metadata-fields summary").click();
  await expect(page.locator("#metadata-title")).toHaveValue("Imported title");
  await expect(page.locator("#metadata-author")).toHaveValue("Imported author");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".feature-header-actions .primary").click();
  const output = await (await downloadPromise).path();
  const info = inspectApng(new Uint8Array(await readFile(output!)));
  expect(info.durationsMs).toEqual([111, 222]);
  expect(info.metadata.text).toMatchObject({
    Title: "Imported title",
    Author: "Imported author",
  });
});

test("ZIP mismatch imports images without page metadata", async ({ page }) => {
  const archive = zipSync({
    "1.png": makePng(3, 3, [200, 30, 40, 255]),
    "2.png": makePng(3, 3, [30, 200, 60, 255]),
    "metadata.json": strToU8(JSON.stringify({
      format: "ComicAPNG",
      version: 1,
      book: { reading_direction: "rtl", text: { Title: "Untrusted" } },
      pages: [{ filename: "1.png", duration_ms: 222 }],
      cover: "1.png",
    })),
  });
  await page.goto("./");
  await page.locator('.create-feature input[type="file"]').setInputFiles({
    name: "mismatch.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(archive),
  });
  await expect(page.locator(".page-name")).toHaveText(["1.png", "2.png"]);
  await expect(page.locator(".inline-message")).toContainText(
    "ZIP metadata did not match its images",
  );
  await expect(page.locator("#create-direction")).toHaveValue("ltr");
  await page.locator(".metadata-fields summary").click();
  await expect(page.locator("#metadata-title")).toHaveValue("");
});

test("ZIP import rejects unsafe archive entries", async ({ page }) => {
  const archive = zipSync({
    "safe.png": makePng(3, 3, [20, 30, 40, 255]),
    "../outside.txt": strToU8("invalid"),
  });
  await page.goto("./");
  await page.locator('.create-feature input[type="file"]').setInputFiles({
    name: "unsafe.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(archive),
  });
  await expect(page.locator(".page-card")).toHaveCount(0);
  await expect(page.locator(".inline-message")).toContainText("could not be imported");
});
