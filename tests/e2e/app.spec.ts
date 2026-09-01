import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { inspectApng } from "../../src/core/apng/inspect";
import { makeApng, makePng } from "./fixtures";

test("@smoke application shell exposes all local workflows", async ({ page }) => {
  const buildInfo = JSON.parse(await readFile("dist/version.json", "utf8")) as {
    version: string;
  };
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Create APNG Comic" })).toBeVisible();
  await page.locator('[data-testid="nav-extract"]:visible').click();
  await expect(page.getByRole("heading", { name: "Extract APNG Comic" })).toBeVisible();
  await page.locator('[data-testid="nav-read"]:visible').click();
  await expect(page.getByRole("heading", { name: "Read APNG Comic" })).toBeVisible();
  await expect(page.getByText("Local only").first()).toBeVisible();
  await page.locator(".desktop-sidebar .sidebar-footer button").click();
  await expect(page.getByTestId("app-version")).toHaveText(buildInfo.version);
});

test("@smoke image import, export, and APNG reading use browser-local codecs", async ({ page }) => {
  await page.goto("./");
  await page.locator('.create-feature input[type="file"]').setInputFiles({
    name: "page.png",
    mimeType: "image/png",
    buffer: makePng(3, 5, [40, 80, 210, 255]),
  });
  await expect(page.locator(".page-card")).toHaveCount(1);
  const exportPromise = page.waitForEvent("download");
  await page.locator(".create-feature .feature-header-actions .primary").click();
  const exportPath = await (await exportPromise).path();
  expect(inspectApng(new Uint8Array(await readFile(exportPath!)))).toMatchObject({
    width: 3,
    height: 5,
    frameCount: 1,
  });
  await page.locator('[data-testid="nav-read"]:visible').click();
  await page.locator('.reader-feature input[type="file"]').setInputFiles({
    name: "smoke.apng",
    mimeType: "image/png",
    buffer: makeApng(),
  });
  await expect(page.locator(".reader-workspace")).toBeVisible();
  await expect(page.locator(".reader-counter")).toHaveText("1 / 2");
});
