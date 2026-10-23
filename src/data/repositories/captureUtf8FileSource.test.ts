import { randomUUID, createHash } from "node:crypto";
import { expect, it } from "vitest";
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
  const c = await repo.captureContext(trip),
    commands = [];
  for (const input of job.inputs) {
    const capture = await f.captures.assign(
      input.captureId!,
      trip,
      input.captureRevision!,
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
    await repo.admit(c, plan);
    const recovery = await repo.recovery(c, plan.id);
    commands.push((recovery.command as { source_command: unknown }).source_command);
  }
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
