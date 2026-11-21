import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  actor,
  trip,
  memberCommand,
  memberReceipt,
} from "../../../backend/src/__fixtures__/tripCoreMemberAccess";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createMemberRemovalTransport } from "./memberRemovalTransport";
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function fixture() {
  let active = actor;
  const account = async () => active;
  const context = await captureAccountRequestContext(trip, account);
  const command = memberCommand(),
    receipt = await memberReceipt(command);
  const projection = { projection: "FULL", domainReceiptId: randomUUID(), receipt };
  const wire = vi.fn(async () => Response.json(projection));
  const transport = createMemberRemovalTransport(
    account,
    hash,
    {
      baseUrl: "https://api-dev.xoery.art",
      fetchImplementation: wire,
    },
    async () => ({ userId: active, token: "synthetic-unit-session-only" }),
  );
  return {
    context,
    command,
    receipt,
    projection,
    wire,
    transport,
    switchAccount() {
      active = randomUUID();
    },
  };
}
it("posts the existing command and validates its FULL receipt; recovery GET preserves original operation", async () => {
  const f = await fixture();
  expect((await f.transport.execute(f.context, f.command))?.receipt).toEqual(f.receipt);
  expect((await f.transport.recover(f.context, f.command))?.receipt).toEqual(f.receipt);
  const calls = f.wire.mock.calls as unknown as [string, RequestInit][];
  expect(calls.map(([url, init]) => [url, init.method])).toEqual([
    [`https://api-dev.xoery.art/v2/trips/${trip}/core/commands`, "POST"],
    [
      `https://api-dev.xoery.art/v2/trips/${trip}/core/operations/${f.command.operationId}`,
      "GET",
    ],
  ]);
  expect(JSON.parse(calls[0][1].body as string)).toEqual(f.command);
  expect(calls[1][1].body).toBeUndefined();
  expect(calls.every(([, init]) => init.redirect === "error")).toBe(true);
});
it("treats only recovery 404 as absent and never resends a POST", async () => {
  const f = await fixture();
  f.wire.mockResolvedValue(Response.json({}, { status: 404 }));
  await expect(f.transport.execute(f.context, f.command)).rejects.toThrow();
  // Responses are consumed once, as with fetch.
  f.wire.mockImplementation(async () => Response.json({}, { status: 404 }));
  await expect(f.transport.recover(f.context, f.command)).resolves.toBeNull();
  expect(f.wire).toHaveBeenCalledTimes(2);
});
it("rejects status-only, altered digest, wrong original intent and cross-scope receipts", async () => {
  const f = await fixture();
  for (const raw of [
    { projection: "STATUS_ONLY", operationId: f.command.operationId },
    { ...f.projection, receipt: { ...f.receipt, receiptSha256: "0".repeat(64) } },
    { ...f.projection, receipt: await memberReceipt(memberCommand()) },
  ]) {
    f.wire.mockImplementationOnce(async () => Response.json(raw));
    await expect(f.transport.recover(f.context, f.command)).rejects.toThrow();
  }
  const before = f.wire.mock.calls.length;
  await expect(
    f.transport.execute({ ...f.context, tripId: randomUUID() }, f.command),
  ).rejects.toThrow();
  await expect(
    f.transport.execute(f.context, {
      ...f.command,
      payload: { ...f.command.payload, targetAccountId: actor },
    }),
  ).rejects.toThrow();
  expect(f.wire).toHaveBeenCalledTimes(before);
});
it("fences account changes before IO, during response and during asynchronous hash verification", async () => {
  const f = await fixture();
  f.switchAccount();
  await expect(f.transport.recover(f.context, f.command)).rejects.toThrow();
  expect(f.wire).not.toHaveBeenCalled();
  const g = await fixture();
  g.wire.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    return Response.json(g.projection);
  });
  await expect(g.transport.execute(g.context, g.command)).rejects.toThrow();
  const h = await fixture();
  const transport = createMemberRemovalTransport(
    async () => actor,
    async (b) => {
      advanceAccountGeneration();
      return hash(b);
    },
    { baseUrl: "https://api-dev.xoery.art", fetchImplementation: h.wire },
    async () => ({ userId: actor, token: "synthetic-unit-session-only" }),
  );
  await expect(transport.recover(h.context, h.command)).rejects.toThrow();
});
