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
          size: { width: 420, height: 520 },
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

test("new agent tile shows avatar and input with inspect panel", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByAltText("Avatar for Agent A")).toBeVisible();
  await expect(page.getByPlaceholder(/type a message/i)).toBeVisible();
  await expect(page.getByTestId("agent-inspect-panel")).toHaveCount(0);

  await page.getByTestId("agent-inspect-toggle").click();
  await expect(page.getByTestId("agent-inspect-panel")).toBeVisible();
  await expect(page.getByTestId("agent-inspect-settings")).toContainText("Model");
  await expect(page.getByTestId("agent-inspect-settings")).toContainText("Thinking");
  await expect(page.getByTestId("agent-inspect-files")).toBeVisible();
});
