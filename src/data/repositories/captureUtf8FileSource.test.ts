import { prepareUniversalOriginalBatch } from "../operations/universalOriginalBatch";
import { dispatchUniversalOriginalSource } from "../operations/universalOriginalSource";
import { importDigest } from "@/domain/trip/flightImportReview";
import { randomUUID, createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { fixture, sha256, now } from "./__fixtures__/captureBatchAssessment";
import { createCaptureSourceAdmissionRepository } from "./captureSourceAdmissionRepository";
import { UTF8_TEXT_FILE_PROFILE } from "@/domain/capture/utf8TextFile";

async function setup(text = "\ufeff中文原件\r\nKeep CRLF.", name = "Original.txt") {
  const f = fixture(true, 73),
    r = f.request(),
    trip = randomUUID();
  r.inputs[0] = {
    ...r.inputs[0],
    kind: "FILE",
    originalFilename: name,
    declaredContentType: "text/plain",
  };
  const bytes = new TextEncoder().encode(text);
  const job = await f.submissions.submit(
    r,
    new Map([[r.inputs[0].id, async () => ({ bytes })]]),
  );
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(r.accountId, trip, now());
  const capture = await f.captures.assign(
    job.inputs[0].captureId!,
    trip,
    job.inputs[0].captureRevision!,
  );
  const plan = {
    id: randomUUID(),
    admission_key: randomUUID(),
    capture_id: capture.id,
    capture_revision: capture.revision,
    intent_kind: "NEW" as const,
    source_id: randomUUID(),
    representation_id: randomUUID(),
    material_revision: 1,
    expected_source_revision: null,
    source_operation_id: randomUUID(),
    source_operation_key: randomUUID(),
  };
  const repo = (enabled = false) =>
    createCaptureSourceAdmissionRepository(f.db, f.getAccount, {
      sha256,
      now,
      newId: randomUUID,
      handoff: f.captures.getForSourceHandoff,
      readSelectedMaterial: async () => null,
      ...(enabled ? { utf8FileProfile: UTF8_TEXT_FILE_PROFILE } : {}),
    });
  return { f, r, trip, bytes, capture, plan, repo };
}
it("FILE UTF8 owning candidate is explicit, retains filename/source/bytes and queues one immutable existing command", async () => {
  const x = await setup();
  const c = await x.repo().captureContext(x.trip);
  await expect(x.repo().admit(c, x.plan)).rejects.toThrow("FORMAT_UNAVAILABLE");
  expect(x.f.sql.prepare("SELECT count(*) AS n FROM trip_sources").get()!.n).toBe(0);
  await x.repo(true).admit(c, x.plan);
  const before = x.f.sql
    .prepare(
      "SELECT payload_json FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE'",
    )
    .get()!;
  const wire = JSON.parse(before.payload_json as string).source_command;
  expect(wire.payload.source_input).toMatchObject({
    source_kind: "FILE",
    acquisition_channel: "FILES",
  });
  expect(wire.payload.original).toMatchObject({
    material_kind: "TEXT",
    original_filename: "Original.txt",
    encoding: "UTF-8",
    mime_type: null,
    text_content: "\ufeff中文原件\r\nKeep CRLF.",
    byte_count: x.bytes.length,
    payload_sha256: createHash("sha256").update(x.bytes).digest("hex"),
  });
  x.f.reopen();
  await x.repo(true).admit(c, x.plan);
  expect(
    x.f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE'",
      )
      .get()!.n,
  ).toBe(1);
  expect(
    x.f.sql
      .prepare(
        "SELECT payload_json FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE'",
      )
      .get()!,
  ).toEqual(before);
  expect((await x.f.captures.getForSourceHandoff(x.capture.id)).bytes).toEqual(x.bytes);
  expect(
    x.f.sql
      .prepare(
        "SELECT source_kind,acquisition_channel,registration_state FROM trip_sources",
      )
      .get(),
  ).toMatchObject({
    source_kind: "FILE",
    acquisition_channel: "FILES",
    registration_state: "PENDING",
  });
});
it("candidate cannot relabel a PDF header or malformed file as typed PASTE; all original bytes remain", async () => {
  const x = await setup("%PDF-1.4\nnot UTF8-file profile");
  const c = await x.repo(true).captureContext(x.trip);
  await expect(x.repo(true).admit(c, x.plan)).rejects.toThrow(
    "UTF8_TEXT_FILE_UNSUPPORTED",
  );
  expect((await x.f.captures.getForSourceHandoff(x.capture.id)).bytes).toEqual(x.bytes);
  expect(x.f.sql.prepare("SELECT count(*) AS n FROM trip_sources").get()!.n).toBe(0);
});
it("same real C3 mixed Batch prepares two owning Source commands without a model Run or fake snapshot", async () => {
  const { readFileSync, writeFileSync } = await import("node:fs"),
    { basename } = await import("node:path");
  const actor = "00000000-0000-4000-8000-000000000002",
    trip = "10000000-0000-4000-8000-000000000001",
    f = fixture(true, 73);
  await f.switchTo(actor);
  const q = f.request(2);
  q.formatVersion = 2;
  q.manifestVersion = 2;
  const filePath = process.env.OTR_UNIVERSAL_QA_FILE,
    typedPath = process.env.OTR_UNIVERSAL_QA_TYPED;
  const fileBytes = filePath
      ? new Uint8Array(readFileSync(filePath))
      : new TextEncoder().encode("\ufeff真实 .txt 原件\r\nNo rewritten original."),
    name = filePath ? basename(filePath) : "Original.txt";
  const typed = typedPath
    ? readFileSync(typedPath, "utf8")
    : "Visit the museum after lunch.";
  q.inputs[0] = {
    ...q.inputs[0],
    kind: "FILE",
    acquisitionSource: "files",
    originalFilename: name,
    declaredContentType: "text/plain",
  };
  q.inputs[1] = {
    ...q.inputs[1],
    kind: "TEXT",
    acquisitionSource: "magic_input",
    originalFilename: null,
    declaredContentType: "text/plain",
  };
  const job = await f.submissions.submit(
    q,
    new Map<
      string,
      () => Promise<import("../files/capturePayloadReader").CapturePayloadInput>
    >([
      [q.inputs[0].id, async () => ({ bytes: fileBytes })],
      [q.inputs[1].id, async () => ({ text: typed })],
    ]),
  );
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(actor, trip, now());
  const repo = createCaptureSourceAdmissionRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: randomUUID,
    handoff: f.captures.getForSourceHandoff,
    readSelectedMaterial: async () => null,
    utf8FileProfile: UTF8_TEXT_FILE_PROFILE,
  });
  const c = await repo.captureContext(trip);
  const plans = job.inputs.map((input) => ({
    inputId: input.id,
    bindingId: randomUUID(),
    sourceId: randomUUID(),
    representationId: randomUUID(),
    operationId: randomUUID(),
    operationKey: randomUUID(),
  }));
  const dependencies = {
    getAccountId: f.getAccount,
    hash: sha256,
    submissions: f.submissions,
    captures: f.captures,
    sources: repo,
  };
  await expect(
    prepareUniversalOriginalBatch(
      c,
      q.jobId,
      [plans[0], { ...plans[1], operationKey: plans[0].operationKey }],
      dependencies,
    ),
  ).rejects.toThrow("UNIVERSAL_SOURCE_PLAN_REUSED");
  expect(f.sql.prepare("SELECT count(*) AS n FROM trip_sources").get()!.n).toBe(0);
  const prepared = await prepareUniversalOriginalBatch(c, q.jobId, plans, dependencies);
  expect(prepared.unhandledInputIds).toEqual([]);
  expect(await prepareUniversalOriginalBatch(c, q.jobId, plans, dependencies)).toEqual(
    prepared,
  );
  const commands = prepared.inputs.map((i) => i.sourceCommand);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM capture_submission_batches").get()!.n,
  ).toBe(1);
  expect(f.sql.prepare("SELECT count(*) AS n FROM trip_source_runs").get()!.n).toBe(0);
  expect(
    f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE' AND status='PENDING'",
      )
      .get()!.n,
  ).toBe(2);
  const submissionSha256 = f.sql
    .prepare(
      "SELECT request_sha256 AS sha FROM capture_submission_batches WHERE batch_id=?",
    )
    .get(q.batchId)!.sha;
  const output = process.env.OTR_UNIVERSAL_NATIVE_SOURCE_INPUTS;
  if (output)
    writeFileSync(
      output,
      JSON.stringify(
        { actor, trip, batchId: q.batchId, jobId: q.jobId, submissionSha256, commands },
        null,
        2,
      ),
    );
});

