import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/studio", async (route, request) => {
    if (request.method() === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ settings: { version: 1, gateway: null, layouts: {} } }),
      });
      return;
    }
    if (request.method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ settings: { version: 1, gateway: null, layouts: {} } }),
    });
  });
});

test("empty canvas shows zero agents when disconnected", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Agents (0)").first()).toBeVisible();
  await expect(page.locator("[data-tile]")).toHaveCount(0);
});
