import { randomUUID, createHash } from "node:crypto";
import { expect, it } from "vitest";
import { coreHashValue } from "./tripCoreV2Read";
import {
  coreMemberRevokeCommandSchema,
  validateCoreOwningCommand,
  validateCoreMemberRevokeReceipt,
} from "./tripCoreMemberAccess";
import {
  actor,
  trip,
  memberCommand,
  memberReceipt,
} from "../../../backend/src/__fixtures__/tripCoreMemberAccess";
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
it("formal owning parser accepts Trip access vectors without inventing a Person/Item revision", () => {
  expect(validateCoreOwningCommand(memberCommand()).target.kind).toBe("TRIP_ACCESS");
});
it.each(["trip", "kind", "revision", "extra", "admission"])(
  "rejects invalid %s command binding",
  (kind) => {
    const q: any = memberCommand();
    if (kind === "trip") q.target.id = randomUUID();
    if (kind === "kind") q.baseVector[0].kind = "ITEM";
    if (kind === "revision") q.baseVector[0].revision = null;
    if (kind === "extra") q.payload.role = "owner";
    if (kind === "admission") q.admission.mode = "REVIEWED_SOURCE";
    expect(() => coreMemberRevokeCommandSchema.parse(q)).toThrow();
  },
);
it.each(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"])(
  "validates exact %s original receipt; general revision10 is not access revision7",
  async (outcome) => {
    const q = memberCommand(),
      r = await memberReceipt(q, outcome);
    expect(
      (await validateCoreMemberRevokeReceipt(r, actor, trip, q.operationId, hash, q))
        .outcome,
    ).toBe(outcome);
  },
);
it.each(["actor", "target", "epoch", "generalRevisionAsAccess", "changedIntent", "hash"])(
  "rejects rebound %s receipt",
  async (kind) => {
    const q = memberCommand(),
      r: any = await memberReceipt(q);
    if (kind === "actor") r.actorAccountId = randomUUID();
    if (kind === "target") r.accessTransition.personId = randomUUID();
    if (kind === "epoch") r.accessTransition.after.epoch = randomUUID();
    if (kind === "generalRevisionAsAccess") r.targetVector[0].baseRevision = 10;
    if (kind === "changedIntent") q.payload.targetAccountId = randomUUID();
    const { receiptSha256: _, ...body } = r;
    r.receiptSha256 =
      kind === "hash"
        ? "0".repeat(64)
        : await coreHashValue("otr-trip-core-receipt-v2", body, hash);
    await expect(
      validateCoreMemberRevokeReceipt(r, actor, trip, q.operationId, hash, q),
    ).rejects.toThrow();
  },
);
