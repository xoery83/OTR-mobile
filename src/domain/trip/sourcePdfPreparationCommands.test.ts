import { beforeEach, expect, it, vi } from "vitest";
import {
  pdfPreparationFixture,
  pdfProtocolHash,
} from "../../data/operations/__fixtures__/pdfOriginalPreparation";
import {
  createPendingPdfCommandProposals,
  createPdfDerivativeRequests,
} from "./sourcePdfPreparationCommands";

const fixed = vi.hoisted(() => ({ next: 0 }));
vi.mock("node:crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:crypto")>()),
  randomUUID: () => `11000000-0000-4000-8000-${String(++fixed.next).padStart(12, "0")}`,
}));
beforeEach(() => {
  fixed.next = 0;
});

it("derives stable, distinct phase identities from the same actual acquisition pins", async () => {
  const f = await pdfPreparationFixture([]);
  const scope = { actorId: f.context.accountId, tripId: f.context.tripId };
  const propose = () =>
    createPendingPdfCommandProposals(
      scope,
      f.input.acquisition,
      f.input.acquisitionReceipt,
      pdfProtocolHash,
    );
  const a = await propose();
  expect(await propose()).toEqual(a);
  const ids = [
    a.prepare.operation_id,
    a.upload.operation_id,
    a.verify.operation_id,
    a.registrationOperationId,
    a.sealOperationId,
    a.derivedRepresentationId,
  ];
  expect(new Set(ids).size).toBe(6);
  expect(ids).not.toContain(f.input.acquisition.operation_id);
  expect(a.upload.payload.parent_operation_id).toBe(a.prepare.operation_id);
});
it.each(["scope", "digest", "representation", "state"])(
  "rejects substituted acquisition %s before proposing commands",
  async (field) => {
    const f = await pdfPreparationFixture([]);
    const scope = { actorId: f.context.accountId, tripId: f.context.tripId };
    const r = { ...f.input.acquisitionReceipt };
    if (field === "scope") scope.tripId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    if (field === "digest") r.result_sha256 = "b".repeat(64);
    if (field === "representation")
      r.representation_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    if (field === "state") r.result_remote_state = "VERIFIED";
    await expect(
      createPendingPdfCommandProposals(scope, f.input.acquisition, r, pdfProtocolHash),
    ).rejects.toThrow();
  },
);
it("cannot construct a derivative request from an unverified or altered receipt", async () => {
  const f = await pdfPreparationFixture([]);
  const p = await createPendingPdfCommandProposals(
    { actorId: f.context.accountId, tripId: f.context.tripId },
    f.input.acquisition,
    f.input.acquisitionReceipt,
    pdfProtocolHash,
  );
  const r = await f.transport.verifyOriginal(f.context, p.verify);
  const requests = await createPdfDerivativeRequests(p, r, pdfProtocolHash);
  expect(requests.registration.verificationResultSha256).toBe(r.result_sha256);
  expect(requests.seal.derivedRepresentationId).toBe(p.derivedRepresentationId);
  await expect(
    createPdfDerivativeRequests(
      p,
      { ...r, result_sha256: "b".repeat(64) },
      pdfProtocolHash,
    ),
  ).rejects.toThrow("PDF_SOURCE_RECEIPT_MISMATCH");
});

it("preserves the frozen PDF proposal bytes including all six phase identities", async () => {
  const f = await pdfPreparationFixture([]);
  const commands = await createPendingPdfCommandProposals(
    { actorId: f.context.accountId, tripId: f.context.tripId },
    f.input.acquisition,
    f.input.acquisitionReceipt,
    pdfProtocolHash,
  );
  expect(await pdfProtocolHash(new TextEncoder().encode(JSON.stringify(commands)))).toBe(
    "a7817f27ecee69361d0355d4bfffbc730a8e0eaccc6100c3a4b20b5a99bdf801",
  );
});
