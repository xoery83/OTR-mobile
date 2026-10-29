import { createDevBackendHandler } from "./app";
import { sourcePdfV4PreparationBoundary } from "./sourcePdfV4PreparationHttp";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createSourcePdfV4Reservation } from "./sourcePdfV4Reservation";
function fixture() {
  const actor = randomUUID(),
    node = randomUUID();
  const identity = {
    tripId: randomUUID(),
    sourceId: randomUUID(),
    representationId: randomUUID(),
    operationId: randomUUID(),
    accountGeneration: 3,
  };
  const command = {
    contract_version: 1,
    command: "UPLOAD_ORIGINAL",
    operation_id: identity.operationId,
    operation_key: "synthetic-pdf",
    actor_account_id: actor,
    trip_id: identity.tripId,
    source_id: identity.sourceId,
    operation_sha256: "a".repeat(64),
    payload: {
      material_revision: 1,
      expected_source_row_revision: 1,
      expected_source_state: { lifecycle: "ACTIVE", retention_state: "RETAINED" },
      representation_id: identity.representationId,
      expected_representation_row_revision: 1,
      expected_representation_state: {
        remote_state: "PENDING",
        retention_state: "RETAINED",
      },
      parent_operation_id: randomUUID(),
      payload_sha256: "b".repeat(64),
      byte_count: 1700,
      mime_type: "application/pdf",
    },
  };
  const context = {
    binding: {
      actorAccountId: actor,
      tripId: identity.tripId,
      sourceId: identity.sourceId,
      representationId: identity.representationId,
      operationId: identity.operationId,
    },
    accountGeneration: 3,
  };
  const authority = {
    admit: vi.fn(async () => ({ context })),
    resolveReserved: vi.fn(async () => context),
    finish: vi.fn(async () => ({ outcome: "APPLIED" })),
  };
  const owner = { accountGeneration: vi.fn(async () => 3) };
  const port = createSourcePdfV4Reservation(authority as never, owner, node);
  return {
    actor,
    node,
    identity,
    command,
    context,
    authority,
    owner,
    port,
    raw: () => JSON.stringify(command),
  };
}
it("reserves only through existing authority with server-created private resource capabilities", async () => {
  const f = fixture();
  await f.port.reserve(f.actor, f.raw(), f.identity);
  const args = f.authority.admit.mock.calls[0] as unknown as [
    string,
    string,
    number,
    Record<string, string>,
  ];
  expect(args.slice(0, 3)).toEqual([f.actor, f.raw(), 3]);
  expect(args[3]).toMatchObject({ nodeId: f.node });
  expect(args[3].resourceKey).toMatch(/^[a-f0-9]{64}$/);
  expect(args[3].attemptId).not.toBe(f.identity.operationId);
});
it.each(["tripId", "sourceId", "representationId", "operationId"] as const)(
  "rejects route %s mismatch before reservation",
  async (field) => {
    const f = fixture();
    await expect(
      f.port.reserve(f.actor, f.raw(), { ...f.identity, [field]: randomUUID() }),
    ).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
    expect(f.authority.admit).not.toHaveBeenCalled();
  },
);
it.each(["actor", "generation", "size", "capability", "oversize-body"])(
  "rejects %s drift before authority",
  async (kind) => {
    const f = fixture();
    if (kind === "generation") f.owner.accountGeneration.mockResolvedValue(4);
    if (kind === "size") f.command.payload.byte_count = 4194305;
    const raw =
      kind === "capability"
        ? JSON.stringify({ ...f.command, resourceId: randomUUID() })
        : kind === "oversize-body"
          ? " ".repeat(16385)
          : f.raw();
    await expect(
      f.port.reserve(kind === "actor" ? randomUUID() : f.actor, raw, f.identity),
    ).rejects.toThrow();
    expect(f.authority.admit).not.toHaveBeenCalled();
  },
);
it("preserves exact command/replayed receipt and never starts byte IO", async () => {
  const f = fixture();
  f.authority.admit.mockResolvedValue({ receipt: { outcome: "APPLIED" } } as never);
  expect(await f.port.reserve(f.actor, f.raw(), f.identity)).toEqual({
    receipt: { outcome: "APPLIED" },
  });
  expect(f.authority.finish).not.toHaveBeenCalled();
});
it("does not retry UNKNOWN admission or fabricate a new operation", async () => {
  const f = fixture();
  f.authority.admit.mockRejectedValue(Error("UNKNOWN"));
  await expect(f.port.reserve(f.actor, f.raw(), f.identity)).rejects.toThrow("UNKNOWN");
  expect(f.authority.admit).toHaveBeenCalledOnce();
});
it("rejects generation changes while admission is in flight", async () => {
  const f = fixture();
  f.owner.accountGeneration.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
  await expect(f.port.reserve(f.actor, f.raw(), f.identity)).rejects.toThrow(
    "PDF_SCOPE_FORBIDDEN",
  );
  expect(f.authority.admit).toHaveBeenCalledOnce();
});
it("finish uses the same owning reserved context and exact command", async () => {
  const f = fixture();
  expect(await f.port.finish(f.actor, f.raw(), f.identity)).toEqual({
    outcome: "APPLIED",
  });
  expect(f.authority.finish).toHaveBeenCalledExactlyOnceWith(f.context, f.raw());
  expect(f.authority.admit).not.toHaveBeenCalled();
});
it("finish cannot substitute a context from another Source", async () => {
  const f = fixture();
  f.context.binding.sourceId = randomUUID();
  await expect(f.port.finish(f.actor, f.raw(), f.identity)).rejects.toThrow(
    "PDF_SCOPE_FORBIDDEN",
  );
  expect(f.authority.finish).not.toHaveBeenCalled();
});

