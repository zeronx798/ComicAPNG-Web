import { expect, test, type Page } from "@playwright/test";
import { makeApng, makePng } from "./fixtures";

async function expectInsideViewport(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

test("desktop 1440x900 keeps the full navigation and creator inspector", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(page.locator(".desktop-sidebar")).toBeVisible();
  await expect(page.locator(".mobile-navigation")).toBeHidden();
  await expect(page.locator(".creator-inspector")).toBeVisible();
  await expectInsideViewport(page, ".create-feature .feature-header");
});

test("tablet landscape 1024x768 uses compact side navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("./");
  const sidebar = page.locator(".desktop-sidebar");
  await expect(sidebar).toBeVisible();
  expect((await sidebar.boundingBox())?.width).toBeLessThan(100);
  await expect(page.locator(".creator-inspector")).toBeVisible();
  await expectInsideViewport(page, ".creator-layout");
});

test("tablet portrait 768x1024 switches to app bar and bottom navigation", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("./");
  await expect(page.locator(".desktop-sidebar")).toBeHidden();
  await expect(page.locator(".mobile-app-bar")).toBeVisible();
  await expect(page.locator(".mobile-navigation")).toBeVisible();
  await expectInsideViewport(page, ".creator-content");
});

test("phone portrait 390x844 supports explicit creator selection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.locator('.create-feature input[type="file"]').setInputFiles([
    { name: "10.png", mimeType: "image/png", buffer: makePng(2, 4, [220, 20, 30, 255]) },
    { name: "2.png", mimeType: "image/png", buffer: makePng(4, 2, [20, 220, 30, 255]) },
  ]);
  await expect(page.locator(".page-card")).toHaveCount(2);
  await expect(page.locator(".page-name").first()).toHaveText("2.png");
  await page.locator(".creator-mobile-actions").getByText("Select", { exact: true }).click();
  await page.locator(".page-card").first().click();
  await expect(page.locator(".selection-toolbar")).toBeVisible();
  await expect(page.locator(".selection-toolbar strong")).toContainText("1 selected");
  await expectInsideViewport(page, ".creator-mobile-actions");
});

test("phone landscape 844x390 prioritizes reader content and reachable controls", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("./");
  await page.locator('[data-testid="nav-read"]:visible').click();
  await page.locator('.reader-feature input[type="file"]').setInputFiles({
    name: "reader.apng",
    mimeType: "image/png",
    buffer: makeApng(),
  });
  await expect(page.locator(".reader-workspace")).toBeVisible();
  await expect(page.locator(".mobile-app-bar")).toBeHidden();
  await expect(page.locator(".mobile-navigation")).toBeHidden();
  const stage = await page.getByTestId("reader-stage").boundingBox();
  expect(stage?.height).toBeGreaterThan(250);
  await expectInsideViewport(page, ".reader-toolbar");
});
