import { createHash, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createSourcePdfV4PreparationTransport } from "./sourcePdfV4PreparationTransport";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { CAPTURE_CUSTODY_MAX_BYTES } from "@/domain/capture/captureCustody";
vi.mock("expo/fetch", () => ({ fetch: vi.fn<typeof fetch>() }));
vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const account = randomUUID(),
    context = await captureAccountRequestContext(randomUUID(), async () => account);
  const identity = {
    sourceId: randomUUID(),
    representationId: randomUUID(),
    operationId: randomUUID(),
  };
  const fetcher = vi.fn<typeof fetch>(
    async (input) =>
      new Response(
        JSON.stringify({
          ...identity,
          observation: String(input).endsWith("/stage")
            ? "STAGED"
            : String(input).endsWith("/dispatch")
              ? "DISPATCH_OBSERVED"
              : "READ_OBSERVED",
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, no-store",
            Vary: "Authorization",
          },
        },
      ),
  );
  const token = vi.fn(async () => ({ token: "synthetic", userId: account }));
  const transport = createSourcePdfV4PreparationTransport(async () => account, {
    baseUrl: "https://api-dev.xoery.art",
    fetchImplementation: fetcher,
    tokenProvider: token,
  });
  const bytes = new TextEncoder().encode("%PDF-1.4 synthetic owned bytes");
  const binding = {
    version: 1 as const,
    accountId: account,
    batchId: randomUUID(),
    jobId: randomUUID(),
    inputId: randomUUID(),
    inputRevision: 1,
    captureId: randomUUID(),
    payloadId: randomUUID(),
    captureRevision: 1,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteCount: bytes.length,
    mediaType: "application/pdf" as const,
  };
  return { account, context, identity, fetcher, token, transport, bytes, binding };
}
it("construction never uploads or reads a session", async () => {
  const f = await fixture();
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.token).not.toHaveBeenCalled();
});
it("stages owned bytes only under the existing context and durable identities", async () => {
  const f = await fixture(),
    bytes = f.bytes;
  const result = await f.transport.stage(f.context, f.identity, f.binding, bytes);
  expect(result).toEqual({ ...f.identity, observation: "STAGED" });
  expect(f.fetcher).toHaveBeenCalledOnce();
  const [url, init] = f.fetcher.mock.calls[0];
  expect(url).toBe(
    `https://api-dev.xoery.art/v2/trips/${f.context.tripId}/sources/${f.identity.sourceId}/representations/${f.identity.representationId}/pdf-v4/${f.identity.operationId}/stage`,
  );
  expect(init).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: "Bearer synthetic",
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
    },
  });
  expect(new Uint8Array(init!.body as ArrayBuffer)).toEqual(bytes);
  expect(JSON.stringify(init!.headers)).not.toMatch(/generation|runToken|resourceKey/);
});
it.each(["dispatch", "observeRetained"] as const)(
  "%s sends no body and preserves operation identity",
  async (action) => {
    const f = await fixture();
    await f.transport[action](f.context, f.identity);
    expect(f.fetcher).toHaveBeenCalledOnce();
    expect(f.fetcher.mock.calls[0][1]?.body).toBeUndefined();
  },
);
it.each([401, 409, 503])(
  "HTTP %s never repeats dispatch or starts automatic read",
  async (status) => {
    const f = await fixture();
    f.fetcher.mockResolvedValue(new Response("", { status }));
    await expect(f.transport.dispatch(f.context, f.identity)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce();
  },
);
it("a network UNKNOWN never starts a second request", async () => {
  const f = await fixture();
  f.fetcher.mockRejectedValue(Error("PRIVATE network detail"));
  await expect(f.transport.dispatch(f.context, f.identity)).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledOnce();
});
it("rejects missing or oversize original bytes before token/network", async () => {
  const f = await fixture();
  for (const bytes of [new Uint8Array(), new Uint8Array(CAPTURE_CUSTODY_MAX_BYTES + 1)])
    await expect(
      f.transport.stage(f.context, f.identity, f.binding, bytes),
    ).rejects.toThrow();
  expect(f.token).not.toHaveBeenCalled();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it.each(["identity", "step", "capability"] as const)(
  "rejects %s response drift",
  async (drift) => {
    const f = await fixture();
    f.fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...f.identity,
          observation: "DISPATCH_OBSERVED",
          ...(drift === "identity"
            ? { operationId: randomUUID() }
            : drift === "step"
              ? { observation: "STAGED" }
              : { runToken: "PRIVATE" }),
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, no-store",
            Vary: "Authorization",
          },
        },
      ),
    );
    await expect(f.transport.dispatch(f.context, f.identity)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce();
  },
);
it("a late account-generation change withholds the response", async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async () => {
    advanceAccountGeneration();
    return new Response("{}", { headers: { "Content-Type": "application/json" } });
  });
  await expect(f.transport.dispatch(f.context, f.identity)).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledOnce();
});
it("observe-retained honors an invalid explicit read allocation before network", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_QA_READ_BUDGET", "invalid");
  const f = await fixture();
  await expect(f.transport.observeRetained(f.context, f.identity)).rejects.toThrow(
    "QA_READ_BUDGET_CLOSED",
  );
  expect(f.fetcher).not.toHaveBeenCalled();
});

