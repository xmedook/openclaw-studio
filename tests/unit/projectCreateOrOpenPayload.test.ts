import { describe, expect, it } from "vitest";

import { parseProjectCreateOrOpenPayload } from "@/app/api/projects/route";

describe("project create/open payload parser", () => {
  it("parses name-only payload", () => {
    const result = parseProjectCreateOrOpenPayload({ name: " Demo " });

    expect(result).toEqual({ ok: true, mode: "create", name: "Demo" });
  });

  it("parses path-only payload", () => {
    const result = parseProjectCreateOrOpenPayload({ path: "/tmp/demo" });

    expect(result).toEqual({ ok: true, mode: "open", path: "/tmp/demo" });
  });

  it("rejects payload with both name and path", () => {
    const result = parseProjectCreateOrOpenPayload({ name: "Demo", path: "/tmp/demo" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Workspace name and path cannot be provided together.");
    }
  });

  it("rejects payload with neither name nor path", () => {
    const result = parseProjectCreateOrOpenPayload({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Workspace name or path is required.");
    }
  });
});