// Joined HTTP -> normal Auth/Trip -> same reservation adapter; no DB/Provider doubles
// are promoted to actual Source authority qualification.
it("joined reserve route uses normal Auth/Trip and hides private context", async () => {
  const f = fixture();
  const gateway = {
    validateAccessToken: vi.fn(async () => ({ id: f.actor })),
    canReadTrip: vi.fn(async () => true),
  };
  const handle = createDevBackendHandler({
    gateway: gateway as never,
    sourcePdfV4PreparationPort: {
      owner: f.owner,
      preparation: {} as never,
      reservation: f.port,
    },
  });
  const request = (auth = true) =>
    new Request(
      `https://dev.example.invalid/v2/trips/${f.identity.tripId}/sources/${f.identity.sourceId}/representations/${f.identity.representationId}/pdf-v4/${f.identity.operationId}/reserve`,
      {
        method: "POST",
        headers: auth ? { Authorization: "Bearer synthetic" } : {},
        body: f.raw(),
      },
    );
  expect((await handle(request(false))).status).toBe(401);
  expect(f.authority.admit).not.toHaveBeenCalled();
  gateway.canReadTrip.mockResolvedValueOnce(false);
  expect((await handle(request())).status).toBe(403);
  expect(f.authority.admit).not.toHaveBeenCalled();
  const result = await handle(request());
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({
    sourceId: f.identity.sourceId,
    representationId: f.identity.representationId,
    operationId: f.identity.operationId,
    observation: "RESERVATION_OBSERVED",
  });
  expect(f.authority.admit).toHaveBeenCalledOnce();
});
it.each(["reserve", "finish"])(
  "%s is closed before reading command bytes when unbound",
  async (action) => {
    const f = fixture();
    const q = new Request(
      `https://dev.example.invalid/v2/trips/${f.identity.tripId}/sources/${f.identity.sourceId}/representations/${f.identity.representationId}/pdf-v4/${f.identity.operationId}/${action}`,
      { method: "POST", body: f.raw() },
    );
    Object.defineProperty(q, "body", {
      get() {
        throw Error("BODY_MUST_NOT_BE_READ");
      },
    });
    const result = await sourcePdfV4PreparationBoundary(q, f.actor, async () => true, {
      owner: f.owner,
      preparation: {} as never,
    });
    expect(result.status).toBe(503);
    expect(f.authority.admit).not.toHaveBeenCalled();
    expect(f.authority.finish).not.toHaveBeenCalled();
  },
);
it("finish returns only a frozen owning Source receipt", async () => {
  const f = fixture();
  const receipt = {
    contract_version: 1,
    operation_id: f.identity.operationId,
    operation_key: f.command.operation_key,
    command: "UPLOAD_ORIGINAL",
    operation_sha256: f.command.operation_sha256,
    outcome: "APPLIED",
    error_code: null,
    completed_at: "2026-10-30T00:00:00.000000Z",
    source_id: f.identity.sourceId,
    representation_id: f.identity.representationId,
    result_source_row_revision: 2,
    result_material_revision: 1,
    result_representation_row_revision: 2,
    result_remote_state: "PENDING",
    result_retention_state: "RETAINED",
    result_action_id: null,
    result_verified_at: null,
    result_sha256: "c".repeat(64),
  };
  f.authority.finish.mockResolvedValue(receipt as never);
  const call = () =>
    sourcePdfV4PreparationBoundary(
      new Request(
        `https://dev.example.invalid/v2/trips/${f.identity.tripId}/sources/${f.identity.sourceId}/representations/${f.identity.representationId}/pdf-v4/${f.identity.operationId}/finish`,
        { method: "POST", body: f.raw() },
      ),
      f.actor,
      async () => true,
      { owner: f.owner, preparation: {} as never, reservation: f.port },
    );
  const result = await call();
  expect(result.status).toBe(200);
  expect((await result.json()).receipt).toEqual(receipt);
  f.authority.finish.mockResolvedValue({ ...receipt, resourceKey: "PRIVATE" } as never);
  const invalid = await call();
  expect(invalid.status).toBe(422);
  expect(await invalid.text()).not.toContain("PRIVATE");
});
it("oversized command and caller resource injection never reach admission", async () => {
  const f = fixture();
  const call = (body: string) =>
    sourcePdfV4PreparationBoundary(
      new Request(
        `https://dev.example.invalid/v2/trips/${f.identity.tripId}/sources/${f.identity.sourceId}/representations/${f.identity.representationId}/pdf-v4/${f.identity.operationId}/reserve`,
        { method: "POST", body },
      ),
      f.actor,
      async () => true,
      { owner: f.owner, preparation: {} as never, reservation: f.port },
    );
  expect((await call(" ".repeat(16385))).status).toBe(413);
  expect(
    (await call(JSON.stringify({ ...f.command, resourceKey: "PRIVATE" }))).status,
  ).toBe(422);
  expect(f.authority.admit).not.toHaveBeenCalled();
});

it("finish withholds a receipt after generation changes during the RPC", async () => {
  const f = fixture();
  let complete!: () => void;
  f.authority.finish.mockImplementation(async () => {
    await new Promise<void>((resolve) => {
      complete = resolve;
    });
    return { outcome: "APPLIED" };
  });
  const pending = f.port.finish(f.actor, f.raw(), f.identity);
  await vi.waitFor(() => expect(f.authority.finish).toHaveBeenCalledOnce());
  f.owner.accountGeneration.mockResolvedValue(4);
  complete();
  await expect(pending).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
  expect(f.authority.admit).not.toHaveBeenCalled();
});
