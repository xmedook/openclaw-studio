import { expect, test } from "@playwright/test";

test("connection settings persist to the studio settings API", async ({ page }) => {
  let lastPayload: Record<string, unknown> | null = null;

  await page.route("**/api/studio", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ settings: { version: 1, gateway: null, layouts: {} } }),
      });
      return;
    }
    if (request.method() === "PUT") {
      lastPayload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ settings: { version: 1, gateway: lastPayload.gateway, layouts: {} } }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/");

  await page.getByLabel("Gateway URL").fill("ws://gateway.example:18789");
  await page.getByLabel("Token").fill("token-123");

  await page.waitForRequest((req) => req.url().includes("/api/studio") && req.method() === "PUT");

  expect(lastPayload).not.toBeNull();
  if (!lastPayload) {
    throw new Error("Expected settings payload to be captured.");
  }
  const gateway = (lastPayload["gateway"] ?? {}) as { url?: string; token?: string };
  expect(gateway.url).toBe("ws://gateway.example:18789");
  expect(gateway.token).toBe("token-123");
  await expect(page.getByRole("button", { name: "Connect" })).toBeEnabled();
});
