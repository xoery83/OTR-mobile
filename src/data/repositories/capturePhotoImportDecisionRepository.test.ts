import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { migrations } from "@/data/db/migrations";
import { capturePhotoImportDecisionsDefinition as definition } from "@/data/db/migrations/capturePhotoImportDecisions";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import {
  fixture as captureFixture,
  sha256,
  now,
} from "./__fixtures__/captureBatchAssessment";
import { screenUniversalPhotoInput } from "../operations/universalPhotoRelevance";
import { resolvePhotoImportDecision } from "@/domain/capture/photoImportRelevance";
import { createCapturePhotoImportDecisionRepository } from "./capturePhotoImportDecisionRepository";

async function fixture(install = true) {
  const f = (() => {
    const registry = [...migrations];
    try {
      migrations.splice(0, migrations.length, ...registry.filter((m) => m.id <= 74));
      return captureFixture(true, 74);
    } finally {
      migrations.splice(0, migrations.length, ...registry);
    }
  })();
  if (install) f.sql.exec(definition.sql);
  const request = f.request(2);
  request.inputs[0].kind = "TEXT";
  request.inputs[0].declaredContentType = "text/plain";
  request.inputs[1].kind = "IMAGE";
  request.inputs[1].acquisitionSource = "photos";
  request.inputs[1].declaredContentType = "image/jpeg";
  const bytes = Uint8Array.of(255, 216, 255, 1, 2);
  await f.submissions.submit(
    request,
    new Map(
      request.inputs.map((input, index) => [
        input.id,
        async () => (index ? { bytes } : { text: "Existing text source" }),
      ]),
    ),
  );
  const context = () => captureAccountRequestContext("", f.getAccount);
  const extract = async () => ({
    engine: "apple-vision" as const,
    text: "",
    originalSha256: await sha256(bytes),
    originalByteCount: bytes.length,
    observations: [],
  });
  const screen = async () =>
    screenUniversalPhotoInput(await context(), request.jobId, request.inputs[1].id, {
      getAccountId: f.getAccount,
      submissions: f.submissions,
      captures: f.captures,
      hash: sha256,
      extract,
    });
  const create = (getAccountId = f.getAccount) =>
    createCapturePhotoImportDecisionRepository(f.db, getAccountId, {
      sha256,
      now,
      newId: randomUUID,
    });
  const snapshot = () =>
    JSON.stringify({
      headers: f.sql.prepare("SELECT * FROM capture_submission_batches").all(),
      inputs: f.sql.prepare("SELECT * FROM capture_submission_inputs").all(),
      queue: f.sql.prepare("SELECT * FROM sync_operations").all(),
    });
  return {
    ...f,
    request,
    context,
    screen,
    create,
    snapshot,
    count: () =>
      Number(
        f.sql.prepare("SELECT count(*) AS n FROM capture_photo_import_decisions").get()!
          .n,
      ),
  };
}
it("uses an explicit legacy74 fixture even when candidate75 is already registered in the test process", async () => {
  const original = [...migrations];
  try {
    migrations.splice(0, migrations.length, ...original.filter((m) => m.id <= 74), {
      id: 75,
      ...definition,
    });
    const registry = [...migrations];
    const legacy = await fixture(false);
    expect(
      legacy.sql
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='capture_photo_import_decisions'",
        )
        .get(),
    ).toBeUndefined();
    await expect(
      legacy
        .create()
        .read(await legacy.context(), legacy.request.jobId, legacy.request.inputs[1].id),
    ).rejects.toThrow();
    const installed = await fixture();
    expect(installed.count()).toBe(0);
    expect(migrations).toEqual(registry);
  } finally {
    migrations.splice(0, migrations.length, ...original);
  }
});
it("stores and restores UNCERTAIN/Continue/Skip using real SQLite without changing C3 facts or queue", async () => {
  const f = await fixture();
  const before = f.snapshot();
  const initial = await f.screen();
  const repo = f.create();
  const context = await f.context();
  expect(await repo.read(context, f.request.jobId, initial.pin.inputId)).toBeNull();
  const first = await repo.save(context, f.request.jobId, 0, initial);
  expect(first.revision).toBe(1);
  expect(resolvePhotoImportDecision(first.decision, initial.pin)).toBe("WAIT_FOR_USER");
  const continued = await repo.save(context, f.request.jobId, 1, {
    ...initial,
    choice: "CONTINUE_WITH_AI",
  });
  expect(continued.revision).toBe(2);
  f.reopen();
  const restored = await f
    .create()
    .read(await f.context(), f.request.jobId, initial.pin.inputId);
  expect(restored).toEqual(continued);
  expect(resolvePhotoImportDecision(restored!.decision, initial.pin)).toBe(
    "QUALIFY_ORIGINAL_IMAGE",
  );
  const skipped = await f
    .create()
    .save(await f.context(), f.request.jobId, 2, { ...initial, choice: "SKIP" });
  f.reopen();
  expect(
    await f.create().read(await f.context(), f.request.jobId, initial.pin.inputId),
  ).toEqual(skipped);
  expect(f.snapshot()).toBe(before);
  expect(f.count()).toBe(1);
});
it("does not increment a revision on identical replay, even with the pre-commit expected revision", async () => {
  const f = await fixture();
  const decision = await f.screen();
  const repo = f.create();
  const context = await f.context();
  const one = await repo.save(context, f.request.jobId, 0, decision);
  expect(await repo.save(context, f.request.jobId, 0, decision)).toEqual(one);
  expect(f.count()).toBe(1);
  await expect(
    repo.save(context, f.request.jobId, 0, { ...decision, choice: "SKIP" }),
  ).rejects.toThrow("PHOTO_IMPORT_DECISION_CONFLICT");
});
it("serializes competing choices and prevents lost updates", async () => {
  const f = await fixture();
  const decision = await f.screen();
  const repo = f.create();
  const context = await f.context();
  await repo.save(context, f.request.jobId, 0, decision);
  const outcomes = await Promise.allSettled([
    repo.save(context, f.request.jobId, 1, { ...decision, choice: "SKIP" }),
    repo.save(context, f.request.jobId, 1, { ...decision, choice: "CONTINUE_WITH_AI" }),
  ]);
  expect(outcomes.map((v) => v.status)).toEqual(["fulfilled", "rejected"]);
  expect(
    (await repo.read(context, f.request.jobId, decision.pin.inputId))!.revision,
  ).toBe(2);
});
it("preserves explicit intent when local OCR screening is repeated", async () => {
  const f = await fixture();
  const decision = await f.screen();
  const repo = f.create();
  const context = await f.context();
  const chosen = await repo.save(context, f.request.jobId, 0, {
    ...decision,
    choice: "CONTINUE_WITH_AI",
  });
  expect(await repo.save(context, f.request.jobId, 1, decision)).toEqual(chosen);
  expect(
    (await repo.read(context, f.request.jobId, decision.pin.inputId))!.decision.choice,
  ).toBe("CONTINUE_WITH_AI");
});
it("reads the exact same accepted choice after a lost commit acknowledgement without another revision", async () => {
  const f = await fixture();
  const decision = await f.screen();
  const context = await f.context();
  const transaction = f.db.withTransactionAsync.bind(f.db);
  let lose = true;
  f.db.withTransactionAsync = async (work) => {
    await transaction(work);
    if (lose) {
      lose = false;
      throw new Error("ACK_LOST");
    }
  };
  await expect(f.create().save(context, f.request.jobId, 0, decision)).rejects.toThrow(
    "ACK_LOST",
  );
  const result = await f
    .create()
    .read(await f.context(), f.request.jobId, decision.pin.inputId);
  expect(result!.revision).toBe(1);
  expect(await f.create().save(await f.context(), f.request.jobId, 0, decision)).toEqual(
    result,
  );
});
it("does not leak or write another Account's decision and rejects a stale generation", async () => {
  const f = await fixture();
  const decision = await f.screen();
  const firstContext = await f.context();
  await f.create().save(firstContext, f.request.jobId, 0, decision);
  const account = await f.getAccount();
  await f.switchTo(randomUUID());
  await expect(
    f.create().read(firstContext, f.request.jobId, decision.pin.inputId),
  ).rejects.toThrow("Account changed");
  await expect(
    f.create().read(await f.context(), f.request.jobId, decision.pin.inputId),
  ).rejects.toThrow();
  await expect(
    f.create().save(await f.context(), f.request.jobId, 1, decision),
  ).rejects.toThrow("PHOTO_IMPORT_DECISION_SCOPE");
  await f.switchTo(account);
  await expect(
    f.create().save(firstContext, f.request.jobId, 1, decision),
  ).rejects.toThrow("Account changed");
  expect(
    (await f.create().read(await f.context(), f.request.jobId, decision.pin.inputId))!
      .revision,
  ).toBe(1);
});
it("rolls back a canceled or changed-Account save before commit", async () => {
  for (const change of ["cancel", "account"] as const) {
    const f = await fixture();
    const decision = await f.screen();
    const context = await f.context();
    const controller = new AbortController();
    let stale = false;
    const run = f.db.runAsync.bind(f.db);
    f.db.runAsync = async (q, ...params) => {
      const r = await run(q, ...(params as unknown as never[]));
      if (q.startsWith("INSERT INTO capture_photo_import_decisions")) {
        if (change === "cancel") controller.abort();
        else stale = true;
      }
      return r;
    };
    const repo = f.create(async () => (stale ? "different-account" : f.getAccount()));
    await expect(
      repo.save(context, f.request.jobId, 0, decision, controller.signal),
    ).rejects.toThrow(change === "cancel" ? "PHOTO_IMPORT_CANCELLED" : "Account changed");
    expect(f.count()).toBe(0);
  }
});
it("keeps a stale Capture revision visible but requires explicit re-screen/confirmation after Trip assignment", async () => {
  const f = await fixture();
  const decision = await f.screen();
  const repo = f.create();
  const context = await f.context();
  const first = await repo.save(context, f.request.jobId, 0, {
    ...decision,
    choice: "CONTINUE_WITH_AI",
  });
  const trip = randomUUID();
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(context.accountId, trip, now());
  await f.captures.assign(decision.pin.captureId, trip, decision.pin.captureRevision);
  expect(
    await repo.read(await f.context(), f.request.jobId, decision.pin.inputId),
  ).toEqual({ ...first, status: "ORIGINAL_CHANGED" });
  await expect(
    repo.save(await f.context(), f.request.jobId, 1, decision),
  ).rejects.toThrow("PHOTO_IMPORT_ORIGINAL_CHANGED");
  const screenedAgain = await f.screen();
  await expect(
    repo.save(await f.context(), f.request.jobId, 1, screenedAgain),
  ).rejects.toThrow("PHOTO_IMPORT_ORIGINAL_CHANGED");
  const confirmedAgain = await repo.save(await f.context(), f.request.jobId, 1, {
    ...screenedAgain,
    choice: "CONTINUE_WITH_AI",
  });
  expect(confirmedAgain.revision).toBe(2);
  expect(confirmedAgain.decision.pin.captureRevision).toBe(2);
});
it("rejects changed original pins and a non-image target without writing", async () => {
  const f = await fixture();
  const decision = await f.screen();
  const context = await f.context();
  for (const pin of [
    { ...decision.pin, sha256: "b".repeat(64) },
    { ...decision.pin, ordinal: 0 },
    { ...decision.pin, batchId: randomUUID() },
    { ...decision.pin, inputId: f.request.inputs[0].id },
  ])
    await expect(
      f.create().save(context, f.request.jobId, 0, { ...decision, pin }),
    ).rejects.toThrow();
  expect(f.count()).toBe(0);
});
it("fails closed for malformed records and protects local revision/retention guards", async () => {
  const f = await fixture();
  const decision = await f.screen();
  const context = await f.context();
  await f.create().save(context, f.request.jobId, 0, decision);
  expect(() =>
    f.sql.exec("UPDATE capture_photo_import_decisions SET decision_revision='2'"),
  ).toThrow();
  expect(() => f.sql.exec("DELETE FROM capture_photo_import_decisions")).toThrow(
    "PHOTO_DECISION_RETAINED",
  );
  const malformed = JSON.stringify({ ...decision, extra: true });
  f.sql
    .prepare("UPDATE capture_photo_import_decisions SET decision_revision=2,body_json=?")
    .run(malformed);
  await expect(
    f.create().read(context, f.request.jobId, decision.pin.inputId),
  ).rejects.toThrow("PHOTO_IMPORT_DECISION_INTEGRITY");
});
it("enforces the exact-image database guard even with foreign keys disabled", async () => {
  const f = await fixture();
  const decision = await f.screen();
  f.sql.exec("PRAGMA foreign_keys=OFF");
  const insert = f.sql.prepare(
    "INSERT INTO capture_photo_import_decisions(account_id,input_id,decision_revision,body_json,recorded_at) VALUES(?,?,1,?,?)",
  );
  expect(() =>
    insert.run(decision.pin.accountId, randomUUID(), JSON.stringify(decision), now()),
  ).toThrow("PHOTO_DECISION_ORIGINAL_CHANGED");
  const bad = { ...decision, pin: { ...decision.pin, sha256: "b".repeat(64) } };
  expect(() =>
    insert.run(decision.pin.accountId, decision.pin.inputId, JSON.stringify(bad), now()),
  ).toThrow("PHOTO_DECISION_ORIGINAL_CHANGED");
  const large = { ...decision, extra: "x".repeat(5000) };
  expect(() =>
    insert.run(
      decision.pin.accountId,
      decision.pin.inputId,
      JSON.stringify(large),
      now(),
    ),
  ).toThrow();
  expect(f.count()).toBe(0);
});

