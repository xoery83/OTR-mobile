import { createHash, randomUUID } from "node:crypto";
import { it, expect, vi } from "vitest";
import { createCoreV2Transport } from "./tripCoreV2Transport";
import {
  createDevBackendHandler,
  type DevBackendGateway,
} from "../../../backend/src/app";
import {
  captureAccountRequestContext,
  beginAccountTransition,
  endAccountTransition,
} from "../auth/accountRequestContext";
vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const actor = randomUUID(),
  trip = randomUUID();
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const token = async () => ({ token: "valid", userId: actor });
it("negotiates v2 CLOSED through the actual authenticated API and HTTP handler", async () => {
  const handler = createDevBackendHandler({
    gateway: {
      validateAccessToken: async (t: string) => (t === "valid" ? { id: actor } : null),
      canReadTrip: async () => true,
    } as unknown as DevBackendGateway,
  });
  const transport = createCoreV2Transport(
    async () => actor,
    hash,
    {
      baseUrl: "http://core.local",
      fetchImplementation: async (input, init) => handler(new Request(input, init)),
    },
    token,
  );
  const context = await captureAccountRequestContext(trip, async () => actor);
  expect(await transport.capabilities(context)).toMatchObject({
    activationState: "CLOSED",
    contractVersion: 2,
    enabledCommands: [],
  });
});
it("does not reinterpret unavailable replay or another operation's status as absence", async () => {
  const operation = randomUUID(),
    context = await captureAccountRequestContext(trip, async () => actor);
  let code = 503;
  const transport = createCoreV2Transport(
    async () => actor,
    hash,
    {
      baseUrl: "http://core.local",
      fetchImplementation: async () =>
        new Response(JSON.stringify({ error: { code: "CORE_REPLAY_UNAVAILABLE" } }), {
          status: code,
        }),
    },
    token,
  );
  await expect(transport.receipt(context, operation)).rejects.toMatchObject({
    status: 503,
  });
  code = 404;
  expect(await transport.receipt(context, operation)).toBeNull();
  const wrong = createCoreV2Transport(
    async () => actor,
    hash,
    {
      baseUrl: "http://core.local",
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            projection: "STATUS_ONLY",
            domainReceiptId: randomUUID(),
            receiptSha256: "a".repeat(64),
            operationId: randomUUID(),
            outcome: "APPLIED",
            targetRevision: null,
          }),
        ),
    },
    token,
  );
  await expect(wrong.receipt(context, operation)).rejects.toThrow(
    "CORE_RECEIPT_SCOPE_MISMATCH",
  );
});
it("fences a late capability response after A→B→A", async () => {
  const ctx = await captureAccountRequestContext(trip, async () => actor);
  const transport = createCoreV2Transport(
    async () => actor,
    hash,
    {
      baseUrl: "http://core.local",
      fetchImplementation: async () => {
        const lease = await beginAccountTransition();
        endAccountTransition(lease);
        return new Response("{}");
      },
    },
    token,
  );
  await expect(transport.capabilities(ctx)).rejects.toThrow();
});
