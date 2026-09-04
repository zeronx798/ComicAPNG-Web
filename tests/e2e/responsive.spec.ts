import { expect, test, type Page } from "@playwright/test";
import { makeMultiPageApng, makePng } from "./fixtures";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

function overlaps(left: Box, right: Box): boolean {
  const overlapWidth =
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
  const overlapHeight =
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  return overlapWidth > 1 && overlapHeight > 1;
}

async function openReader(page: Page): Promise<void> {
  await page.goto("./");
  await page.locator('[data-testid="nav-read"]:visible').click();
  await page.locator('.reader-feature input[type="file"]').setInputFiles({
    name: "layout-pages.apng",
    mimeType: "image/png",
    buffer: makeMultiPageApng(8),
  });
  await expect(page.locator(".reader-workspace")).toBeVisible();
}

const modeExamples = [
  { viewport: { width: 390, height: 844 }, mode: "compact" },
  { viewport: { width: 430, height: 932 }, mode: "compact" },
  { viewport: { width: 768, height: 1024 }, mode: "comfortable" },
  { viewport: { width: 1024, height: 1366 }, mode: "expanded" },
  { viewport: { width: 1366, height: 1024 }, mode: "expanded" },
] as const;

for (const { viewport, mode } of modeExamples) {
  test(`${viewport.width}x${viewport.height} selects ${mode} layout`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("./");
    await expect(page.locator(".app-shell")).toHaveAttribute("data-layout", mode);
  });
}

test("an arbitrary tall viewport is classified by available composition space", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1400 });
  await page.goto("./");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-layout", "comfortable");
  await expect(page.locator(".sidebar-navigation")).toBeVisible();
  await expect(page.locator(".top-app-bar")).toBeHidden();
  await expect(page.locator(".bottom-navigation")).toBeHidden();
});

test("resizing updates the single root layout identity", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("data-layout", "compact");

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(shell).toHaveAttribute("data-layout", "comfortable");

  await page.setViewportSize({ width: 1024, height: 1366 });
  await expect(shell).toHaveAttribute("data-layout", "expanded");

  await page.setViewportSize({ width: 1366, height: 500 });
  await expect(shell).toHaveAttribute("data-layout", "comfortable");
});

test("Create settings remain accessible in every layout composition", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("./");
  await page.getByRole("button", { name: "Open export settings" }).click();
  const inspector = page.locator(".creator-inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveAttribute("data-presentation", "sheet");
  await expectInsideViewport(page, ".creator-inspector");

  await page.setViewportSize({ width: 900, height: 1400 });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-layout", "comfortable");
  await expect(inspector).toHaveAttribute("data-presentation", "collapsible");
  const comfortableContent = await page.locator(".creator-content").boundingBox();
  const comfortableInspector = await inspector.boundingBox();
  expect(comfortableContent).not.toBeNull();
  expect(comfortableInspector).not.toBeNull();
  expect(overlaps(comfortableContent!, comfortableInspector!)).toBe(false);

  await page.getByRole("button", { name: "Close" }).click();
  await expect(inspector).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(inspector).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 1366 });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-layout", "expanded");
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveAttribute("data-presentation", "persistent");
  await expect(page.locator(".creator-settings-toggle")).toHaveCount(0);
});

test("compact Create keeps explicit selection controls reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.locator('.create-feature input[type="file"]').setInputFiles([
    { name: "10.png", mimeType: "image/png", buffer: makePng(2, 4, [220, 20, 30, 255]) },
    { name: "2.png", mimeType: "image/png", buffer: makePng(4, 2, [20, 220, 30, 255]) },
  ]);
  await expect(page.locator(".page-card")).toHaveCount(2);
  await expect(page.locator(".page-name").first()).toHaveText("2.png");
  await page.locator(".creator-compact-actions").getByText("Select", { exact: true }).click();
  await page.locator(".page-card").first().click();
  await expect(page.locator(".selection-toolbar")).toBeVisible();
  await expect(page.locator(".selection-toolbar strong")).toContainText("1 selected");
  await expectInsideViewport(page, ".creator-compact-actions");
});

for (const example of [
  { viewport: { width: 390, height: 844 }, mode: "compact", presentation: "drawer" },
  {
    viewport: { width: 768, height: 1024 },
    mode: "comfortable",
    presentation: "compact-navigation",
  },
  {
    viewport: { width: 1024, height: 1366 },
    mode: "expanded",
    presentation: "persistent-navigation",
  },
] as const) {
  test(`Reader keeps navigation out of page content in ${example.mode} layout`, async ({ page }) => {
    await page.setViewportSize(example.viewport);
    await openReader(page);

    const stage = await page.getByTestId("reader-stage").boundingBox();
    const thumbnails = await page.getByTestId("reader-thumbnail-drawer").boundingBox();
    const toolbar = await page.locator(".reader-toolbar").boundingBox();
    const image = await page.locator(".reader-image").boundingBox();
    expect(stage).not.toBeNull();
    expect(thumbnails).not.toBeNull();
    expect(toolbar).not.toBeNull();
    expect(image).not.toBeNull();
    expect(overlaps(stage!, thumbnails!)).toBe(false);
    expect(overlaps(stage!, toolbar!)).toBe(false);
    expect(overlaps(thumbnails!, toolbar!)).toBe(false);
    await expect(page.getByTestId("reader-thumbnail-drawer")).toHaveAttribute(
      "data-presentation",
      example.presentation,
    );
    expect(image!.x).toBeGreaterThanOrEqual(stage!.x);
    expect(image!.y).toBeGreaterThanOrEqual(stage!.y);
    expect(image!.x + image!.width).toBeLessThanOrEqual(stage!.x + stage!.width + 1);
    expect(image!.y + image!.height).toBeLessThanOrEqual(stage!.y + stage!.height + 1);

    if (example.mode === "compact") {
      await page.getByTestId("reader-drawer-toggle").click();
      await expect(page.getByTestId("reader-thumbnail-drawer")).toHaveAttribute(
        "data-open",
        "true",
      );
      await expect
        .poll(async () => {
          const openStage = await page.getByTestId("reader-stage").boundingBox();
          const openThumbnails = await page.getByTestId("reader-thumbnail-drawer").boundingBox();
          if (!openStage || !openThumbnails) return true;
          return overlaps(openStage, openThumbnails);
        })
        .toBe(false);
    }
  });
}
