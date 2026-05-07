import { test, expect } from "@playwright/test"

test("app loads and shows AstroLaunch title", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveTitle(/AstroLaunch/i)
})

test("editor area is visible", async ({ page }) => {
  await page.goto("/")
  // The main editor placeholder or monaco should be present
  await expect(page.locator("text=AstroLaunch Editor").or(page.locator(".monaco-editor"))).toBeVisible({ timeout: 10_000 })
})
