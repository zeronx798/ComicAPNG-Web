import { expect, test, type Page } from "@playwright/test";
import { makeMultiPageApng } from "./fixtures";

async function expectActiveThumbnailVisible(page: Page): Promise<void> {
  await expect.poll(async () => page.locator(".reader-thumbnail-list").evaluate((container) => {
    const active = container.querySelector<HTMLButtonElement>('button[aria-current="page"]');
    if (!active) return false;
    const viewport = container.getBoundingClientRect();
    const thumbnail = active.getBoundingClientRect();
    const tolerance = 1;
    return (
      thumbnail.top >= viewport.top - tolerance &&
      thumbnail.bottom <= viewport.bottom + tolerance &&
      thumbnail.left >= viewport.left - tolerance &&
      thumbnail.right <= viewport.right + tolerance
    );
  })).toBe(true);
}

test("reader thumbnail rail follows navigation and resets for a reopened comic", async ({ page }) => {
  const comic = makeMultiPageApng();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.locator('[data-testid="nav-read"]:visible').click();
  const input = page.locator('.reader-feature input[type="file"]');
  await input.setInputFiles({
    name: "many-pages.apng",
    mimeType: "image/png",
    buffer: comic,
  });

  const thumbnailList = page.locator(".reader-thumbnail-list");
  await expect(thumbnailList.locator("button")).toHaveCount(24);
  await expect(page.locator(".reader-counter")).toHaveText("1 / 24");
  await expectActiveThumbnailVisible(page);

  for (let index = 0; index < 8; index += 1) await page.keyboard.press("ArrowRight");
  await expect(page.locator(".reader-counter")).toHaveText("9 / 24");
  await expectActiveThumbnailVisible(page);
  const firstDownwardPosition = await thumbnailList.evaluate((element) => element.scrollTop);
  expect(firstDownwardPosition).toBeGreaterThan(0);

  for (let index = 0; index < 9; index += 1) await page.keyboard.press("ArrowRight");
  await expect(page.locator(".reader-counter")).toHaveText("18 / 24");
  await expectActiveThumbnailVisible(page);
  const secondDownwardPosition = await thumbnailList.evaluate((element) => element.scrollTop);
  expect(secondDownwardPosition).toBeGreaterThan(firstDownwardPosition);

  for (let index = 0; index < 13; index += 1) await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".reader-counter")).toHaveText("5 / 24");
  await expectActiveThumbnailVisible(page);
  const upwardPosition = await thumbnailList.evaluate((element) => element.scrollTop);
  expect(upwardPosition).toBeLessThan(secondDownwardPosition);

  await thumbnailList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const manualPosition = await thumbnailList.evaluate((element) => element.scrollTop);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(() => thumbnailList.evaluate((element) => element.scrollTop)).toBe(manualPosition);

  await page.locator(".page-jump input").fill("20");
  await expect(page.locator(".reader-counter")).toHaveText("20 / 24");
  await expectActiveThumbnailVisible(page);

  await page.reload();
  await page.locator('[data-testid="nav-read"]:visible').click();
  await page.locator('.reader-feature input[type="file"]').setInputFiles({
    name: "many-pages.apng",
    mimeType: "image/png",
    buffer: comic,
  });
  await expect(page.locator(".reader-counter")).toHaveText("1 / 24");
  await expectActiveThumbnailVisible(page);
});
