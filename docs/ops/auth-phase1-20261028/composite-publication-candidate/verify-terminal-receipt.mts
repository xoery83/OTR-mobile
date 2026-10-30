import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { validateGuestAdoptionReceipt } from "../../../../src/domain/auth/guestAdoptionReceipt";
import { guestAdoptionStatusResultSchema } from "../../../../src/domain/auth/guestAdoptionStatus";
import { session } from "../../../../backend/src/__fixtures__/tripCoreV2Sql";
import { createGuestAdoptionTerminalPg } from "../../../../backend/src/guestAdoptionTerminalPg";
import type { CorePgConnection } from "../../../../backend/src/tripCoreV2PgStorage";
const { receipt, request, status } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const verified = await validateGuestAdoptionReceipt(receipt, request, async (bytes) =>
  createHash("sha256").update(bytes).digest("hex"),
);
const terminal = guestAdoptionStatusResultSchema.parse(status);
assert.deepEqual(
  Object.fromEntries(
    Object.keys(request).map((key) => [key, terminal[key as keyof typeof terminal]]),
  ),
  request,
);
assert.equal(terminal.status, "CANCELLED");
if (terminal.status !== "CANCELLED") throw Error("TERMINAL_REQUIRED");
assert.equal(terminal.receipt.receiptId, verified.receiptId);
assert.equal(terminal.receipt.receiptSha256, verified.receiptSha256);
const [container, database] = process.argv.slice(3);
assert(container && database);
const connection: CorePgConnection = {
  async withLease(work) {
    const handle = session(container, { database });
    try {
      return await work(handle.lease);
    } finally {
      handle.close();
    }
  },
};
const port = createGuestAdoptionTerminalPg(connection),
  signal = new AbortController().signal;
assert.deepEqual(await port.cancel(request.targetAccountId, request, signal), receipt);
assert.deepEqual(await port.readStatus(request.targetAccountId, request, signal), status);
assert.deepEqual(
  await port.readReceipt(
    request.targetAccountId,
    { ...request, ...terminal.receipt },
    signal,
  ),
  receipt,
);
process.stdout.write(
  JSON.stringify({
    outcome: verified.outcome,
    receiptId: verified.receiptId,
    receiptSha256: verified.receiptSha256,
    authority: "NONE",
    localRestoreStatus: "REQUIRED_NOT_EXECUTED",
  }),
);
