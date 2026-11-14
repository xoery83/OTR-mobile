// Synthetic, in-process SDK client only. No TCP, OAuth, Backend or Provider connection.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createMcpHandler } from "./server";
import { prepareCreate, sha } from "./mutation";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
} from "../src/domain/trip/tripCoreV2Mutation";
import { projectCoreItem } from "../src/domain/trip/tripCoreV2Views";
import { buildCoreActorCollection } from "../backend/src/tripCoreV2Collection";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const resource = "http://127.0.0.1:18799/mcp";
const c02 = process.env.OTR_MCP_LOCAL_CASE === "C02_P3";
const actor: CoreActor = {
  accountId: id(1),
  tripId: id(2),
  personId: id(3),
  personIds: [id(3)],
  active: true,
  canManageShared: true,
};
const now = "2026-11-01T00:00:00Z";
const seed = prepareCreate(actor.accountId, {
  request_id: id(4),
  trip_id: actor.tripId,
  item: {
    family: "P3",
    title: "Fern QA Lodge",
    notes: "Keep me",
    property_name: "Fern QA Lodge",
    dates: { start_date: "2026-12-10", end_date: "2026-12-12" },
  },
});
if (seed.kind !== "ITEM") throw Error("INVALID_SYNTHETIC_SEED");
const graph = applyCoreCommand(emptyCoreGraph(), seed.command, actor, now).graph;
const handler = createMcpHandler({
  resource,
  taskAssistant: true,
  ...(c02 ? { toolProfile: "P3_STAY_QA" as const, confirm: async () => false } : {}),
  authorize: async () => ({
    accountId: actor.accountId,
    resource,
    scopes: c02 ? ["otr.trips.read", "otr.trips.write"] : ["otr.trips.read"],
    ...(c02
      ? {
          clientId: "c02-local-preview-only",
          backend: async () => {
            throw Error("LOCAL_C02_BUSINESS_DISPATCH_DISABLED");
          },
        }
      : {}),
    expiresAt: Date.now() + 60000,
    read: async (path) => {
      if (path.startsWith("/v2/trips?"))
        return Response.json({
          trips: [
            {
              id: actor.tripId,
              name: c02 ? "C02 P3 Synthetic Coastal Trip" : "Nelson QA Trip",
              destination: "Nelson",
              startDate: "2026-12-10",
              endDate: "2026-12-13",
              createdAt: now,
            },
          ],
          nextCursor: null,
        });
      if (path === `/v2/trips/${actor.tripId}/core/collection`)
        return Response.json(
          await buildCoreActorCollection(
            graph,
            actor,
            { epoch: id(5), revision: 1, accessRevision: 1, generatedAt: now },
            [
              {
                person_id: id(3),
                account_id: id(1),
                active: true,
                participating: true,
                revision: 1,
              },
            ],
            async (bytes) => sha(bytes),
          ),
        );
      if (
        path === `/v2/trips/${actor.tripId}/core/objects/ITEM/${seed.command.target.id}`
      )
        return Response.json(projectCoreItem(graph, actor, seed.command.target.id));
      return Response.json({ error: "NOT_VISIBLE" }, { status: 404 });
    },
  }),
});

async function main() {
  const [mode, qaRoot, tool, raw] = process.argv.slice(2);
  if (
    !["tools", "describe", "call"].includes(mode ?? "") ||
    !qaRoot ||
    !resolve(qaRoot).startsWith("/private/tmp/otr-mcp-phase4b-")
  )
    throw Error(
      "Usage: freshChatQa.ts tools|describe|call /private/tmp/otr-mcp-phase4b-NAME [tool] [JSON]",
    );
  const client = new Client({ name: "blank-context-local-model-test", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          if (request.url !== resource) throw Error("SYNTHETIC_RESOURCE_ONLY");
          return handler(request);
        },
      }),
    );
    const catalog = await client.listTools();
    let result: unknown;
    if (mode === "tools")
      result = {
        test_basis: c02
          ? "ACTUAL_MODEL_WITH_IN_PROCESS_SDK_SYNTHETIC_PREVIEW_ONLY_SERVER_NO_HOSTED_OAUTH"
          : "ACTUAL_MODEL_WITH_IN_PROCESS_SDK_SYNTHETIC_READ_ONLY_SERVER",
        instructions: client.getInstructions(),
        tools: catalog.tools.map(({ name, description, annotations }) => ({
          name,
          description,
          annotations,
        })),
      };
    else if (mode === "describe")
      result = catalog.tools.find((t) => t.name === tool) ?? { error: "TOOL_NOT_FOUND" };
    else {
      if (!tool) throw Error("TOOL_REQUIRED");
      result = await client.callTool({ name: tool, arguments: JSON.parse(raw ?? "{}") });
    }
    await mkdir(qaRoot, { recursive: true, mode: 0o700 });
    await appendFile(
      resolve(qaRoot, "transcript.jsonl"),
      JSON.stringify({
        at: new Date().toISOString(),
        mode,
        tool: tool ?? null,
        arguments: raw ? JSON.parse(raw) : null,
        result,
      }) + "\n",
      { mode: 0o600 },
    );
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await client.close();
  }
}
main().catch(() => {
  process.stderr.write("SYNTHETIC_CLIENT_REQUEST_FAILED\n");
  process.exitCode = 1;
});
