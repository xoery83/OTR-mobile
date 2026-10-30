// Synthetic owning port: tests the actual HTTP/Auth adapter, not Source/Storage qualification.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  pdfPreparationFixture,
  pdfProtocolHash,
} from "../../src/data/operations/__fixtures__/pdfOriginalPreparation";
import { createPendingPngCommandProposals } from "../../src/domain/trip/sourcePngPreparationCommands";
import { createSourcePngPreparationTransport } from "../../src/data/api/sourcePngPreparationTransport";
import { advanceAccountGeneration } from "../../src/data/auth/accountGeneration";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import type { SourcePngPreparationPort } from "./sourcePngPreparationHttp";
vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("../../src/data/auth/sessionAccessToken", () => ({
  sessionAccessToken: vi.fn(),
}));
const bytes = Uint8Array.from(
  readFileSync(
    new URL("../../output/photo/universal-photo-activity-qa.png", import.meta.url),
  ),
);
async function fixture() {
  const f = await pdfPreparationFixture([]),
    q = structuredClone(f.input.acquisition);
  const hash = await pdfProtocolHash(bytes);
  Object.assign(q.payload.original, {
    mime_type: "image/png",
    payload_sha256: hash,
    byte_count: bytes.length,
  });
  const proposals = await createPendingPngCommandProposals(
    { actorId: f.context.accountId, tripId: f.context.tripId },
    q,
    f.input.acquisitionReceipt,
    pdfProtocolHash,
  );
  const pending = (
    command: typeof proposals.prepare | typeof proposals.upload | typeof proposals.verify,
  ) => ({
    contract_version: 1,
    operation_id: command.operation_id,
    operation_key: command.operation_key,
    operation_sha256: command.operation_sha256,
    phase: "ADMITTED",
    attempt_generation: 0,
  });
  const port = {
    lookup: vi.fn<SourcePngPreparationPort["lookup"]>(async () => null),
    execute: vi.fn<SourcePngPreparationPort["execute"]>(async (_scope, command) =>
      pending(command),
    ),
    reconcile: vi.fn<SourcePngPreparationPort["reconcile"]>(async (_scope, command) =>
      pending(command),
    ),
  };
  const gateway = {
    validateAccessToken: vi.fn(async () => ({ id: f.context.accountId })),
    canReadTrip: vi.fn(async () => true),
  } as unknown as DevBackendGateway;
  const close = vi.fn(),
    scoped = vi.fn(async () => ({ port, close }));
  const handler = createDevBackendHandler({
    gateway,
    sourcePngPreparationForRequest: scoped,
  });
  const fetcher = vi.fn<typeof fetch>(async (url, init) =>
    handler(new Request(url, init)),
  );
  const transport = createSourcePngPreparationTransport(f.deps.getAccountId, {
    baseUrl: "https://api.example",
    fetchImplementation: fetcher,
    tokenProvider: async () => ({ token: "synthetic", userId: f.context.accountId }),
  });
  const request = (body: unknown, action = "execute", auth = true) =>
    new Request(
      `https://api.example/v2/trips/${f.context.tripId}/universal-source-originals/png/${action}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(auth ? { authorization: "Bearer synthetic" } : {}),
        },
        body: JSON.stringify(body),
      },
    );
  return {
    f,
    proposals,
    port,
    pending,
    gateway,
    close,
    scoped,
    handler,
    fetcher,
    transport,
    request,
    material: {
      binding: {
        ...f.input.binding,
        version: 2 as const,
        kind: "IMAGE" as const,
        mediaType: "image/png" as const,
        acquisitionSource: "photos" as const,
        originalFilename: null,
        sha256: hash,
        byteCount: bytes.length,
      },
      bytes,
    },
  };
}
it("normal Auth/Trip precede scope construction and CLOSED does not read image bytes", async () => {
  const x = await fixture();
  expect((await x.handler(x.request({}, "execute", false))).status).toBe(401);
  expect(x.scoped).not.toHaveBeenCalled();
  vi.mocked(x.gateway.canReadTrip).mockResolvedValue(false);
  expect((await x.handler(x.request({}))).status).toBe(403);
  expect(x.scoped).not.toHaveBeenCalled();
  vi.mocked(x.gateway.canReadTrip).mockResolvedValue(true);
  const closed = createDevBackendHandler({ gateway: x.gateway });
  const request = x.request({});
  Object.defineProperty(request, "body", {
    get: () => {
      throw Error("NO_BODY_READ");
    },
  });
  const result = await closed(request);
  expect(result.status).toBe(503);
  expect((await result.json()).error.code).toBe("SOURCE_CAPABILITY_CLOSED");
});
it("Native uses one scoped JSON request with original PNG bytes and no resource authority", async () => {
  const x = await fixture();
  expect(await x.transport.lookup(x.f.context, x.proposals.upload)).toBeNull();
  expect(await x.transport.execute(x.f.context, x.proposals.upload, x.material)).toEqual(
    x.pending(x.proposals.upload),
  );
  expect(x.fetcher).toHaveBeenCalledTimes(2);
  expect(x.port.execute).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      actorId: x.f.context.accountId,
      tripId: x.f.context.tripId,
    }),
    x.proposals.upload,
    bytes,
  );
  expect(x.close).toHaveBeenCalledTimes(2);
  const sent = JSON.parse(String(x.fetcher.mock.calls[1][1]?.body));
  expect(Object.keys(sent).sort()).toEqual(["command", "originalBase64"]);
  expect(Buffer.from(sent.originalBase64, "base64")).toEqual(Buffer.from(bytes));
});
it("reconciles the exact existing command without uploading or executing", async () => {
  const x = await fixture();
  await x.transport.reconcile(x.f.context, x.proposals.upload);
  expect(x.port.reconcile).toHaveBeenCalledOnce();
  expect(x.port.execute).not.toHaveBeenCalled();
  expect(x.fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(x.fetcher.mock.calls[0][1]?.body))).toEqual({
    command: x.proposals.upload,
  });
});
it.each(["actor", "bytes", "proof", "wrongAction"])(
  "rejects substituted %s before an owning write",
  async (fault) => {
    const x = await fixture(),
      command = structuredClone(x.proposals.upload);
    let body: Record<string, unknown> = {
      command,
      originalBase64: Buffer.from(bytes).toString("base64"),
    };
    let action = "execute";
    if (fault === "actor") command.actor_account_id = randomUUID();
    if (fault === "bytes") body.originalBase64 = "YWJj";
    if (fault === "proof") body.terminalEvidence = { terminated: true };
    if (fault === "wrongAction") action = "reconcile";
    const result = await x.handler(x.request(body, action));
    expect(result.status).toBe(fault === "actor" ? 403 : 422);
    expect(x.port.execute).not.toHaveBeenCalled();
    expect(x.port.reconcile).not.toHaveBeenCalled();
    expect(x.close).toHaveBeenCalledOnce();
  },
);
it("unknown write is not re-executed automatically and scope closes", async () => {
  const x = await fixture();
  x.port.execute.mockRejectedValue(Error("TRANSPORT_UNKNOWN"));
  await expect(
    x.transport.execute(x.f.context, x.proposals.upload, x.material),
  ).rejects.toThrow("SOURCE_REQUEST_UNCONFIRMED");
  expect(x.port.execute).toHaveBeenCalledOnce();
  expect(x.fetcher).toHaveBeenCalledTimes(1);
  expect(x.close).toHaveBeenCalledOnce();
});
it("suppresses response when Account generation changes, never retries", async () => {
  const x = await fixture();
  x.port.lookup.mockImplementation(async () => {
    advanceAccountGeneration();
    return null;
  });
  await expect(x.transport.lookup(x.f.context, x.proposals.upload)).rejects.toThrow();
  expect(x.fetcher).toHaveBeenCalledTimes(1);
});
it("holds request lifetime through port composition and closes a late aborted scope", async () => {
  const x = await fixture(),
    controller = new AbortController();
  let release!: (value: { port: typeof x.port; close: typeof x.close }) => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const handler = createDevBackendHandler({
    gateway: x.gateway,
    sourcePngPreparationForRequest: async () => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const raw = x.request({ command: x.proposals.prepare });
  const result = handler(new Request(raw, { signal: controller.signal }));
  await entered;
  controller.abort();
  expect((await result).status).toBe(503);
  release({ port: x.port, close: x.close });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(x.close).toHaveBeenCalledOnce();
  expect(x.port.execute).not.toHaveBeenCalled();
});
