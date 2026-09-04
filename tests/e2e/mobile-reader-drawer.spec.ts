import { expect, test, type Page } from "@playwright/test";
import { makeMultiPageApng } from "./fixtures";

interface Geometry {
  stage: NonNullable<Awaited<ReturnType<ReturnType<Page["locator"]>["boundingBox"]>>>;
  drawer: NonNullable<Awaited<ReturnType<ReturnType<Page["locator"]>["boundingBox"]>>>;
  toolbar: NonNullable<Awaited<ReturnType<ReturnType<Page["locator"]>["boundingBox"]>>>;
  image: NonNullable<Awaited<ReturnType<ReturnType<Page["locator"]>["boundingBox"]>>>;
}

async function geometry(page: Page): Promise<Geometry> {
  const [stage, drawer, toolbar, image] = await Promise.all([
    page.getByTestId("reader-stage").boundingBox(),
    page.getByTestId("reader-thumbnail-drawer").boundingBox(),
    page.locator(".reader-toolbar").boundingBox(),
    page.locator(".reader-image").boundingBox(),
  ]);
  if (!stage || !drawer || !toolbar || !image) throw new Error("Reader geometry is unavailable");
  return { stage, drawer, toolbar, image };
}

function expectStacked(value: Geometry): void {
  expect(value.stage.y + value.stage.height).toBeLessThanOrEqual(value.drawer.y + 1);
  expect(value.drawer.y + value.drawer.height).toBeLessThanOrEqual(value.toolbar.y + 1);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`phone portrait ${viewport.width}x${viewport.height} uses a resizing thumbnail drawer`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("./");
    await page.locator('[data-testid="nav-read"]:visible').click();
    await page.locator('.reader-feature input[type="file"]').setInputFiles({
      name: "drawer-pages.apng",
      mimeType: "image/png",
      buffer: makeMultiPageApng(12),
    });

    const drawer = page.getByTestId("reader-thumbnail-drawer");
    const toggle = page.getByTestId("reader-drawer-toggle");
    const list = page.locator(".reader-thumbnail-list");
    await expect(list.locator("button")).toHaveCount(12);
    await expect(drawer).toHaveAttribute("data-open", "false");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    expect(await toggle.textContent()).toBe("");

    const closed = await geometry(page);
    expect(closed.drawer.height).toBeGreaterThanOrEqual(43);
    expect(closed.drawer.height).toBeLessThanOrEqual(45);
    expectStacked(closed);

    await toggle.click();
    await expect(drawer).toHaveAttribute("data-open", "true");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(list).toBeVisible();
    await expect.poll(async () => (await geometry(page)).stage.height).toBeLessThan(
      closed.stage.height - 100,
    );
    const opened = await geometry(page);
    expect(opened.drawer.height).toBeGreaterThanOrEqual(183);
    expect(opened.image.height).toBeLessThan(closed.image.height - 100);
    expectStacked(opened);

    await list.locator("button").nth(7).click();
    await expect(page.locator(".reader-counter")).toHaveText("8 / 12");
    await expect(drawer).toHaveAttribute("data-open", "true");
    const scroll = await list.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
      return {
        left: element.scrollLeft,
        top: element.scrollTop,
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
      };
    });
    expect(scroll.scrollWidth).toBeGreaterThan(scroll.width);
    expect(scroll.left).toBeGreaterThan(0);
    expect(scroll.top).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await toggle.click();
    await expect(drawer).toHaveAttribute("data-open", "false");
    await expect(list).toBeHidden();
    await expect.poll(async () => (await geometry(page)).stage.height).toBeCloseTo(
      closed.stage.height,
      0,
    );

    await toggle.click();
    await expect(drawer).toHaveAttribute("data-open", "true");
    await page.waitForTimeout(1800);
    await list.evaluate((element) => {
      element.scrollLeft = 0;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForTimeout(1800);
    await expect(drawer).toHaveAttribute("data-open", "true");
    await expect.poll(
      async () => drawer.getAttribute("data-open"),
      { timeout: 5000 },
    ).toBe("false");
    await expect(list).toBeHidden();
    await expect.poll(async () => (await geometry(page)).stage.height).toBeCloseTo(
      closed.stage.height,
      0,
    );
  });
}
