import { describe, expect, it, vi } from "vitest";

import { updateProjectTile } from "@/lib/projects/client";
import { fetchJson } from "@/lib/http";

vi.mock("@/lib/http", () => ({
  fetchJson: vi.fn(),
}));

describe("projects client", () => {
  it("updateProjectTile sends PATCH with name payload", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ store: { version: 2, activeProjectId: null, projects: [] }, warnings: [] });

    await updateProjectTile("project-1", "tile-1", { name: "New" });

    expect(fetchJson).toHaveBeenCalledWith(
      "/api/projects/project-1/tiles/tile-1",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New" }),
      }
    );
  });
});