it("an IO-uncertain 503 is not reported as a confirmed closed capability", async () => {
  const f = await fixture();
  f.fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({ error: { code: "SOURCE_IO_UNAVAILABLE", message: "PRIVATE" } }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    ),
  );
  await expect(f.transport.dispatch(f.context, f.identity)).rejects.toThrow(
    "SOURCE_REQUEST_UNCONFIRMED",
  );
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it.each(["account", "hash", "media"] as const)(
  "rejects wrong Capture %s before reading a token",
  async (drift) => {
    const f = await fixture(),
      binding = {
        ...f.binding,
        ...(drift === "account"
          ? { accountId: randomUUID() }
          : drift === "hash"
            ? { sha256: "c".repeat(64) }
            : { mediaType: "image/jpeg" as const }),
      };
    await expect(
      f.transport.stage(f.context, f.identity, binding, f.bytes),
    ).rejects.toThrow();
    expect(f.token).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it("copies verified original bytes before an asynchronous session lookup", async () => {
  const f = await fixture(),
    original = new Uint8Array(f.bytes);
  const pending = f.transport.stage(f.context, f.identity, f.binding, f.bytes);
  f.bytes.fill(0);
  await pending;
  expect(new Uint8Array(f.fetcher.mock.calls[0][1]!.body as ArrayBuffer)).toEqual(
    original,
  );
});
it("only the explicit closed-capability response is known closed", async () => {
  const f = await fixture();
  f.fetcher.mockResolvedValue(
    new Response(JSON.stringify({ error: { code: "SOURCE_CAPABILITY_CLOSED" } }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }),
  );
  await expect(f.transport.dispatch(f.context, f.identity)).rejects.toThrow(
    "SOURCE_CAPABILITY_CLOSED",
  );
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it("normal Backend roundtrip keeps the server owning generation off the Native wire", async () => {
  const f = await fixture();
  const { createDevBackendHandler } = await import("../../../backend/src/app");
  const upload = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    runToken: "PRIVATE",
  }));
  const handler = createDevBackendHandler({
    gateway: {
      validateAccessToken: async () => ({ id: f.account }),
      canReadTrip: async () => true,
    } as never,
    sourcePdfV4PreparationPort: {
      owner: { accountGeneration: async () => 37 },
      preparation: { ingress: vi.fn(), upload, observeRetained: vi.fn() } as never,
    },
  });
  f.fetcher.mockImplementation(async (input, init) =>
    handler(new Request(String(input), init)),
  );
  const result = await f.transport.dispatch(f.context, f.identity);
  expect(result).toEqual({ ...f.identity, observation: "DISPATCH_OBSERVED" });
  expect(upload.mock.calls[0][1]).toMatchObject({
    ...f.identity,
    tripId: f.context.tripId,
    accountGeneration: 37,
  });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|generation|runToken/);
});
it("a canceled call never fetches or reads a Session token", async () => {
  const account = randomUUID(),
    getAccount = async () => account,
    context = await captureAccountRequestContext(randomUUID(), getAccount),
    controller = new AbortController(),
    fetcher = vi.fn<typeof fetch>(),
    token = vi.fn(async () => ({ token: "synthetic", userId: account }));
  controller.abort();
  const transport = createSourcePdfV4PreparationTransport(getAccount, {
    baseUrl: "https://api-dev.xoery.art",
    signal: controller.signal,
    fetchImplementation: fetcher,
    tokenProvider: token,
  });
  await expect(
    transport.dispatch(context, {
      sourceId: randomUUID(),
      representationId: randomUUID(),
      operationId: randomUUID(),
    }),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  expect(token).not.toHaveBeenCalled();
});
it("a pending dispatch times out once and never starts a replacement", async () => {
  vi.useFakeTimers();
  try {
    const f = await fixture();
    f.fetcher.mockImplementation(() => new Promise(() => {}));
    const rejected = expect(
      f.transport.dispatch(f.context, f.identity),
    ).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(90001);
    await rejected;
    expect(f.fetcher).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

function uploadCommand(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    contract_version: 1,
    command: "UPLOAD_ORIGINAL",
    operation_id: f.identity.operationId,
    operation_key: "retained-synthetic-upload",
    actor_account_id: f.account,
    trip_id: f.context.tripId,
    source_id: f.identity.sourceId,
    operation_sha256: "a".repeat(64),
    payload: {
      material_revision: 1,
      expected_source_row_revision: 1,
      expected_source_state: { lifecycle: "ACTIVE", retention_state: "RETAINED" },
      representation_id: f.identity.representationId,
      expected_representation_row_revision: 1,
      expected_representation_state: {
        remote_state: "PENDING",
        retention_state: "RETAINED",
      },
      parent_operation_id: randomUUID(),
      payload_sha256: f.binding.sha256,
      byte_count: f.binding.byteCount,
      mime_type: "application/pdf",
    },
  };
}
function commandResponse(
  f: Awaited<ReturnType<typeof fixture>>,
  action: "reserve" | "finish",
  receipt?: unknown,
) {
  return new Response(
    JSON.stringify({
      ...f.identity,
      observation: action === "reserve" ? "RESERVATION_OBSERVED" : "FINISH_OBSERVED",
      ...(receipt ? { receipt } : {}),
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
      },
    },
  );
}
it("reserve submits only the frozen Source command using the same durable operation", async () => {
  const f = await fixture(),
    command = uploadCommand(f);
  f.fetcher.mockImplementation(async () => commandResponse(f, "reserve"));
  expect(await f.transport.reserve(f.context, f.identity, command)).toEqual({
    ...f.identity,
    observation: "RESERVATION_OBSERVED",
  });
  expect(f.fetcher).toHaveBeenCalledOnce();
  const [url, options] = f.fetcher.mock.calls[0];
  expect(String(url)).toContain(`/pdf-v4/${f.identity.operationId}/reserve`);
  expect(options?.headers).toMatchObject({
    Authorization: "Bearer synthetic",
    "Content-Type": "application/json",
  });
  expect(JSON.parse(options?.body as string)).toEqual(command);
});
it.each(["actor", "trip", "source", "operation", "representation", "size", "resource"])(
  "command %s drift fails before reading a token or sending",
  async (kind) => {
    const f = await fixture(),
      command = uploadCommand(f);
    if (kind === "actor") command.actor_account_id = randomUUID();
    if (kind === "trip") command.trip_id = randomUUID();
    if (kind === "source") command.source_id = randomUUID();
    if (kind === "operation") command.operation_id = randomUUID();
    if (kind === "representation") command.payload.representation_id = randomUUID();
    if (kind === "size") command.payload.byte_count = 4194305;
    await expect(
      f.transport.reserve(
        f.context,
        f.identity,
        kind === "resource" ? { ...command, resourceKey: "PRIVATE" } : command,
      ),
    ).rejects.toThrow();
    expect(f.token).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it("finish requires an exact owning receipt and does not retry uncertainty", async () => {
  const f = await fixture(),
    command = uploadCommand(f);
  const receipt = {
    contract_version: 1,
    command: "UPLOAD_ORIGINAL",
    operation_id: command.operation_id,
    operation_key: command.operation_key,
    operation_sha256: command.operation_sha256,
    outcome: "APPLIED",
    error_code: null,
    completed_at: "2026-10-30T00:00:00.000000Z",
    source_id: command.source_id,
    representation_id: command.payload.representation_id,
    result_source_row_revision: 2,
    result_material_revision: 1,
    result_representation_row_revision: 2,
    result_remote_state: "PENDING",
    result_retention_state: "RETAINED",
    result_action_id: null,
    result_verified_at: null,
    result_sha256: "c".repeat(64),
  };
  f.fetcher.mockImplementation(async () => commandResponse(f, "finish", receipt));
  expect(
    (await f.transport.finish(f.context, f.identity, command)) as unknown,
  ).toMatchObject({ receipt });
  f.fetcher.mockImplementation(async () =>
    commandResponse(f, "finish", { ...receipt, operation_id: randomUUID() }),
  );
  await expect(f.transport.finish(f.context, f.identity, command)).rejects.toThrow(
    "SOURCE_RESPONSE_INVALID",
  );
  f.fetcher.mockImplementation(async () => commandResponse(f, "finish"));
  await expect(f.transport.finish(f.context, f.identity, command)).rejects.toThrow();
  f.fetcher.mockRejectedValue(Error("UNKNOWN"));
  const calls = f.fetcher.mock.calls.length;
  await expect(f.transport.finish(f.context, f.identity, command)).rejects.toThrow(
    "SOURCE_REQUEST_UNCONFIRMED",
  );
  expect(f.fetcher.mock.calls.length).toBe(calls + 1);
});
