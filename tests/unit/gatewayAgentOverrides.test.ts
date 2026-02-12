import { describe, expect, it, vi } from "vitest";

import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import { updateGatewayAgentOverrides } from "@/lib/gateway/agentConfig";

describe("updateGatewayAgentOverrides", () => {
  it("writes additive alsoAllow entries for per-agent tools", async () => {
    const client = {
      call: vi.fn(async (method: string, params?: unknown) => {
        if (method === "config.get") {
          return {
            exists: true,
            hash: "cfg-additive-1",
            config: {
              agents: {
                list: [{ id: "agent-1", tools: { profile: "coding" } }],
              },
            },
          };
        }
        if (method === "config.set") {
          const raw = (params as { raw?: string }).raw ?? "";
          const parsed = JSON.parse(raw) as {
            agents?: {
              list?: Array<{
                id?: string;
                tools?: { profile?: string; alsoAllow?: string[]; deny?: string[] };
              }>;
            };
          };
          const entry = parsed.agents?.list?.find((item) => item.id === "agent-1");
          expect(entry?.tools).toEqual({
            profile: "coding",
            alsoAllow: ["group:web", "group:runtime"],
            deny: ["group:fs"],
          });
          return { ok: true };
        }
        throw new Error(`unexpected method ${method}`);
      }),
    } as unknown as GatewayClient;

    await updateGatewayAgentOverrides({
      client,
      agentId: "agent-1",
      overrides: {
        tools: {
          profile: "coding",
          alsoAllow: ["group:web", "group:web", " group:runtime "],
          deny: ["group:fs", "group:fs"],
        },
      },
    });
  });

  it("fails fast when both allow and alsoAllow are provided", async () => {
    const client = {
      call: vi.fn(),
    } as unknown as GatewayClient;

    await expect(
      updateGatewayAgentOverrides({
        client,
        agentId: "agent-1",
        overrides: {
          tools: {
            allow: ["group:runtime"],
            alsoAllow: ["group:web"],
          },
        },
      })
    ).rejects.toThrow("Agent tools overrides cannot set both allow and alsoAllow.");

    expect(client.call).not.toHaveBeenCalled();
  });
});
