import { expect, test } from "@playwright/test";
import zhCn from "../../src/i18n/zh-CN.json" with { type: "json" };

test("runtime language can switch between English and Simplified Chinese", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Simplified Chinese" }).click();
  await expect(page.getByRole("heading", { name: zhCn["creator.title"] })).toBeVisible();
  await expect(page.locator('[data-testid="nav-extract"]:visible')).toContainText(zhCn["nav.extract"]);
  await page.getByRole("button", { name: zhCn["settings.english"] }).click();
  await expect(page.getByRole("heading", { name: "Create APNG Comic" })).toBeVisible();
});
