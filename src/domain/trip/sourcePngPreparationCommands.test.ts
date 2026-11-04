import { expect, it } from "vitest";
import { projectInitialBinaryOriginalCommandProposals } from "./sourceBinaryOriginalCommands";
import {
  pdfPreparationFixture,
  pdfProtocolHash,
} from "../../data/operations/__fixtures__/pdfOriginalPreparation";
import { createPendingPngCommandProposals } from "./sourcePngPreparationCommands";
import { createPendingPdfCommandProposals } from "./sourcePdfPreparationCommands";

it("proposes only three stable PNG original commands in a separate purpose namespace", async () => {
  const f = await pdfPreparationFixture([]),
    scope = { actorId: f.context.accountId, tripId: f.context.tripId };
  const pdf = await createPendingPdfCommandProposals(
    scope,
    f.input.acquisition,
    f.input.acquisitionReceipt,
    pdfProtocolHash,
  );
  const acquisition = structuredClone(f.input.acquisition);
  acquisition.payload.original.mime_type = "image/png";
  const one = await createPendingPngCommandProposals(
    scope,
    acquisition,
    f.input.acquisitionReceipt,
    pdfProtocolHash,
  );
  expect(
    await createPendingPngCommandProposals(
      scope,
      acquisition,
      f.input.acquisitionReceipt,
      pdfProtocolHash,
    ),
  ).toEqual(one);
  expect(Object.keys(one)).toEqual(["prepare", "upload", "verify"]);
  expect(new Set(Object.values(one).map((q) => q.operation_id)).size).toBe(3);
  for (const phase of ["prepare", "upload", "verify"] as const) {
    expect(one[phase].operation_id).not.toBe(pdf[phase].operation_id);
    expect(one[phase].operation_key).toMatch(/^png-(prepare|upload|verify):/);
    expect(one[phase].source_id).toBe(acquisition.source_id);
  }
  expect(one.upload.payload).toMatchObject({
    mime_type: "image/png",
    parent_operation_id: one.prepare.operation_id,
    payload_sha256: acquisition.payload.original.payload_sha256,
  });
  await expect(
    createPendingPdfCommandProposals(
      scope,
      acquisition,
      f.input.acquisitionReceipt,
      pdfProtocolHash,
    ),
  ).rejects.toThrow();
});
it.each(["scope", "mime", "receipt", "state"])(
  "rejects substituted PNG %s",
  async (field) => {
    const f = await pdfPreparationFixture([]),
      scope = { actorId: f.context.accountId, tripId: f.context.tripId },
      q = structuredClone(f.input.acquisition),
      r = { ...f.input.acquisitionReceipt };
    q.payload.original.mime_type = "image/png";
    if (field === "scope") scope.actorId = f.context.tripId;
    if (field === "mime") q.payload.original.mime_type = "image/jpeg";
    if (field === "receipt") r.result_sha256 = "b".repeat(64);
    if (field === "state") r.result_remote_state = "VERIFIED";
    await expect(
      createPendingPngCommandProposals(scope, q, r, pdfProtocolHash),
    ).rejects.toThrow();
  },
);

it("freezes only fresh PNG commands using the live command arithmetic", async () => {
  const f = await pdfPreparationFixture([]);
  const scope = { actorId: f.context.accountId, tripId: f.context.tripId };
  const acquisition = structuredClone(f.input.acquisition);
  acquisition.payload.original.mime_type = "image/png";
  const p = await projectInitialBinaryOriginalCommandProposals(
    scope,
    acquisition,
    pdfProtocolHash,
    "PNG",
  );
  expect({ prepare: p.prepare, upload: p.upload, verify: p.verify }).toEqual(
    await createPendingPngCommandProposals(
      scope,
      acquisition,
      f.input.acquisitionReceipt,
      pdfProtocolHash,
    ),
  );
  await expect(
    projectInitialBinaryOriginalCommandProposals(
      scope,
      f.input.acquisition,
      pdfProtocolHash,
      "PNG",
    ),
  ).rejects.toThrow("INITIAL_SOURCE_PLAN_SCOPE_MISMATCH");
});
