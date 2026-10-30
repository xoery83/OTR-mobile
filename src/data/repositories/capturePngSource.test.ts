import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fixture, sha256, now } from "./__fixtures__/captureBatchAssessment";
import { createCaptureSourceAdmissionRepository } from "./captureSourceAdmissionRepository";
import {
  prepareUniversalOriginalBatch,
  recoverUniversalOriginalPlans,
} from "../operations/universalOriginalBatch";
import { PNG_CAPTURE_ORIGINAL_PROFILE } from "@/domain/trip/sourcePngPreparation";
import { createPendingPngOriginalIntakeVerifier } from "@/native/pendingPngOriginal";

async function setup(acquisitionSource: "photos" | "camera" = "photos") {
  const f = fixture(true, 75),
    r = f.request(),
    trip = randomUUID();
  r.context.tripPrior = { id: trip, origin: "PRIOR", observedAt: now() };
  Object.assign(r.inputs[0], {
    kind: "IMAGE",
    acquisitionSource,
    declaredContentType: "image/png",
  });
  // Intentionally only a PNG signature: this is not a qualified/decoded PNG fixture.
  const bytes = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0);
  const job = await f.submissions.submit(
    r,
    new Map([[r.inputs[0].id, async () => ({ bytes })]]),
  );
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(r.accountId, trip, now());
  const repo = (enabled = false) =>
    createCaptureSourceAdmissionRepository(f.db, f.getAccount, {
      sha256,
      now,
      newId: randomUUID,
      handoff: f.captures.getForSourceHandoff,
      readSelectedMaterial: async () => null,
      verifyBinary: createPendingPngOriginalIntakeVerifier(sha256),
      ...(enabled ? { pendingPngProfile: PNG_CAPTURE_ORIGINAL_PROFILE } : {}),
    });
  const context = await repo().captureContext(trip);
  const deps = (enabled = false) => ({
    getAccountId: f.getAccount,
    hash: sha256,
    newId: randomUUID,
    submissions: f.submissions,
    captures: f.captures,
    sources: repo(enabled),
    ...(enabled ? { pendingPngProfile: PNG_CAPTURE_ORIGINAL_PROFILE } : {}),
  });
  return { f, r, trip, bytes, job, repo, context, deps };
}
it.each(["photos", "camera"] as const)(
  "single PNG from %s is closed by omission; pending intake retains existing IDs and bytes",
  async (source) => {
    const x = await setup(source);
    await expect(
      recoverUniversalOriginalPlans(x.context, x.r.jobId, x.deps()),
    ).rejects.toThrow("PROFILE_UNAVAILABLE");
    const plans = await recoverUniversalOriginalPlans(x.context, x.r.jobId, x.deps(true));
    const result = await prepareUniversalOriginalBatch(
      x.context,
      x.r.jobId,
      plans,
      x.deps(true),
    );
    expect(result.inputs[0].sourceId).toBe(plans[0].sourceId);
    expect(result.unhandledInputIds).toEqual([]);
    const row = x.f.sql
      .prepare(
        "SELECT payload_json FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE'",
      )
      .get()!;
    const command = JSON.parse(row.payload_json as string).source_command;
    expect(command.payload.original).toMatchObject({
      material_kind: "BINARY",
      mime_type: "image/png",
      payload_sha256: await sha256(x.bytes),
      byte_count: x.bytes.length,
    });
    expect(command.payload.source_input).toMatchObject({
      source_kind: "IMAGE",
      acquisition_channel: "FILES",
    });
    expect(
      x.f.sql
        .prepare(
          "SELECT registration_state,remote_state,transfer_state FROM trip_source_representations WHERE id=?",
        )
        .get(plans[0].representationId),
    ).toMatchObject({
      registration_state: "PENDING",
      remote_state: "PENDING",
      transfer_state: "PENDING",
    });
    expect((await x.f.submissions.reopen(x.r.jobId)).inputs[0].acquisitionSource).toBe(
      source,
    );
    x.f.reopen();
    expect(
      await recoverUniversalOriginalPlans(x.context, x.r.jobId, x.deps(true)),
    ).toEqual(plans);
    await prepareUniversalOriginalBatch(x.context, x.r.jobId, plans, x.deps(true));
    expect(
      x.f.sql
        .prepare(
          "SELECT count(*) AS n FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE'",
        )
        .get()!.n,
    ).toBe(1);
    expect(
      (await x.f.captures.getForSourceHandoff(x.job.inputs[0].captureId!)).capture
        .revision,
    ).toBe(2);
  },
);
it("pending intake never substitutes for strict PNG format verification", async () => {
  const x = await setup();
  const p = await recoverUniversalOriginalPlans(x.context, x.r.jobId, x.deps(true));
  await expect(
    prepareUniversalOriginalBatch(x.context, x.r.jobId, p, {
      ...x.deps(true),
      sources: x.repo(),
    }),
  ).rejects.toThrow("FORMAT_UNAVAILABLE");
  expect((await createPendingPngOriginalIntakeVerifier(sha256)(x.bytes)).profileId).toBe(
    "OTR_PNG_CAPTURE_ORIGINAL_V1",
  );
  await expect(
    createPendingPngOriginalIntakeVerifier(sha256)(Uint8Array.of(1, 2, 3)),
  ).rejects.toThrow("FORMAT_UNAVAILABLE");
  expect(x.f.sql.prepare("SELECT count(*) AS n FROM trip_sources").get()!.n).toBe(0);
});
