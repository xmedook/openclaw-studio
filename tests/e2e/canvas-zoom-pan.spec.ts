import { expect, test } from "@playwright/test";

const store = {
  version: 3,
  activeProjectId: "project-1",
  projects: [
    {
      id: "project-1",
      name: "Demo Workspace",
      repoPath: "/Users/demo",
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
      tiles: [
        {
          id: "tile-1",
          name: "Agent A",
          agentId: "main",
          role: "coding",
          sessionKey: "agent:main:studio:tile-1",
          workspacePath: "/Users/demo",
          archivedAt: null,
          model: null,
          thinkingLevel: "low",
          position: { x: 400, y: 300 },
          size: { width: 560, height: 440 },
        },
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/projects", async (route, request) => {
    if (request.method() !== "GET" && request.method() !== "PUT") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(store),
    });
  });
});

test("wheel zoom updates zoom readout", async ({ page }) => {
  await page.goto("/");

  const pane = page.locator(".react-flow__pane");
  await expect(pane).toBeVisible();

  const zoomReadout = page.locator("[data-zoom-readout]");
  await expect(zoomReadout).toBeVisible();
  const beforeText = (await zoomReadout.textContent()) ?? "";

  const box = await pane.boundingBox();
  expect(box).not.toBeNull();
  const clientX = box!.x + box!.width / 2;
  const clientY = box!.y + box!.height / 2;

  await page.dispatchEvent(".react-flow__pane", "wheel", {
    deltaY: 240,
    deltaMode: 0,
    clientX,
    clientY,
  });

  await expect(zoomReadout).not.toHaveText(beforeText);
});

test("wheel changes tile bounds on the canvas", async ({ page }) => {
  await page.goto("/");

  const pane = page.locator(".react-flow__pane");
  await expect(pane).toBeVisible();

  const tile = page.locator("[data-tile]");
  await expect(tile).toBeVisible();

  const beforeBox = await tile.boundingBox();
  expect(beforeBox).not.toBeNull();
  const beforeWidth = beforeBox!.width;

  const paneBox = await pane.boundingBox();
  expect(paneBox).not.toBeNull();
  const clientX = paneBox!.x + paneBox!.width / 2;
  const clientY = paneBox!.y + paneBox!.height / 2;

  await page.dispatchEvent(".react-flow__pane", "wheel", {
    deltaY: 240,
    deltaMode: 0,
    clientX,
    clientY,
  });

  await page.waitForFunction(
    ({ selector, previousWidth }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return Math.abs(rect.width - previousWidth) > 0.5;
    },
    { selector: "[data-tile]", previousWidth: beforeWidth }
  );
});

test("pan-drag-shifts-tiles", async ({ page }) => {
  await page.goto("/");

  const pane = page.locator(".react-flow__pane");
  await expect(pane).toBeVisible();

  const tile = page.locator("[data-tile]");
  await expect(tile).toBeVisible();

  const beforeBox = await tile.boundingBox();
  expect(beforeBox).not.toBeNull();

  const paneBox = await pane.boundingBox();
  expect(paneBox).not.toBeNull();

  const startX = paneBox!.x + 40;
  const startY = paneBox!.y + 40;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 160, startY + 120, { steps: 10 });
  await page.mouse.up();

  await page.waitForFunction(
    ({ selector, startX, startY }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return Math.abs(rect.x - startX) > 5 || Math.abs(rect.y - startY) > 5;
    },
    { selector: "[data-tile]", startX: beforeBox!.x, startY: beforeBox!.y }
  );
});

test("resize-handle-updates-tile-size", async ({ page }) => {
  await page.goto("/");

  const tile = page.locator("[data-tile]");
  await expect(tile).toBeVisible();
  await tile.click();

  const handle = page.locator(".tile-resize-handle.bottom.right");
  await expect(handle).toBeVisible();

  const beforeBox = await tile.boundingBox();
  expect(beforeBox).not.toBeNull();

  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();

  const startX = handleBox!.x + handleBox!.width / 2;
  const startY = handleBox!.y + handleBox!.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY + 100, { steps: 10 });
  await page.mouse.up();

  await page.waitForFunction(
    ({ selector, previousWidth, previousHeight }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > previousWidth + 10 && rect.height > previousHeight + 10;
    },
    {
      selector: "[data-tile]",
      previousWidth: beforeBox!.width,
      previousHeight: beforeBox!.height,
    }
  );
});