async function receiptFor(x: Awaited<ReturnType<typeof setup>>) {
  const r = {
    contract_version: 1,
    operation_id: x.plan.source_operation_id,
    operation_key: x.plan.source_operation_key,
    command: "ACQUIRE_SOURCE",
    operation_sha256: "",
    outcome: "APPLIED",
    error_code: null,
    completed_at: "2026-10-24T00:00:00.000000Z",
    source_id: x.plan.source_id,
    result_source_row_revision: 1,
    result_material_revision: 1,
    representation_id: x.plan.representation_id,
    result_representation_row_revision: 1,
    result_remote_state: "NOT_APPLICABLE",
    result_retention_state: "RETAINED",
    result_action_id: randomUUID(),
    result_verified_at: null,
    result_sha256: "",
  };
  const b = x.f.sql
    .prepare(
      "SELECT source_operation_sha256 FROM local_capture_source_bindings WHERE id=?",
    )
    .get(x.plan.id)!;
  r.operation_sha256 = b.source_operation_sha256 as string;
  r.result_sha256 = await importDigest(
    "otr-source-result-v1",
    [
      1,
      r.operation_id,
      r.command,
      r.operation_sha256,
      r.outcome,
      null,
      r.completed_at,
      1,
      1,
      1,
      r.result_remote_state,
      r.result_retention_state,
      r.result_action_id,
      null,
    ],
    sha256,
  );
  return JSON.stringify(r);
}
it("targeted existing Source queue reconciles UNKNOWN without redispatch and cold recovery completes only after catalog", async () => {
  const x = await setup(),
    repository = x.repo(true),
    c = await repository.captureContext(x.trip);
  await repository.admit(c, x.plan);
  // A fixture catalog installation is explicit here; the genuine PG→catalog path is a separate acceptance receipt.
  const refreshOwningCatalog = async () => {
    for (const t of [
      "trip_sources",
      "trip_source_revisions",
      "trip_source_representations",
    ])
      x.f.sql.exec(
        `UPDATE ${t} SET registration_state='REGISTERED',created_at='2026-10-24T00:00:00.000000Z'`,
      );
  };
  let retained: string | null = null;
  const acquire = vi.fn(async () => {
    throw new Error("SIMULATED_CONNECTION_LOST");
  });
  const dependencies = {
    database: x.f.db,
    getAccountId: x.f.getAccount,
    repository,
    transport: { lookup: async () => retained, acquire },
    refreshOwningCatalog,
  };
  await expect(
    dispatchUniversalOriginalSource(c, x.plan.id, dependencies),
  ).rejects.toThrow("SIMULATED_CONNECTION_LOST");
  expect((await repository.recovery(c, x.plan.id)).binding.state).toBe("OUTCOME_UNKNOWN");
  expect(await dispatchUniversalOriginalSource(c, x.plan.id, dependencies)).toEqual({
    state: "OUTCOME_UNKNOWN",
  });
  expect(acquire).toHaveBeenCalledTimes(1);
  retained = await receiptFor(x);
  x.f.reopen();
  expect(
    await dispatchUniversalOriginalSource(c, x.plan.id, {
      ...dependencies,
      repository: x.repo(true),
    }),
  ).toEqual({ state: "ADMITTED" });
  expect(
    x.f.sql
      .prepare(
        "SELECT status FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE'",
      )
      .get()!.status,
  ).toBe("COMPLETED");
  expect(acquire).toHaveBeenCalledTimes(1);
});
it("account change after result lookup cannot dispatch a Source write", async () => {
  const x = await setup(),
    repository = x.repo(true),
    c = await repository.captureContext(x.trip);
  await repository.admit(c, x.plan);
  const acquire = vi.fn();
  await expect(
    dispatchUniversalOriginalSource(c, x.plan.id, {
      database: x.f.db,
      getAccountId: x.f.getAccount,
      repository,
      transport: {
        lookup: async () => {
          await x.f.switchTo(randomUUID());
          return null;
        },
        acquire,
      },
      refreshOwningCatalog: vi.fn(),
    }),
  ).rejects.toThrow();
  expect(acquire).not.toHaveBeenCalled();
});

