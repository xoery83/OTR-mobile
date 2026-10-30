import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import {
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import { useUniversalPhotoRelevance } from "./useUniversalPhotoRelevance";

const h = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  layouts: [] as (() => void)[],
  effects: [] as (() => void)[],
  visible: true,
  account: "11111111-1111-4111-8111-111111111111",
  updates: 0,
  factory: vi.fn(),
  read: vi.fn(),
  screen: vi.fn(),
  choose: vi.fn(),
  signals: [] as AbortSignal[],
}));
vi.mock("react", () => {
  const same = (a: readonly unknown[], b: readonly unknown[]) =>
    a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const effect = (
    list: (() => void)[],
    work: () => void | (() => void),
    deps: readonly unknown[],
  ) => {
    const i = h.cursor++;
    const prior = h.slots[i] as
      { deps: readonly unknown[]; cleanup?: () => void } | undefined;
    if (!prior || !same(prior.deps, deps))
      list.push(() => {
        prior?.cleanup?.();
        h.slots[i] = { deps, cleanup: work() };
      });
  };
  return {
    useState(initial: unknown) {
      const i = h.cursor++;
      if (!(i in h.slots)) h.slots[i] = initial;
      return [
        h.slots[i],
        (value: unknown) => {
          h.updates++;
          h.slots[i] = typeof value === "function" ? value(h.slots[i]) : value;
        },
      ];
    },
    useRef(initial: unknown) {
      const i = h.cursor++;
      if (!(i in h.slots)) h.slots[i] = { current: initial };
      return h.slots[i];
    },
    useCallback(value: unknown, deps: readonly unknown[]) {
      const i = h.cursor++;
      const prior = h.slots[i] as
        { value: unknown; deps: readonly unknown[] } | undefined;
      if (!prior || !same(prior.deps, deps)) h.slots[i] = { value, deps };
      return (h.slots[i] as { value: unknown }).value;
    },
    useLayoutEffect: (work: () => void | (() => void), deps: readonly unknown[]) =>
      effect(h.layouts, work, deps),
    useEffect: (work: () => void | (() => void), deps: readonly unknown[]) =>
      effect(h.effects, work, deps),
  };
});
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: async () => h.account,
}));
vi.mock("@/data/operations/defaultUniversalPhotoRelevance", () => ({
  createDefaultUniversalPhotoRelevanceActions: h.factory,
}));

let model: CaptureJobReadModel;
function input() {
  return model.inputs[0];
}
function stored(revision = 1, originalChanged = false) {
  return {
    revision,
    recordedAt: "2026-10-30T01:00:00Z",
    status: originalChanged ? "ORIGINAL_CHANGED" : "CURRENT",
    decision: {
      version: 1,
      pin: {
        accountId: model.batch.accountId,
        batchId: model.batch.batchId,
        inputId: input().id,
        ordinal: input().ordinal,
        captureId: input().captureId,
        captureRevision: input().captureRevision,
        payloadId: input().payloadId,
        sha256: input().contentSha256,
        byteCount: input().contentByteCount,
        mediaType: input().declaredContentType,
      },
      relevance: { status: "UNCERTAIN", reason: "OCR_INSUFFICIENT" },
      choice: "UNDECIDED",
    },
  };
}
function PhotoHookFixture() {
  return useUniversalPhotoRelevance(model, input(), () => h.visible);
}
function renderPhoto() {
  h.cursor = 0;
  h.layouts = [];
  h.effects = [];
  const result = PhotoHookFixture();
  h.layouts.forEach((work) => work());
  h.effects.forEach((work) => work());
  return result;
}
function unmount() {
  for (const slot of h.slots) {
    const cleanup = (slot as { cleanup?: () => void } | undefined)?.cleanup;
    if (typeof cleanup === "function") cleanup();
  }
}
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function recovered() {
  renderPhoto();
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(renderPhoto().busy).toBeNull());
  return renderPhoto();
}
beforeEach(() => {
  vi.resetAllMocks();
  h.slots = [];
  h.cursor = 0;
  h.signals = [];
  h.visible = true;
  h.updates = 0;
  h.account = "11111111-1111-4111-8111-111111111111";
  model = {
    batch: {
      accountId: h.account,
      batchId: "22222222-2222-4222-8222-222222222222",
      jobId: "33333333-3333-4333-8333-333333333333",
    },
    inputs: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        ordinal: 0,
        revision: 2,
        state: "ACCEPTED",
        kind: "IMAGE",
        acquisitionSource: "photos",
        captureId: "capture-a",
        payloadId: "payload-a",
        captureRevision: 1,
        contentSha256: "a".repeat(64),
        contentByteCount: 5,
        declaredContentType: "image/jpeg",
      },
    ],
  } as unknown as CaptureJobReadModel;
  h.read.mockResolvedValue(null);
  h.factory.mockImplementation(async (_context: unknown, signal: AbortSignal) => {
    h.signals.push(signal);
    return { read: h.read, screen: h.screen, choose: h.choose };
  });
});
afterEach(unmount);

