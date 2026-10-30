import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import {
  fixture,
  now,
  sha256,
} from "../repositories/__fixtures__/captureBatchAssessment";
import { capturePhotoImportDecisionsDefinition } from "../db/migrations/capturePhotoImportDecisions";
import { createCapturePhotoImportDecisionRepository } from "../repositories/capturePhotoImportDecisionRepository";
import { createCaptureProcessingRepository } from "../repositories/captureProcessingRepository";
import { createUniversalPhotoRelevanceActions } from "./universalPhotoRelevanceActions";

async function setup() {
  const f = fixture(true, 74);
  f.sql.exec(capturePhotoImportDecisionsDefinition.sql);
  const request = f.request(2);
  request.inputs[0].kind = "TEXT";
  request.inputs[0].declaredContentType = "text/plain";
  request.inputs[1].kind = "IMAGE";
  request.inputs[1].declaredContentType = "image/jpeg";
  request.inputs[1].acquisitionSource = "photos";
  const bytes = Uint8Array.of(255, 216, 255, 1, 2);
  await f.submissions.submit(
    request,
    new Map(
      request.inputs.map((input, index) => [
        input.id,
        async () => (index ? { bytes } : { text: "Existing mixed text" }),
      ]),
    ),
  );
  const context = () => captureAccountRequestContext("", f.getAccount);
  const storage = { sha256, now, newId: randomUUID };
  await createCaptureProcessingRepository(f.db, f.getAccount, storage).schedule(
    await context(),
    request.jobId,
  );
  const extraction = {
    engine: "apple-vision" as const,
    text: "",
    originalSha256: await sha256(bytes),
    originalByteCount: bytes.length,
    observations: [],
  };
  const extract = vi.fn(async (_bytes: Uint8Array, _mediaType: string) => extraction);
  const repo = () =>
    createCapturePhotoImportDecisionRepository(f.db, f.getAccount, storage);
  const actions = async (signal?: AbortSignal) =>
    createUniversalPhotoRelevanceActions(
      await context(),
      {
        getAccountId: f.getAccount,
        submissions: f.submissions,
        captures: f.captures,
        decisions: repo(),
        hash: sha256,
        extract,
      },
      signal,
    );
  const queue = () => f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const inputId = request.inputs[1].id;
  return {
    f,
    request,
    inputId,
    context,
    actions,
    repo,
    extract,
    extraction,
    queue,
  };
}
it("construction/recovery only read; explicit local screen and choice leave existing queue and Sources unchanged", async () => {
  const x = await setup();
  const queue = x.queue();
  const api = await x.actions();
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    expect(x.extract).not.toHaveBeenCalled();
    expect(await api.read(x.request.jobId, x.inputId)).toBeNull();
    expect(x.extract).not.toHaveBeenCalled();
    const screened = await api.screen(x.request.jobId, x.inputId);
    expect(screened.persisted).toBe(true);
    expect(screened.decision.relevance.status).toBe("UNCERTAIN");
    expect(screened.decision.pin.ordinal).toBe(1);
    const chosen = await api.choose(
      x.request.jobId,
      screened.revision,
      screened.decision,
      "CONTINUE_WITH_AI",
    );
    expect(chosen.decision.choice).toBe("CONTINUE_WITH_AI");
    expect(x.queue()).toEqual(queue);
    expect(x.f.sql.prepare("SELECT count(*) AS n FROM trip_sources").get()!.n).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
it("reuses CURRENT decisions after real SQLite reopen without repeating OCR or changing the choice", async () => {
  const x = await setup();
  const api = await x.actions();
  const screened = await api.screen(x.request.jobId, x.inputId);
  const skipped = await api.choose(
    x.request.jobId,
    screened.revision,
    screened.decision,
    "SKIP",
  );
  x.f.reopen();
  const reopened = await x.actions();
  expect(await reopened.read(x.request.jobId, x.inputId)).toEqual(skipped);
  expect(await reopened.screen(x.request.jobId, x.inputId)).toEqual({
    revision: skipped.revision,
    decision: skipped.decision,
    persisted: true,
  });
  expect(x.extract).toHaveBeenCalledOnce();
});
it("does not carry a stale explicit choice to the newly screened original pin", async () => {
  const x = await setup();
  const api = await x.actions();
  const screen = await api.screen(x.request.jobId, x.inputId);
  const chosen = await api.choose(
    x.request.jobId,
    screen.revision,
    screen.decision,
    "CONTINUE_WITH_AI",
  );
  const context = await x.context();
  const trip = randomUUID();
  x.f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(context.accountId, trip, now());
  await x.f.captures.assign(
    chosen.decision.pin.captureId,
    trip,
    chosen.decision.pin.captureRevision,
  );
  const next = await api.screen(x.request.jobId, x.inputId);
  expect(next.persisted).toBe(false);
  expect(next.decision.choice).toBe("UNDECIDED");
  expect(next.decision.pin.captureRevision).toBe(2);
  expect(await api.read(x.request.jobId, x.inputId)).toEqual({
    ...chosen,
    status: "ORIGINAL_CHANGED",
  });
  const confirmed = await api.choose(
    x.request.jobId,
    next.revision,
    next.decision,
    "SKIP",
  );
  expect(confirmed.decision.choice).toBe("SKIP");
  expect(confirmed.status).toBe("CURRENT");
});
it("binds cancellation to the whole action lifetime and withholds late OCR without persisting", async () => {
  const x = await setup();
  const controller = new AbortController();
  const api = await x.actions(controller.signal);
  x.extract.mockImplementationOnce(async () => {
    controller.abort();
    return x.extraction;
  });
  await expect(api.screen(x.request.jobId, x.inputId)).rejects.toThrow(
    "PHOTO_IMPORT_CANCELLED",
  );
  expect(await x.repo().read(await x.context(), x.request.jobId, x.inputId)).toBeNull();
  await expect(api.read(x.request.jobId, x.inputId)).rejects.toThrow(
    "PHOTO_IMPORT_CANCELLED",
  );
});
it("rejects an Account transition during OCR and retains the previous Account's privacy", async () => {
  const x = await setup();
  const api = await x.actions();
  x.extract.mockImplementationOnce(async () => {
    await x.f.switchTo(randomUUID());
    return x.extraction;
  });
  await expect(api.screen(x.request.jobId, x.inputId)).rejects.toThrow("Account changed");
  await expect(api.read(x.request.jobId, x.inputId)).rejects.toThrow("Account changed");
  expect(
    x.f.sql.prepare("SELECT count(*) AS n FROM capture_photo_import_decisions").get()!.n,
  ).toBe(0);
});
it("preserves exact choice retry and rejects a conflicting stale choice", async () => {
  const x = await setup();
  const api = await x.actions();
  const screen = await api.screen(x.request.jobId, x.inputId);
  const chosen = await api.choose(
    x.request.jobId,
    screen.revision,
    screen.decision,
    "CONTINUE_WITH_AI",
  );
  expect(
    await api.choose(
      x.request.jobId,
      screen.revision,
      screen.decision,
      "CONTINUE_WITH_AI",
    ),
  ).toEqual(chosen);
  await expect(
    api.choose(x.request.jobId, screen.revision, screen.decision, "SKIP"),
  ).rejects.toThrow("PHOTO_IMPORT_DECISION_CONFLICT");
  expect(await api.read(x.request.jobId, x.inputId)).toEqual(chosen);
});
it("recovers a committed local choice after caller cancellation without another OCR", async () => {
  const x = await setup();
  const controller = new AbortController();
  const decisions = x.repo();
  const save = decisions.save.bind(decisions);
  decisions.save = async (...args) => {
    const accepted = await save(...args);
    controller.abort();
    return accepted;
  };
  const api = createUniversalPhotoRelevanceActions(
    await x.context(),
    {
      getAccountId: x.f.getAccount,
      submissions: x.f.submissions,
      captures: x.f.captures,
      decisions,
      hash: sha256,
      extract: x.extract,
    },
    controller.signal,
  );
  await expect(api.screen(x.request.jobId, x.inputId)).rejects.toThrow(
    "PHOTO_IMPORT_CANCELLED",
  );
  const recovered = await x.actions();
  expect((await recovered.read(x.request.jobId, x.inputId))!.revision).toBe(1);
  await recovered.screen(x.request.jobId, x.inputId);
  expect(x.extract).toHaveBeenCalledOnce();
});
