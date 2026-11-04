import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { pdfPreparationFixture } from "../../src/data/operations/__fixtures__/pdfOriginalPreparation";
import { buildInitialNativeCommandPlan } from "../../scripts/import/initial_native_command_plan.mjs";

async function fixture() {
  const f = await pdfPreparationFixture([]);
  return {
    version: "otr.native.universal-pin-proposal/1",
    accountId: f.context.accountId,
    tripId: f.context.tripId,
    batchId: randomUUID(),
    submissionSha256: "a".repeat(64),
    inputs: ["application/pdf", "image/png", "text/plain"].map((mime) => {
      const q = structuredClone(f.input.acquisition);
      q.operation_id = randomUUID();
      q.source_id = randomUUID();
      q.payload.original.id = randomUUID();
      q.payload.original.mime_type = mime;
      q.payload.original.material_kind = mime === "text/plain" ? "TEXT" : "BINARY";
      return {
        inputId: randomUUID(),
        sourceState: "PREPARED",
        sha256: q.payload.original.payload_sha256,
        byteCount: q.payload.original.byte_count,
        sourceCommand: q,
        bindingCas: {
          captureRevision: 2,
          materialRevision: 1,
          expectedSourceRevision: null,
        },
      };
    }),
  };
}
it("freezes nine commands plus one immutable-result slot and one exact seal without a receipt", async () => {
  const raw = await fixture(),
    p = await buildInitialNativeCommandPlan(raw);
  expect(await buildInitialNativeCommandPlan(raw)).toEqual(p);
  expect(p.sourceCommandPins).toHaveLength(11);
  const frames = JSON.parse(JSON.stringify(p.sourceCommandPins));
  expect(
    new Set(
      frames
        .filter((f: { command?: object }) => f.command)
        .map((f: { command: { operation_id: string } }) => f.command.operation_id),
    ).size,
  ).toBe(9);
  const registration = frames.find(
    (f: { pdfRegistrationTemplate?: object }) => f.pdfRegistrationTemplate,
  );
  expect(
    registration.pdfRegistrationTemplate.request.verificationResultSha256,
  ).toBeUndefined();
  expect(registration.pdfRegistrationTemplate.request.originalRowRevision).toBe(2);
  expect(p.qualification).toBe("PROJECTED_FRESH_CAS_ONLY_NOT_RECEIPTS_OR_AUTHORITY");
});
it.each(["actor", "bytes", "cas", "duplicate"])(
  "rejects changed %s before output",
  async (kind) => {
    const raw = await fixture();
    if (kind === "actor") raw.inputs[0].sourceCommand.actor_account_id = randomUUID();
    if (kind === "bytes") raw.inputs[0].byteCount++;
    if (kind === "cas") raw.inputs[0].bindingCas.materialRevision = 2;
    if (kind === "duplicate")
      raw.inputs[0].sourceCommand.source_id = raw.inputs[1].sourceCommand.source_id;
    await expect(buildInitialNativeCommandPlan(raw)).rejects.toThrow();
  },
);