it("recovers an interrupted pre-send claim only for the exact Source queue target", async () => {
  const x = await setup(),
    repository = x.repo(true),
    c = await repository.captureContext(x.trip);
  await repository.admit(c, x.plan);
  const r = await repository.recovery(c, x.plan.id);
  x.f.sql
    .prepare(
      "UPDATE sync_operations SET status='PROCESSING',claim_owner='old-process',lease_expires_at='2026-01-01T00:00:00.000Z' WHERE id=?",
    )
    .run(r.operationId!);
  const oldId = randomUUID();
  x.f.sql
    .prepare(
      "INSERT INTO sync_operations(id,owner_user_id,trip_id,entity_type,entity_id,operation_type,idempotency_key,base_version,payload_json,status,created_at,updated_at,claim_owner,lease_expires_at) VALUES(?,?,?,'TRIP_IMPORT',?,'C_ADMIT_CAPTURE_SOURCE',?,NULL,'{}','PROCESSING',?,?,'old-process','2026-01-01T00:00:00.000Z')",
    )
    .run(oldId, c.accountId, c.tripId, randomUUID(), randomUUID(), now(), now());
  const raw = await receiptFor(x),
    acquire = vi.fn(async () => raw);
  const result = await dispatchUniversalOriginalSource(c, x.plan.id, {
    database: x.f.db,
    getAccountId: x.f.getAccount,
    repository,
    transport: { lookup: async () => null, acquire },
    refreshOwningCatalog: async () => {
      for (const t of [
        "trip_sources",
        "trip_source_revisions",
        "trip_source_representations",
      ])
        x.f.sql.exec(
          `UPDATE ${t} SET registration_state='REGISTERED',created_at='2026-10-24T00:00:00.000000Z'`,
        );
    },
  });
  expect(result).toEqual({ state: "ADMITTED" });
  expect(acquire).toHaveBeenCalledOnce();
  expect(
    x.f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(oldId)!.status,
  ).toBe("PROCESSING");
});
