import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { qualifyRecovery } from "./currencyRecovery";
import { CRequestBudget, QA } from "./headless";
import {
  fingerprintParticipation,
  validateParticipationBootstrap,
} from "../../../src/data/repositories/tripPersonCertificate";
import {
  serializeParticipationVector,
  encodeSharedLedgerCursor,
} from "../../../src/domain/trip/participationSnapshot";
const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002";
const hash = async (s: string) => createHash("sha256").update(s).digest("hex");
test("same certified UTF8 SHA bytes retain cursor/account/fingerprint rejection", async () => {
  assert.equal(
    await hash("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  const members = [{ id: A, isParticipating: true, participationRevision: 1 }];
  const fingerprint = await hash(serializeParticipationVector(members));
  assert.equal(await fingerprintParticipation(members, hash), fingerprint);
  const response: any = {
    journey: { id: QA.tripId },
    actor: { userId: A },
    members,
    cursor: encodeSharedLedgerCursor(1, QA.tripId, A, fingerprint),
    participationSnapshot: {
      contractVersion: 1,
      complete: true,
      personCount: 1,
      fingerprintVersion: 1,
      fingerprint,
      observedAt: "2026-10-23T00:00:00.000000Z",
    },
  };
  const context = { accountId: A, tripId: QA.tripId, generation: 0 };
  await validateParticipationBootstrap(response, context, hash);
  await assert.rejects(() =>
    validateParticipationBootstrap({ ...response, actor: { userId: B } }, context, hash),
  );
  await assert.rejects(() =>
    validateParticipationBootstrap(response, context, async () => "0".repeat(64)),
  );
});
test("read19 requires exact actor/op/request hash/immutable receipt/settings and profile", () => {
  const p: any = { settingsRevision: 1, previewDigest: "a".repeat(64) };
  const changeId = "10000000-0000-4000-8000-000000000003";
  const v: any = {
    profile: { id: A, account_role: "free_user" },
    ledger: { journey_id: QA.tripId, settlement_currency: "USD", revision: 2 },
    receipt: {
      actor_user_id: A,
      journey_id: QA.tripId,
      command_type: "CHANGE_JOURNEY_CURRENCY",
      idempotency_key: QA.currencyOperationId,
      payload_hash: createHash("sha256")
        .update(`USD:1:${p.previewDigest}:${QA.currencyOperationId}`)
        .digest("hex"),
      response_status: 200,
      completed_at: "2026-10-23T02:10:00Z",
      response_body: {
        changeId,
        settlementCurrency: "USD",
        settlementScale: 2,
        settingsRevision: 2,
        affectedExpenses: 0,
        unresolvedExpenses: 0,
        idempotentReplay: false,
      },
    },
    change: {
      id: changeId,
      actor_user_id: A,
      journey_id: QA.tripId,
      old_currency: "NZD",
      new_currency: "USD",
      settings_revision: 2,
      preview_digest: p.previewDigest,
    },
  };
  assert.equal(qualifyRecovery(v, A, p).ledger.revision, 2);
  for (const mutate of [
    (x: any) => (x.profile.id = B),
    (x: any) => (x.receipt.payload_hash = "0".repeat(64)),
    (x: any) => (x.receipt.idempotency_key = changeId),
    (x: any) => (x.receipt.response_body.idempotentReplay = true),
    (x: any) => delete x.ledger,
  ]) {
    const bad = structuredClone(v);
    mutate(bad);
    assert.throws(() => qualifyRecovery(bad, A, p));
  }
});
test("recovery budget carries18/4 then one read/one replay/read20 rejects21 and preview", () => {
  const b = new CRequestBudget(
    {
      startsAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      actorIds: { A, B },
      mode: "ISOLATED_PROTOCOL_FIXTURE",
    },
    Date.now,
    18,
    "APPROVED_CURRENCY_RECEIPT_RECOVERY_20",
  );
  assert.equal(b.counts.mutations, 4);
  b.reserve("reads");
  b.reserveMutation("commit");
  b.reserve("reads");
  assert.equal(b.counts.reads, 20);
  assert.equal(b.counts.mutations, 5);
  assert.throws(() => b.reserve("reads"));
  assert.throws(() => b.reserveMutation("preview"));
  assert.throws(() => b.reserveMutation("commit"));
});
