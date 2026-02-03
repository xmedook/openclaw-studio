import { expect, test } from "@playwright/test";

type StudioSettingsFixture = {
  version: 1;
  gateway: { url: string; token: string } | null;
  layouts: Record<string, unknown>;
  focused: Record<string, { mode: "focused" | "canvas"; filter: string; selectedAgentId: string | null }>;
};

const DEFAULT_SETTINGS: StudioSettingsFixture = {
  version: 1,
  gateway: null,
  layouts: {},
  focused: {},
};

const createStudioRoute = (
  initial: StudioSettingsFixture = DEFAULT_SETTINGS
) => {
  let settings: StudioSettingsFixture = {
    version: 1,
    gateway: initial.gateway ?? null,
    layouts: { ...(initial.layouts ?? {}) },
    focused: { ...(initial.focused ?? {}) },
  };
  return async (route: { fulfill: (args: Record<string, unknown>) => Promise<void>; fallback: () => Promise<void> }, request: { method: () => string; postData: () => string | null }) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ settings }),
      });
      return;
    }
    if (request.method() !== "PUT") {
      await route.fallback();
      return;
    }
    const patch = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
    const next = {
      ...settings,
    };
    if ("gateway" in patch) {
      next.gateway = (patch.gateway as StudioSettingsFixture["gateway"]) ?? null;
    }
    if (patch.layouts && typeof patch.layouts === "object") {
      next.layouts = {
        ...next.layouts,
        ...(patch.layouts as Record<string, unknown>),
      };
    }
    if (patch.focused && typeof patch.focused === "object") {
      const focusedPatch = patch.focused as Record<string, Record<string, unknown>>;
      const focusedNext = { ...next.focused };
      for (const [key, value] of Object.entries(focusedPatch)) {
        const existing = focusedNext[key] ?? {
          mode: "focused" as const,
          filter: "all",
          selectedAgentId: null,
        };
        focusedNext[key] = {
          mode: (value.mode as "focused" | "canvas") ?? existing.mode,
          filter: (value.filter as string) ?? existing.filter,
          selectedAgentId:
            "selectedAgentId" in value
              ? ((value.selectedAgentId as string | null) ?? null)
              : existing.selectedAgentId,
        };
      }
      next.focused = focusedNext;
    }
    settings = next;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ settings }),
    });
  };
};

test("switches_to_canvas_mode", async ({ page }) => {
  await page.route("**/api/studio", createStudioRoute());
  await page.goto("/");

  await page.getByTestId("view-mode-canvas").click();
  await expect(page.getByTestId("view-mode-canvas")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Clean up" })).toBeVisible();
});

test("retains_drag_capability", async ({ page }) => {
  await page.route("**/api/studio", createStudioRoute());
  await page.goto("/");

  await page.getByTestId("view-mode-canvas").click();
  await expect(page.locator(".react-flow")).toBeVisible();
  await expect(page.locator(".react-flow__controls")).toBeVisible();
});

test("view_mode_persists_across_reload", async ({ page }) => {
  await page.route("**/api/studio", createStudioRoute());
  await page.goto("/");

  await page.getByTestId("view-mode-canvas").click();
  await expect(page.getByTestId("view-mode-canvas")).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(450);
  await page.reload();
  await expect(page.getByTestId("view-mode-canvas")).toHaveAttribute("aria-pressed", "true");
});
