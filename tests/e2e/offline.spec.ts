import { expect, test } from "@playwright/test";

test("production PWA reloads offline with every workflow available", async ({ context, page }) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("ComicAPNG Web").first()).toBeVisible();
  await expect(page.locator('[data-testid="nav-create"]:visible')).toBeVisible();
  await expect(page.locator('[data-testid="nav-extract"]:visible')).toBeVisible();
  await expect(page.locator('[data-testid="nav-read"]:visible')).toBeVisible();
  await context.setOffline(false);
});
