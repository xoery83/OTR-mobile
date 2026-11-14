import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, it, vi } from "vitest";
import { createMcpHandler } from "./server";
import { guideOutput } from "./guide";
const providerPolicy = {
  metadataUrl: "https://synthetic.invalid/oauth-metadata",
  challenge: "fixture",
  handle: () => null,
  authorizationScopes: {
    read: ["openid", "offline_access"],
    write: ["openid", "offline_access"],
  },
};
const actor = "00000000-0000-4000-8000-000000000001",
  trip = "00000000-0000-4000-8000-000000000002";
it.each([false, true])(
  "advertises only explicitly bound, consent-scoped domain tools through actual SDK discovery (granted=%s)",
  async (granted) => {
    const resource = "http://127.0.0.1:18801/mcp";
    const backend = vi.fn(async () => Response.json({ expenses: [], nextCursor: null }));
    const bind = vi.fn(async () => ({
      backend,
      enabled: [
        "PEOPLE_READ",
        "METADATA_READ",
        "METADATA",
        "TRAVELER",
        "EXPENSE_READ",
        "EXPENSE",
      ] as const,
      requiredScopes: {
        PEOPLE_READ: ["fixture.domain"],
        METADATA_READ: ["fixture.domain"],
        METADATA: ["fixture.domain"],
        TRAVELER: ["fixture.domain"],
        EXPENSE_READ: ["fixture.domain"],
        EXPENSE: ["fixture.domain"],
      },
      expenseRecovery: async () => ({ state: "UNKNOWN" as const }),
    }));
    const handler = createMcpHandler({
      resource,
      oauth: providerPolicy,
      taskAssistant: true,
      bindTaskDomains: bind,
      authorize: async () => ({
        accountId: actor,
        clientId: "synthetic-only",
        resource,
        scopes: ["otr.trips.read", ...(granted ? ["fixture.domain"] : [])],
        expiresAt: Date.now() + 60000,
        read: async () => Response.json({}),
      }),
    });
    const client = new Client({ name: "scoped-domain-contract-fixture", version: "1" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(resource), {
          fetch: async (input, init) => handler(new Request(input, init)),
        }),
      );
      const tools = (await client.listTools()).tools;
      for (const name of [
        "list_trip_people",
        "get_trip_metadata",
        "update_trip",
        "create_trip_traveler",
        "list_expenses",
        "create_expense",
        "update_expense",
      ])
        expect(tools.some((t) => t.name === name)).toBe(granted);
      if (granted) {
        for (const name of ["get_trip_metadata", "create_expense"]) {
          expect(tools.find((t) => t.name === name)?._meta?.securitySchemes).toEqual([
            { type: "oauth2", scopes: ["openid", "offline_access"] },
          ]);
        }
        const page = await client.callTool({
          name: "list_expenses",
          arguments: { trip_id: trip },
        });
        expect(page.isError).not.toBe(true);
        expect(page.structuredContent).toEqual({ expenses: [], nextCursor: null });
        const guide = await client.callTool({
          name: "get_otr_operating_guide",
          arguments: { section: "CAPABILITIES" },
        });
        const caps = JSON.parse(guideOutput.parse(guide.structuredContent).text);
        expect(caps.expense_read).toBe("AVAILABLE_SUBJECT_TO_BACKEND_ACL");
        expect(caps.expense_link).toContain("BLOCKED");
        const expensePreview = await client.callTool({
          name: "create_expense",
          arguments: {
            trip_id: trip,
            request_id: "00000000-0000-4000-8000-000000000003",
            expense: {
              title: "QA admission",
              description: null,
              category: "activity",
              occurredAt: "2026-12-12T00:00:00Z",
              payerMemberId: actor,
              original: { minor: 7000, currency: "NZD", scale: 2 },
              businessStatus: "DRAFT",
              participants: [
                { memberId: actor, displayNameSnapshot: "QA", householdIdSnapshot: null },
              ],
              splits: [
                {
                  memberId: actor,
                  method: "EXACT",
                  originalMinor: 7000,
                  settlementMinor: null,
                  weightUnits: null,
                  percentageUnits: null,
                  roundingAdjustmentMinor: 0,
                },
              ],
              valuation: null,
            },
          },
        });
        expect(expensePreview.isError).not.toBe(true);
        expect(expensePreview.structuredContent).toMatchObject({
          outcome: "PREVIEW",
          domain: "EXPENSE",
        });
      }
      expect(backend).toHaveBeenCalledTimes(granted ? 1 : 0);
    } finally {
      await client.close();
    }
  },
);
it("returns only original caller-derived UNKNOWN identity if authority expires during a domain Apply", async () => {
  const resource = "http://127.0.0.1:18802/mcp",
    expiresAt = Date.now() + 60000;
  const request = {
    formatVersion: 3,
    operationId: "00000000-0000-4000-8000-000000000003",
    tripId: trip,
    expectedMetadataRevision: 4,
    before: {
      name: "Before",
      destination: null,
      destinations: [],
      startDate: null,
      endDate: null,
    },
    after: {
      name: "After",
      destination: null,
      destinations: [],
      startDate: null,
      endDate: null,
    },
  };
  const backend = vi.fn(async (q: { method: string }) => {
    if (q.method === "GET") return new Response(null, { status: 404 });
    vi.spyOn(Date, "now").mockReturnValue(expiresAt + 1);
    return Response.json({
      ...request,
      actorAccountId: actor,
      resultMetadataRevision: 5,
    });
  });
  const handler = createMcpHandler({
    resource,
    oauth: providerPolicy,
    taskAssistant: true,
    confirm: async () => true,
    bindTaskDomains: async () => ({
      backend,
      enabled: ["METADATA"],
      requiredScopes: { METADATA: ["fixture.domain"] },
    }),
    authorize: async () => ({
      accountId: actor,
      clientId: "fixture",
      resource,
      scopes: ["otr.trips.read", "fixture.domain"],
      expiresAt,
      read: async () => Response.json({}),
    }),
  });
  const client = new Client({ name: "domain-expiry-fixture", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: async (input, init) => handler(new Request(input, init)),
      }),
    );
    const preview = await client.callTool({
      name: "update_trip",
      arguments: { request },
    });
    const digest = (preview.structuredContent as { preview_digest: string })
      .preview_digest;
    const result = await client.callTool({
      name: "update_trip",
      arguments: { request, mode: "APPLY", preview_digest: digest },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      outcome: "UNKNOWN",
      command_id: request.operationId,
      operation_id: request.operationId,
      current_revision: null,
    });
    expect(result.structuredContent).not.toHaveProperty("request");
    expect(result._meta?.["mcp/www_authenticate"]).toEqual([
      expect.stringContaining("invalid_token"),
    ]);
    expect(result._meta?.["mcp/www_authenticate"]).toEqual([
      expect.stringContaining('scope="openid offline_access"'),
    ]);
    expect(JSON.stringify(result._meta)).not.toContain("fixture.domain");
    expect(backend).toHaveBeenCalledTimes(2);
  } finally {
    vi.restoreAllMocks();
    await client.close();
  }
});
it("provider read-only policy keeps domain writes closed despite signed business grants", async () => {
  const resource = "http://127.0.0.1:18803/mcp";
  const backend = vi.fn(async () => Response.json({ expenses: [], nextCursor: null }));
  const handler = createMcpHandler({
    resource,
    taskAssistant: true,
    oauth: {
      ...providerPolicy,
      authorizationScopes: { read: ["openid", "offline_access"] },
    },
    bindTaskDomains: async () => ({
      backend,
      enabled: ["METADATA_READ", "METADATA", "TRAVELER", "EXPENSE_READ", "EXPENSE"],
      requiredScopes: {
        METADATA_READ: ["fixture.domain"],
        METADATA: ["fixture.domain"],
        TRAVELER: ["fixture.domain"],
        EXPENSE_READ: ["fixture.domain"],
        EXPENSE: ["fixture.domain"],
      },
      expenseRecovery: async () => ({ state: "UNKNOWN" }),
    }),
    authorize: async () => ({
      accountId: actor,
      clientId: "fixture",
      resource,
      scopes: ["otr.trips.read", "fixture.domain"],
      expiresAt: Date.now() + 60000,
      read: async () => Response.json({}),
    }),
  });
  const client = new Client({ name: "provider-read-only-policy", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: async (input, init) => handler(new Request(input, init)),
      }),
    );
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("list_expenses");
    expect(names).toContain("get_trip_metadata");
    for (const name of [
      "update_trip",
      "create_trip_traveler",
      "create_expense",
      "update_expense",
    ])
      expect(names).not.toContain(name);
    expect(backend).not.toHaveBeenCalled();
  } finally {
    await client.close();
  }
});
