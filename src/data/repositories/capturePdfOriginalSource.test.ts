import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fixture, sha256, now } from "./__fixtures__/captureBatchAssessment";
import { createCaptureSourceAdmissionRepository } from "./captureSourceAdmissionRepository";
async function setup(enabled: boolean, badHash = false) {
  const f = fixture(true, 73),
    input = f.request(),
    trip = randomUUID();
  input.inputs[0] = {
    ...input.inputs[0],
    kind: "FILE",
    originalFilename: "Activity.pdf",
    declaredContentType: "application/pdf",
  };
  const bytes = new Uint8Array(
    readFileSync(
      new URL("../../../output/pdf/universal-p6-activity-qa.pdf", import.meta.url),
    ),
  );
  const job = await f.submissions.submit(
    input,
    new Map([[input.inputs[0].id, async () => ({ bytes })]]),
  );
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(input.accountId, trip, now());
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
    intent_kind: "NEW",
    source_id: randomUUID(),
    representation_id: randomUUID(),
    material_revision: 1,
    expected_source_revision: null,
    source_operation_id: randomUUID(),
    source_operation_key: randomUUID(),
  };
  const repository = createCaptureSourceAdmissionRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: randomUUID,
    handoff: f.captures.getForSourceHandoff,
    readSelectedMaterial: async () => null,
    ...(enabled ? { pendingPdfProfile: "OTR_PDF_CAPTURE_ORIGINAL_V1" } : {}),
    verifyBinary: async () => ({
      mimeType: "application/pdf",
      profileId: "OTR_PDF_CAPTURE_ORIGINAL_V1",
      payloadSha256: badHash ? "a".repeat(64) : await sha256(bytes),
      byteCount: bytes.length,
    }),
  } as never);
  return {
    f,
    bytes,
    capture,
    plan,
    repository,
    context: await repository.captureContext(trip),
  };
}
it("pending PDF is closed by default even with a trusted format observation", async () => {
  const f = await setup(false);
  await expect(f.repository.admit(f.context, f.plan as never)).rejects.toThrow(
    "CAPTURE_SOURCE_FORMAT_UNAVAILABLE",
  );
  expect(f.f.sql.prepare("SELECT count(*) AS n FROM trip_sources").get()!.n).toBe(0);
});
it("explicit pending PDF queues the existing BINARY Source command and preserves the original, without claiming verification", async () => {
  const f = await setup(true);
  await f.repository.admit(f.context, f.plan as never);
  const row = f.f.sql
    .prepare(
      "SELECT payload_json FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE'",
    )
    .get()!;
  const command = JSON.parse(row.payload_json as string).source_command;
  expect(command.payload.source_input).toMatchObject({
    source_kind: "FILE",
    acquisition_channel: "FILES",
  });
  expect(command.payload.original).toMatchObject({
    material_kind: "BINARY",
    mime_type: "application/pdf",
    encoding: null,
    text_content: null,
    payload_sha256: await sha256(f.bytes),
    byte_count: f.bytes.length,
  });
  expect(
    f.f.sql.prepare("SELECT registration_state FROM trip_sources").get()!
      .registration_state,
  ).toBe("PENDING");
  expect((await f.f.captures.getForSourceHandoff(f.capture.id)).bytes).toEqual(f.bytes);
  f.f.reopen();
  await f.repository.admit(f.context, f.plan as never);
  expect(
    f.f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE'",
      )
      .get()!.n,
  ).toBe(1);
});
it("pending PDF cannot replace the pinned original hash", async () => {
  const f = await setup(true, true);
  await expect(f.repository.admit(f.context, f.plan as never)).rejects.toThrow(
    "CAPTURE_SOURCE_FORMAT_UNAVAILABLE",
  );
  expect(f.f.sql.prepare("SELECT count(*) AS n FROM trip_sources").get()!.n).toBe(0);
});

it("pending PDF opt-in does not qualify replacement operations", async () => {
  const f = await setup(true);
  await expect(
    f.repository.admit(f.context, {
      ...f.plan,
      intent_kind: "REPLACEMENT",
      material_revision: 2,
      expected_source_revision: 1,
    } as never),
  ).rejects.toThrow("CAPTURE_SOURCE_FORMAT_UNAVAILABLE");
  expect(f.f.sql.prepare("SELECT count(*) AS n FROM trip_sources").get()!.n).toBe(0);
});
