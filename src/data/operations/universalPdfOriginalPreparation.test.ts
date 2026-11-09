import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { prepareAdmittedPdfOriginal } from "./universalPdfOriginalPreparation";
import { pdfPreparationFixture } from "./__fixtures__/pdfOriginalPreparation";
it("continues one existing Source through real journal checkpoints without Task or Core calls", async () => {
  const f = await pdfPreparationFixture([
    "NO_ACTIVE_ATTEMPT",
    "RESERVED",
    "ACK_OBSERVED",
    "READ_OBSERVED",
  ]);
  const result = await prepareAdmittedPdfOriginal(f.context, f.input, f.deps);
  expect(result).toEqual({ request: f.transport.seal.mock.calls[0][1] });
  for (const action of [
    "prepare",
    "reserve",
    "stage",
    "dispatch",
    "observeRetained",
    "finish",
    "verifyOriginal",
    "registerDerived",
    "seal",
  ] as const)
    expect(f.transport[action]).toHaveBeenCalledOnce();
  expect(f.transport.status).toHaveBeenCalledTimes(4);
});
it.each([false, true])(
  "uses the advertised Backend advance without phase polling or write fallback (unknown=%s)",
  async (unknown) => {
    const f = await pdfPreparationFixture(["STAGED"]);
    const oldStatus = f.transport.status.getMockImplementation()!;
    f.transport.status.mockImplementation(async (...args) => ({
      ...(await oldStatus(...args)),
      advanceAvailable: true,
    }));
    if (unknown)
      f.transport.advance.mockRejectedValue(Error("SOURCE_REQUEST_UNCONFIRMED"));
    const result = prepareAdmittedPdfOriginal(f.context, f.input, f.deps);
    if (unknown) await expect(result).rejects.toThrow("SOURCE_REQUEST_UNCONFIRMED");
    else await result;
    expect(f.transport.status).toHaveBeenCalledOnce();
    expect(f.transport.advance).toHaveBeenCalledOnce();
    expect(f.transport.dispatch).not.toHaveBeenCalled();
    expect(f.transport.observeRetained).not.toHaveBeenCalled();
    expect(f.transport.finish).toHaveBeenCalledTimes(unknown ? 0 : 1);
  },
);
it("allows upload to finish before waiting for the shared verification lease", async () => {
  const f = await pdfPreparationFixture(["STAGED", "ACK_OBSERVED", "READ_OBSERVED"]);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const beforeVerification = vi.fn(() => ready);
  const work = prepareAdmittedPdfOriginal(f.context, f.input, {
    ...f.deps,
    beforeVerification,
  });
  await vi.waitFor(() => expect(beforeVerification).toHaveBeenCalledOnce());
  expect(f.transport.finish).toHaveBeenCalledOnce();
  expect(f.transport.verifyOriginal).not.toHaveBeenCalled();
  release();
  await work;
  expect(f.transport.verifyOriginal).toHaveBeenCalledOnce();
});
it.each(["UNKNOWN", "DISPATCH_RECORDED", "RECOVERY_REQUIRED"])(
  "%s never generates a replacement or redispatches",
  async (state) => {
    const f = await pdfPreparationFixture([state]);
    await expect(prepareAdmittedPdfOriginal(f.context, f.input, f.deps)).rejects.toThrow(
      "PDF_UPLOAD_OUTCOME_UNRESOLVED",
    );
    for (const action of [
      "prepare",
      "reserve",
      "stage",
      "dispatch",
      "finish",
      "verifyOriginal",
      "registerDerived",
      "seal",
    ] as const)
      expect(f.transport[action]).not.toHaveBeenCalled();
  },
);
it("explicit reopen reads the journal and reuses the same phase identities without reupload", async () => {
  const f = await pdfPreparationFixture(["READ_OBSERVED", "READ_OBSERVED"]);
  await prepareAdmittedPdfOriginal(f.context, f.input, f.deps);
  await prepareAdmittedPdfOriginal(f.context, f.input, f.deps);
  expect(f.transport.verifyOriginal.mock.calls[1][1]).toEqual(
    f.transport.verifyOriginal.mock.calls[0][1],
  );
  expect(f.transport.registerDerived.mock.calls[1]).toEqual(
    f.transport.registerDerived.mock.calls[0],
  );
  expect(f.transport.seal.mock.calls[1][1]).toEqual(f.transport.seal.mock.calls[0][1]);
  expect(f.transport.dispatch).not.toHaveBeenCalled();
  expect(f.transport.stage).not.toHaveBeenCalled();
});
it("account transition after staging prevents all later steps", async () => {
  const f = await pdfPreparationFixture(["RESERVED"]);
  f.transport.stage.mockImplementation(async () => {
    advanceAccountGeneration();
  });
  await expect(prepareAdmittedPdfOriginal(f.context, f.input, f.deps)).rejects.toThrow();
  expect(f.transport.dispatch).not.toHaveBeenCalled();
  expect(f.transport.verifyOriginal).not.toHaveBeenCalled();
});
it("unknown dispatch response stops once and preserves the existing identity for explicit readback", async () => {
  const f = await pdfPreparationFixture(["STAGED"]);
  f.transport.dispatch.mockRejectedValue(Error("SOURCE_REQUEST_UNCONFIRMED"));
  await expect(prepareAdmittedPdfOriginal(f.context, f.input, f.deps)).rejects.toThrow(
    "SOURCE_REQUEST_UNCONFIRMED",
  );
  expect(f.transport.dispatch).toHaveBeenCalledOnce();
  expect(f.transport.finish).not.toHaveBeenCalled();
});
it("changed original bytes fail before any Source request", async () => {
  const f = await pdfPreparationFixture(["NO_ACTIVE_ATTEMPT"]);
  f.input.bytes[0] = 0;
  await expect(prepareAdmittedPdfOriginal(f.context, f.input, f.deps)).rejects.toThrow();
  expect(f.transport.status).not.toHaveBeenCalled();
});