it("mount/reopen performs only passive read with a normal captured context", async () => {
  const row = stored();
  h.read.mockResolvedValue(row);
  const view = await recovered();
  expect(view.value).toMatchObject({
    revision: 1,
    decision: row.decision,
    persisted: true,
    originalChanged: false,
  });
  expect(h.factory).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: h.account, tripId: "" }),
    expect.any(AbortSignal),
  );
  expect(h.screen).not.toHaveBeenCalled();
  expect(h.choose).not.toHaveBeenCalled();
});
it("explicit screen and choice use the exact displayed observation/revision", async () => {
  const view = await recovered();
  const row = stored();
  h.screen.mockResolvedValue({
    revision: row.revision,
    decision: row.decision,
    persisted: true,
  });
  await view.screen();
  const shown = renderPhoto();
  h.choose.mockResolvedValue({ ...row, revision: 2 });
  await shown.choose("CONTINUE_WITH_AI");
  expect(h.choose).toHaveBeenCalledWith(
    model.batch.jobId,
    row.revision,
    row.decision,
    "CONTINUE_WITH_AI",
  );
  expect(renderPhoto().value?.revision).toBe(2);
});
it("busy clicks are not queued or dispatched after a pending read finishes", async () => {
  const read = pending<null>();
  h.read.mockReturnValueOnce(read.promise);
  renderPhoto();
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledOnce());
  await renderPhoto().screen();
  await renderPhoto().screen();
  read.resolve(null);
  await vi.waitFor(() => expect(renderPhoto().busy).toBeNull());
  expect(h.screen).not.toHaveBeenCalled();
});
it("does not overlap two explicit choices on one input", async () => {
  const row = stored();
  h.read.mockResolvedValue(row);
  const view = await recovered();
  const accepted = pending<ReturnType<typeof stored>>();
  h.choose.mockReturnValueOnce(accepted.promise);
  const first = view.choose("CONTINUE_WITH_AI");
  const second = view.choose("SKIP");
  await vi.waitFor(() => expect(h.choose).toHaveBeenCalledOnce());
  accepted.resolve({ ...row, revision: 2 });
  await Promise.all([first, second]);
  expect(h.choose).toHaveBeenCalledOnce();
});
it.each([
  "account",
  "batch",
  "job",
  "input",
  "payload",
  "hash",
  "captureRevision",
  "source",
] as const)("aborts old scope and withholds late reads when %s changes", async (part) => {
  const old = pending<ReturnType<typeof stored>>();
  const oldRow = stored();
  h.read.mockReturnValueOnce(old.promise);
  renderPhoto();
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledOnce());
  const signal = h.signals[0];
  const retained = renderPhoto();
  const changed = { ...input() };
  if (part === "account") {
    model.batch.accountId = "55555555-5555-4555-8555-555555555555";
    h.account = model.batch.accountId;
  }
  if (part === "batch") model.batch.batchId = "66666666-6666-4666-8666-666666666666";
  if (part === "job") model.batch.jobId = "77777777-7777-4777-8777-777777777777";
  if (part === "input") changed.id = "88888888-8888-4888-8888-888888888888";
  if (part === "payload") changed.payloadId = "payload-b";
  if (part === "hash") changed.contentSha256 = "b".repeat(64);
  if (part === "captureRevision") changed.captureRevision = 2;
  if (part === "source") changed.acquisitionSource = "camera";
  model = { ...model, inputs: [changed] };
  renderPhoto();
  expect(signal.aborted).toBe(true);
  old.resolve(oldRow);
  await retained.screen();
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(renderPhoto().busy).toBeNull());
  expect(renderPhoto().value).toBeNull();
  expect(h.screen).not.toHaveBeenCalled();
});
it("the existing Account-generation event aborts outstanding work immediately", async () => {
  const old = pending<ReturnType<typeof stored>>();
  const row = stored();
  h.read.mockReturnValueOnce(old.promise);
  renderPhoto();
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledOnce());
  const signal = h.signals[0];
  const lease = await beginAccountTransition();
  endAccountTransition(lease);
  expect(signal.aborted).toBe(true);
  old.resolve(row);
  renderPhoto();
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(renderPhoto().busy).toBeNull());
  expect(renderPhoto().value).toBeNull();
});
it("hidden/unmounted scopes abort and cannot reuse old handlers after reopening", async () => {
  const view = await recovered();
  const signal = h.signals[0];
  h.visible = false;
  renderPhoto();
  expect(signal.aborted).toBe(true);
  h.visible = true;
  renderPhoto();
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledTimes(2));
  await view.screen();
  expect(h.screen).not.toHaveBeenCalled();
  unmount();
  const before = h.updates;
  const lease = await beginAccountTransition();
  endAccountTransition(lease);
  expect(h.updates).toBe(before);
});
it("requires a new screen before choosing against a stale stored original", async () => {
  const row = stored(2, true);
  row.decision.choice = "CONTINUE_WITH_AI";
  h.read.mockResolvedValue(row);
  const view = await recovered();
  expect(view.canChoose).toBe(false);
  await view.choose("SKIP");
  expect(h.choose).not.toHaveBeenCalled();
  const observation = {
    ...row.decision,
    pin: { ...row.decision.pin, captureRevision: 2 },
    choice: "UNDECIDED",
  };
  h.screen.mockResolvedValue({ revision: 2, decision: observation, persisted: false });
  await view.screen();
  const fresh = renderPhoto();
  expect(fresh.canChoose).toBe(true);
  h.choose.mockResolvedValue({
    ...row,
    revision: 3,
    decision: observation,
    status: "CURRENT",
  });
  await fresh.choose("SKIP");
  expect(h.choose).toHaveBeenCalledWith(model.batch.jobId, 2, observation, "SKIP");
});
it("does not replace a callback's displayed revision with a later read", async () => {
  const one = stored(1);
  h.read.mockResolvedValue(one);
  const seen = await recovered();
  const two = stored(2);
  h.read.mockResolvedValue(two);
  await seen.read();
  h.choose.mockRejectedValueOnce(new Error("PHOTO_IMPORT_DECISION_CONFLICT"));
  await seen.choose("SKIP");
  expect(h.choose).toHaveBeenCalledWith(model.batch.jobId, 1, one.decision, "SKIP");
  expect(renderPhoto().value?.revision).toBe(2);
});
it("drops late choice results when the input changes", async () => {
  const row = stored();
  h.read.mockResolvedValueOnce(row);
  const view = await recovered();
  const accepted = pending<ReturnType<typeof stored>>();
  h.choose.mockReturnValueOnce(accepted.promise);
  const choose = view.choose("SKIP");
  await vi.waitFor(() => expect(h.choose).toHaveBeenCalledOnce());
  model = { ...model, inputs: [{ ...input(), payloadId: "new-payload" }] };
  renderPhoto();
  accepted.resolve({ ...row, revision: 2 });
  await choose;
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(renderPhoto().busy).toBeNull());
  expect(renderPhoto().value).toBeNull();
});
it("initialization errors remain local/unavailable and an explicit read can retry without OCR", async () => {
  h.factory.mockRejectedValueOnce(new Error("PRIVATE_ORIGINAL_OCR_CONTENT"));
  renderPhoto();
  await vi.waitFor(() => expect(renderPhoto().unavailable).toBe(true));
  expect(JSON.stringify(renderPhoto())).not.toContain("PRIVATE_ORIGINAL_OCR_CONTENT");
  await renderPhoto().read();
  expect(h.factory).toHaveBeenCalledTimes(2);
  expect(renderPhoto().unavailable).toBe(false);
  expect(h.screen).not.toHaveBeenCalled();
});
it("ignores non-image/non-accepted inputs without creating a factory", async () => {
  model = {
    ...model,
    inputs: [{ ...input(), kind: "FILE", declaredContentType: "application/pdf" }],
  };
  expect(renderPhoto().eligible).toBe(false);
  await renderPhoto().screen();
  expect(h.factory).not.toHaveBeenCalled();
});
