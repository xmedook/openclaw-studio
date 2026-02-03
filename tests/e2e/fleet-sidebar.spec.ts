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

test("switches_active_agent_from_sidebar", async ({ page }) => {
  await page.route("**/api/studio", createStudioRoute());
  await page.goto("/");

  await expect(page.getByTestId("fleet-sidebar")).toBeVisible();
  await expect(page.getByTestId("focused-agent-panel")).toBeVisible();
  await expect(
    page.getByTestId("fleet-sidebar").getByText("No agents available.")
  ).toBeVisible();
});

test("applies_attention_filters", async ({ page }) => {
  await page.route("**/api/studio", createStudioRoute());
  await page.goto("/");

  await page.getByTestId("fleet-filter-needs-attention").click();
  await expect(page.getByTestId("fleet-filter-needs-attention")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.getByTestId("fleet-filter-running").click();
  await expect(page.getByTestId("fleet-filter-running")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.getByTestId("fleet-filter-idle").click();
  await expect(page.getByTestId("fleet-filter-idle")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("focused_preferences_persist_across_reload", async ({ page }) => {
  await page.route("**/api/studio", createStudioRoute());
  await page.goto("/");

  await page.getByTestId("fleet-filter-running").click();
  await expect(page.getByTestId("fleet-filter-running")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.waitForTimeout(450);
  await page.reload();

  await expect(page.getByTestId("fleet-filter-running")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("clears_unseen_indicator_on_focus", async ({ page }) => {
  await page.route("**/api/studio", createStudioRoute());
  await page.goto("/");

  await page.getByTestId("fleet-filter-all").click();
  await expect(page.getByText(/^Attention$/)).toHaveCount(0);
});
