import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createPrivateAccountProfilePort } from "./privateAccountProfileSupabase";

const origin = "https://tuqigdxrvrerfewsxqgm.supabase.co";
function fixture(mode = "existing") {
  const accountId = randomUUID(),
    operationId = randomUUID();
  const calls: Request[] = [];
  const input = {
    operationId,
    expectedRevision: 0,
    changes: {
      displayName: "旅人",
      travelDocumentName: { mode: "UNSPLIT" as const, fullName: "林 e\u0301" },
    },
  };
  const wire: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    calls.push(request);
    expect(url.origin).toBe(origin);
    expect(request.headers.get("Authorization")).toBe("Bearer fixture-normal-session");
    expect(request.headers.get("apikey")).toBe("fixture-public-key");
    if (url.pathname === "/auth/v1/user")
      return Response.json({
        id: mode === "foreign identity" ? randomUUID() : accountId,
        is_anonymous: mode === "missing flag" ? undefined : mode === "anonymous",
        email: "fixture@example.invalid",
      });
    expect(url.pathname).not.toBe("/rest/v1/profiles");
    if (url.pathname === "/rest/v1/rpc/account_private_profile_save") {
      if (mode === "conflict")
        return Response.json(
          { code: "40001", message: "private SQL detail" },
          { status: 409 },
        );
      if (mode === "denied")
        return Response.json(
          { code: "42501", message: "private SQL detail" },
          { status: 403 },
        );
      if (mode === "unavailable")
        return Response.json(
          { code: "42P01", message: "private SQL detail" },
          { status: 400 },
        );
      return Response.json({
        schemaId: "otr.auth.private-profile-receipt/1",
        accountId: mode === "foreign mutation" ? randomUUID() : accountId,
        operationId,
        revision: 1,
        recordedAt: "2026-10-31T00:00:00Z",
      });
    }
    expect(request.method).toBe("GET");
    expect(url.searchParams.get("account_id")).toBe("eq." + accountId);
    if (url.pathname === "/rest/v1/account_private_profiles") {
      if (mode === "empty") return Response.json([]);
      if (mode === "malformed profile") return Response.json([{}]);
      return Response.json([
        {
          account_id: mode === "foreign profile" ? randomUUID() : accountId,
          revision: 1,
          fields_json: {
            displayName: "旅人",
            travelDocumentName: { mode: "UNSPLIT", fullName: "林 e\u0301" },
          },
        },
      ]);
    }
    expect(url.pathname).toBe("/rest/v1/account_private_profile_receipts");
    expect(url.searchParams.get("operation_id")).toBe("eq." + operationId);
    return Response.json(
      mode === "missing receipt"
        ? []
        : [
            {
              account_id: mode === "foreign receipt" ? randomUUID() : accountId,
              operation_id: operationId,
              revision: 1,
              recorded_at: "2026-10-31T00:00:00Z",
            },
          ],
    );
  };
  return {
    accountId,
    operationId,
    input,
    calls,
    signal: new AbortController().signal,
    scope: { accountId, accessToken: "fixture-normal-session" },
    port: createPrivateAccountProfilePort({
      url: origin,
      publishableKey: "fixture-public-key",
      fetchImplementation: wire,
    }),
  };
}

it.each(["empty", "existing"])(
  "reads only its own private values without mutating missing profiles: %s",
  async (mode) => {
    const f = fixture(mode),
      result = await f.port.read(f.scope, f.signal);
    expect(result).toMatchObject({
      accountId: f.accountId,
      revision: mode === "empty" ? 0 : 1,
      fields:
        mode === "empty"
          ? {}
          : { displayName: "旅人", travelDocumentName: { fullName: "林 e\u0301" } },
    });
    expect(f.calls.map((request) => request.method)).toEqual(["GET", "GET"]);
  },
);

it("saves a frozen name patch through normal JWT RPC and reads only its private receipt", async () => {
  const f = fixture();
  const saving = f.port.save(f.scope, f.input, f.signal);
  f.input.changes.displayName = "Changed after submit";
  const result = await saving;
  expect(result).toMatchObject({
    accountId: f.accountId,
    operationId: f.operationId,
    revision: 1,
  });
  expect(await f.calls[1].json()).toEqual({
    p_operation: f.operationId,
    p_expected_revision: 0,
    p_changes: {
      displayName: "旅人",
      travelDocumentName: { mode: "UNSPLIT", fullName: "林 e\u0301" },
    },
  });
  expect(await f.port.receipt(f.scope, f.operationId, f.signal)).toEqual(result);
});

it.each(["foreign identity", "anonymous", "missing flag"])(
  "stops an unproven identity before any profile mutation: %s",
  async (mode) => {
    const f = fixture(mode);
    await expect(f.port.save(f.scope, f.input, f.signal)).rejects.toMatchObject({
      status: 403,
    });
    expect(f.calls).toHaveLength(1);
  },
);

it.each(["foreign profile", "malformed profile", "foreign mutation", "foreign receipt"])(
  "rejects an unqualified private result without an empty-profile fallback: %s",
  async (mode) => {
    const f = fixture(mode);
    if (mode === "foreign mutation")
      await expect(f.port.save(f.scope, f.input, f.signal)).rejects.toThrow();
    else if (mode === "foreign receipt")
      await expect(f.port.receipt(f.scope, f.operationId, f.signal)).rejects.toThrow();
    else await expect(f.port.read(f.scope, f.signal)).rejects.toThrow();
  },
);

it.each([
  ["conflict", 409],
  ["denied", 403],
  ["unavailable", 503],
] as const)(
  "preserves classified errors without exposing provider diagnostics: %s",
  async (mode, status) => {
    const f = fixture(mode);
    await expect(f.port.save(f.scope, f.input, f.signal)).rejects.toMatchObject({
      status,
    });
    await expect(f.port.save(f.scope, f.input, f.signal)).rejects.not.toThrow(
      "private SQL detail",
    );
  },
);

it("keeps missing receipt distinct and prevents an already-aborted request from starting IO", async () => {
  const f = fixture("missing receipt");
  expect(await f.port.receipt(f.scope, f.operationId, f.signal)).toBeNull();
  const controller = new AbortController();
  controller.abort();
  const count = f.calls.length;
  await expect(f.port.read(f.scope, controller.signal)).rejects.toThrow();
  expect(f.calls).toHaveLength(count);
});

it("rejects a non-DEV configuration without any credential or network access", () => {
  expect(() =>
    createPrivateAccountProfilePort({
      url: "https://other.example.invalid",
      publishableKey: "fixture",
    }),
  ).toThrow("PROFILE_DEV_CONFIG_REQUIRED");
});
