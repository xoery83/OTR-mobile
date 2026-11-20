import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import registry from "../../docs/mcp/beta-contract-v1/CAPABILITY_REGISTRY_V1.json";
import {
  betaRequestSchema,
  betaRequestSchemas,
  betaResponseSchemas,
} from "./mcpBetaApiSchemas";
const artifact = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../docs/mcp/beta-layer1/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
it("provides executable finite request validation for exactly the frozen103 capabilities", () => {
  expect(Object.keys(betaRequestSchemas)).toEqual(
    registry.capabilities.map((c) => c.capabilityId),
  );
  expect(() => betaRequestSchema("otr.not_in_beta.write")).toThrow("UNKNOWN_CAPABILITY");
  expect(betaRequestSchema("otr.p1.list").safeParse({ family: "P2" }).success).toBe(
    false,
  );
  expect(
    betaRequestSchema("otr.p1.search").safeParse({ family: "P1", query: "   " }).success,
  ).toBe(false);
  expect(betaRequestSchema("otr.p1.list").parse({ family: "P1" })).toMatchObject({
    limit: 20,
    includeHidden: false,
  });
  expect(
    betaRequestSchema("otr.personal_review.read").safeParse({ memberId: "forged" })
      .success,
  ).toBe(false);
  expect(
    betaRequestSchema("otr.ledger.export").safeParse({
      scope: "SETTLEMENT",
      format: "JSON",
    }).success,
  ).toBe(false);
});
it("accepts genuine owning HTTP requests without flattening typed Expense intent or structured destinations", () => {
  const expense = artifact("EXPENSE_HTTP_PG").requests.find(
    (r: { request?: { envelope?: { patchOrIntent?: { type: string } } } }) =>
      r.request?.envelope?.patchOrIntent?.type === "CREATE",
  ).request;
  expect(betaRequestSchema("otr.expense.create").safeParse(expense).success).toBe(true);
  expect(betaRequestSchema("otr.expense.update").safeParse(expense).success).toBe(false);
  expect(
    betaRequestSchema("otr.expense.create").safeParse({
      ...expense,
      envelope: { ...expense.envelope, commandId: "new-non-uuid" },
    }).success,
  ).toBe(false);
  const metadata = artifact("TRIP_METADATA_HTTP_PG").requests.find(
    (r: { request?: { formatVersion: number } }) => r.request?.formatVersion === 3,
  ).request;
  expect(betaRequestSchema("otr.trip.update").parse(metadata)).toEqual(metadata);
  expect(
    betaRequestSchema("otr.trip.update").safeParse({
      ...metadata,
      after: { ...metadata.after, destinations: "Auckland" },
    }).success,
  ).toBe(false);
});
it("accepts real normal Member family requests and rejects legacy whole-room input only at the MCP contract boundary", () => {
  const evidence = artifact("MEMBER_FAMILIES_HTTP_PG");
  for (const result of evidence.results) {
    const commands = evidence.requests.filter(
      (r: { request?: { target?: { id: string } } }) =>
        r.request?.target?.id === result.itemId,
    );
    expect(commands).toHaveLength(2);
    expect(
      betaRequestSchema(`otr.${result.family.toLowerCase()}.create`).safeParse(
        commands[0].request,
      ).success,
    ).toBe(true);
    expect(
      betaRequestSchema(`otr.${result.family.toLowerCase()}.update`).safeParse(
        commands[1].request,
      ).success,
    ).toBe(true);
  }
});

it("validates genuine family responses and the approved audit union without a forged expense identity", () => {
  expect(Object.keys(betaResponseSchemas)).toEqual(
    registry.capabilities.map((c) => c.capabilityId),
  );
  const evidence = artifact("MEMBER_FAMILIES_HTTP_PG");
  for (const result of evidence.results) {
    const reads = evidence.requests.filter(
      (r: { method: string; path: string }) =>
        r.method === "GET" && r.path.endsWith("/" + result.itemId),
    );
    for (const read of reads)
      expect(
        betaResponseSchemas[`otr.${result.family.toLowerCase()}.get`].safeParse(
          read.response,
        ).success,
      ).toBe(true);
  }
  const histories = artifact("HISTORY_HTTP_PG").requests.filter(
    (r: { status: number; response?: { targetKind: string } }) =>
      r.status === 200 && r.response?.targetKind,
  );
  expect(histories).toHaveLength(4);
  for (const response of histories)
    expect(
      betaResponseSchemas["otr.ledger.history"].safeParse(response.response).success,
    ).toBe(true);
  const capabilities = artifact("CAPABILITIES_HTTP_PG").requests.filter(
    (r: { status: number }) => r.status === 200,
  );
  for (const response of capabilities)
    expect(
      betaResponseSchemas["otr.permissions.read"].safeParse(response.response).success,
    ).toBe(true);
});