// Local synthetic SQLite fixtures only; no account purge implementation is assumed.
it("preserves actual C3/LocalCapture retention with a Photo child record installed", async () => {
  const f = await fixture();
  const decision = await f.screen();
  const context = await f.context();
  const saved = await f.create().save(context, f.request.jobId, 0, decision);
  const before = f.snapshot();
  const original = await f.captures.getForSourceHandoff(decision.pin.captureId);
  for (const [query, id] of [
    ["DELETE FROM capture_photo_import_decisions WHERE input_id=?", decision.pin.inputId],
    ["DELETE FROM capture_submission_inputs WHERE input_id=?", decision.pin.inputId],
    ["DELETE FROM capture_submission_batches WHERE batch_id=?", decision.pin.batchId],
    ["DELETE FROM local_capture_payloads WHERE id=?", decision.pin.payloadId],
  ])
    expect(() => f.sql.prepare(query).run(id)).toThrow(/RETAINED|REFERENCED/u);
  await expect(
    f.captures.deleteCapture(decision.pin.captureId, decision.pin.captureRevision),
  ).rejects.toThrow("CAPTURE_SUBMISSION_RETAINED");
  expect(f.snapshot()).toBe(before);
  expect(await f.captures.getForSourceHandoff(decision.pin.captureId)).toEqual(original);
  expect(await f.create().read(context, f.request.jobId, decision.pin.inputId)).toEqual(
    saved,
  );
});
it("rejects reparenting retained Photo/C3/LocalCapture identities without altering normal Account data", async () => {
  const f = await fixture();
  const decision = await f.screen();
  const context = await f.context();
  expect(context.accountId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  );
  const saved = await f.create().save(context, f.request.jobId, 0, decision);
  const before = f.snapshot();
  for (const query of [
    "UPDATE capture_photo_import_decisions SET account_id=? WHERE account_id=?",
    "UPDATE capture_photo_import_decisions SET input_id=? WHERE account_id=?",
    "UPDATE capture_submission_inputs SET account_id=? WHERE account_id=?",
    "UPDATE capture_submission_batches SET account_id=? WHERE account_id=?",
    "UPDATE local_capture_inbox SET account_id=? WHERE account_id=?",
    "UPDATE local_capture_payloads SET account_id=? WHERE account_id=?",
  ])
    expect(() => f.sql.prepare(query).run(randomUUID(), context.accountId)).toThrow();
  expect(f.snapshot()).toBe(before);
  expect(f.count()).toBe(1);
  expect(await f.create().read(context, f.request.jobId, decision.pin.inputId)).toEqual(
    saved,
  );
});
