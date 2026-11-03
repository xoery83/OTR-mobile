import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountScope } from "./accountRequestContext";
import { advanceAccountGeneration } from "./accountGeneration";
import { readMcpGrantObservation } from "./mcpGrantObservation";

async function fixture() {
  let accountId: string = randomUUID();
  const account = async () => accountId;
  const scope = await captureAccountScope(account);
  const raw = {
    accountId,
    grants: [
      {
        client: {
          id: randomUUID(),
          name: "Same AI name",
          uri: "https://example.test",
          logo_uri: "https://example.test/logo",
        },
        scopes: ["openid", "offline_access"],
        granted_at: "2026-11-03T00:00:00Z",
        active: true,
        expiresAt: "2099-01-01T00:00:00Z",
      },
    ],
  };
  const read = vi.fn(async () => raw);
  return {
    scope,
    raw,
    sources: { account, read },
    switch() {
      accountId = randomUUID();
      advanceAccountGeneration();
    },
  };
}

it("projects only listed grant metadata and never infers active connection or loads client URLs", async () => {
  const f = await fixture();
  expect(await readMcpGrantObservation(f.scope, f.sources)).toEqual({
    kind: "GRANT_LIST_OBSERVED",
    connectionStatus: "UNKNOWN",
    grants: [
      {
        clientId: f.raw.grants[0].client.id,
        clientName: "Same AI name",
        scopes: ["openid", "offline_access"],
        grantedAt: "2026-11-03T00:00:00Z",
      },
    ],
  });
  expect(f.sources.read).toHaveBeenCalledWith(f.scope);
});

it("distinguishes absent Reader, qualified empty list and explicit Reader failure", async () => {
  const f = await fixture();
  expect(await readMcpGrantObservation(f.scope, { account: f.sources.account })).toEqual({
    kind: "UNAVAILABLE",
  });
  f.raw.grants = [];
  expect(await readMcpGrantObservation(f.scope, f.sources)).toEqual({
    kind: "GRANT_LIST_OBSERVED",
    connectionStatus: "UNKNOWN",
    grants: [],
  });
  f.sources.read.mockRejectedValueOnce(Error("OWNING_AUTH_CLOSED"));
  await expect(readMcpGrantObservation(f.scope, f.sources)).rejects.toThrow(
    "OWNING_AUTH_CLOSED",
  );
});

it.each(["before", "during"] as const)(
  "rejects Account switch %s grant lookup",
  async (stage) => {
    const f = await fixture();
    if (stage === "before") f.switch();
    else
      f.sources.read.mockImplementationOnce(async () => {
        f.switch();
        return f.raw;
      });
    await expect(readMcpGrantObservation(f.scope, f.sources)).rejects.toThrow(
      "Account changed",
    );
    expect(f.sources.read).toHaveBeenCalledTimes(stage === "before" ? 0 : 1);
  },
);

it("rejects another Account envelope and duplicate client identity rather than merging grants", async () => {
  const f = await fixture();
  f.sources.read.mockResolvedValueOnce({ ...f.raw, accountId: randomUUID() });
  await expect(readMcpGrantObservation(f.scope, f.sources)).rejects.toThrow(
    "MCP_GRANT_ACCOUNT_MISMATCH",
  );
  f.raw.grants.push(f.raw.grants[0]);
  await expect(readMcpGrantObservation(f.scope, f.sources)).rejects.toThrow(
    "MCP_GRANT_DUPLICATE_CLIENT",
  );
});

it("keeps same-name clients distinct by UUID and detaches immutable output from Reader objects", async () => {
  const f = await fixture();
  f.raw.grants.push({
    ...f.raw.grants[0],
    client: { ...f.raw.grants[0].client, id: randomUUID() },
  });
  const result = await readMcpGrantObservation(f.scope, f.sources);
  f.raw.grants[0].client.name = "Changed later";
  f.raw.grants[0].scopes.push("unexpected");
  expect(result.kind).toBe("GRANT_LIST_OBSERVED");
  if (result.kind !== "GRANT_LIST_OBSERVED") throw Error("MISSING_OBSERVATION");
  expect(result.grants).toHaveLength(2);
  expect(result.grants[0].clientName).toBe("Same AI name");
  expect(result.grants[0].scopes).toEqual(["openid", "offline_access"]);
  expect(Object.isFrozen(result.grants[0].scopes)).toBe(true);
});
