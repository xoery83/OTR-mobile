import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import {
  fixture,
  sha256,
  now,
} from "../repositories/__fixtures__/captureBatchAssessment";
import { createCapturePhotoImportDecisionRepository } from "../repositories/capturePhotoImportDecisionRepository";
import { createUniversalPhotoRelevanceActions } from "./universalPhotoRelevanceActions";
import { captureFilePngPhotoDecisionsDefinition } from "../db/migrations/captureFilePngPhotoDecisions";
import { assertPngPhotoConsent } from "./universalPhotoConsent";

async function setup(mixed = false, files = false) {
  const f = fixture(true, 75),
    request = f.request(mixed ? 3 : 1),
    trip = randomUUID();
  if (files) f.sql.exec(captureFilePngPhotoDecisionsDefinition.sql);
  request.context.tripPrior = { id: trip, origin: "PRIOR", observedAt: now() };
  Object.assign(request.inputs[0], {
    kind: files ? "FILE" : "IMAGE",
    acquisitionSource: files ? "files" : "photos",
    originalFilename: files ? "material.png" : null,
    declaredContentType: "image/png",
  });
  const bytes = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0);
  const job = await f.submissions.submit(
    request,
    new Map(
      request.inputs.map((input) => [
        input.id,
        async () => ({
          bytes:
            input.declaredContentType === "image/png"
              ? bytes
              : new TextEncoder().encode("typed note"),
        }),
      ]),
    ),
  );
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(request.accountId, trip, now());
  const context = await captureAccountRequestContext(trip, f.getAccount);
  const decisions = createCapturePhotoImportDecisionRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: randomUUID,
  });
  const extract = vi.fn(async () => ({
    engine: "apple-vision" as const,
    text: "",
    originalSha256: await sha256(bytes),
    originalByteCount: bytes.length,
    observations: [],
  }));
  const deps = {
    getAccountId: f.getAccount,
    submissions: f.submissions,
    captures: f.captures,
    decisions,
  };
  const actions = createUniversalPhotoRelevanceActions(context, {
    ...deps,
    hash: sha256,
    extract,
  });
  const check = (signal?: AbortSignal) =>
    assertPngPhotoConsent(context, request.jobId, deps, signal);
  return { f, request, job, trip, context, actions, check, deps, extract };
}
it.each([false, true])(
  "blocks stale Continue then accepts only exact PNG revision (mixed=%s)",
  async (mixed) => {
    const x = await setup(mixed),
      id = x.request.inputs[0].id;
    const one = await x.actions.screen(x.request.jobId, id);
    await x.actions.choose(
      x.request.jobId,
      one.revision,
      one.decision,
      "CONTINUE_WITH_AI",
    );
    await x.f.captures.assign(x.job.inputs[0].captureId!, x.trip, 1);
    const before = x.f.sql.prepare("SELECT * FROM sync_operations").all();
    await expect(x.check()).rejects.toThrow("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
    const two = await x.actions.screen(x.request.jobId, id);
    expect(two.decision.pin.captureRevision).toBe(2);
    expect(two.decision.choice).toBe("UNDECIDED");
    await expect(x.check()).rejects.toThrow("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
    await x.actions.choose(
      x.request.jobId,
      two.revision,
      two.decision,
      "CONTINUE_WITH_AI",
    );
    expect((await x.check()).captureRevision).toBe(2);
    x.f.reopen();
    expect((await x.check()).captureRevision).toBe(2);
    expect(x.f.sql.prepare("SELECT * FROM sync_operations").all()).toEqual(before);
    expect(x.extract).toHaveBeenCalledTimes(2);
  },
);
it("missing, uncertain and skipped choices never qualify paid analysis", async () => {
  const x = await setup();
  await x.f.captures.assign(x.job.inputs[0].captureId!, x.trip, 1);
  await expect(x.check()).rejects.toThrow("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
  const screened = await x.actions.screen(x.request.jobId, x.request.inputs[0].id);
  await expect(x.check()).rejects.toThrow("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
  await x.actions.choose(x.request.jobId, screened.revision, screened.decision, "SKIP");
  await expect(x.check()).rejects.toThrow("UNIVERSAL_PHOTO_SKIPPED");
});
it("rejects cancellation, foreign Account and a changed retained Trip", async () => {
  const x = await setup(),
    controller = new AbortController();
  controller.abort();
  await expect(x.check(controller.signal)).rejects.toThrow("PHOTO_IMPORT_CANCELLED");
  await expect(
    assertPngPhotoConsent(
      { ...x.context, accountId: randomUUID() },
      x.request.jobId,
      x.deps,
    ),
  ).rejects.toThrow("Account changed");
  await expect(
    assertPngPhotoConsent(
      { ...x.context, tripId: randomUUID() },
      x.request.jobId,
      x.deps,
    ),
  ).rejects.toThrow("UNIVERSAL_PHOTO_SCOPE_CHANGED");
});

it("rejects a newer choice or cancellation that arrives during the original read", async () => {
  const x = await setup(),
    id = x.request.inputs[0].id;
  await x.f.captures.assign(x.job.inputs[0].captureId!, x.trip, 1);
  const screen = await x.actions.screen(x.request.jobId, id);
  const selected = await x.actions.choose(
    x.request.jobId,
    screen.revision,
    screen.decision,
    "CONTINUE_WITH_AI",
  );
  const getForSourceHandoff = async (captureId: string) => {
    const original = await x.f.captures.getForSourceHandoff(captureId);
    await x.actions.choose(x.request.jobId, selected.revision, selected.decision, "SKIP");
    return original;
  };
  await expect(
    assertPngPhotoConsent(x.context, x.request.jobId, {
      ...x.deps,
      captures: { getForSourceHandoff },
    }),
  ).rejects.toThrow("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
  const controller = new AbortController();
  await expect(
    assertPngPhotoConsent(
      x.context,
      x.request.jobId,
      {
        ...x.deps,
        captures: {
          getForSourceHandoff: async (captureId: string) => {
            const original = await x.f.captures.getForSourceHandoff(captureId);
            controller.abort();
            return original;
          },
        },
      },
      controller.signal,
    ),
  ).rejects.toThrow("PHOTO_IMPORT_CANCELLED");
});

it("mixed Files PNG screens and persists the existing explicit choice with FILE identity and exact revision", async () => {
  const x = await setup(true, true),
    id = x.request.inputs[0].id;
  expect(x.job.inputs[0].kind).toBe("FILE");
  await x.f.captures.assign(x.job.inputs[0].captureId!, x.trip, 1);
  const before = x.f.sql.prepare("SELECT * FROM sync_operations").all();
  await expect(x.check()).rejects.toThrow("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
  const screened = await x.actions.screen(x.request.jobId, id);
  expect(screened.decision.pin.captureRevision).toBe(2);
  const saved = await x.actions.choose(
    x.request.jobId,
    screened.revision,
    screened.decision,
    "CONTINUE_WITH_AI",
  );
  expect(await x.check()).toMatchObject({ captureRevision: 2, inputId: id });
  expect(
    (await x.f.captures.getForSourceHandoff(x.job.inputs[0].captureId!)).capture.kind,
  ).toBe("FILE");
  await expect(
    assertPngPhotoConsent(x.context, x.request.jobId, {
      ...x.deps,
      captures: {
        getForSourceHandoff: async (captureId) => {
          const original = await x.f.captures.getForSourceHandoff(captureId);
          return {
            ...original,
            capture: { ...original.capture, kind: "IMAGE" as const },
          };
        },
      },
    }),
  ).rejects.toThrow("UNIVERSAL_PHOTO_SCOPE_CHANGED");
  await x.actions.choose(x.request.jobId, saved.revision, saved.decision, "SKIP");
  await expect(x.check()).rejects.toThrow("UNIVERSAL_PHOTO_SKIPPED");
  expect(x.f.sql.prepare("SELECT * FROM sync_operations").all()).toEqual(before);
  expect(x.extract).toHaveBeenCalledOnce();
});
