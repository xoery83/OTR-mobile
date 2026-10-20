import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "../auth/accountGeneration";
import {
  createApplePlaceProvider,
  normalizePlaceQuery,
  type ApplePlaceNative,
} from "./applePlaceProvider";
function fixture() {
  let current = true;
  const row = {
    provider: "apple",
    handle: randomUUID(),
    kind: "mapItem",
    title: "Sky Tower",
    secondary: "Auckland",
    address: "Victoria Street, Auckland",
    point: { latitude: -36.848, longitude: 174.762 },
  };
  const reply = (input: Record<string, unknown>, rows = [row]) => ({
    provider: "apple",
    status: "READY",
    sessionId: input.sessionId,
    requestId: input.requestId,
    generation: input.generation,
    candidates: rows,
  });
  const native = {
    complete: vi.fn(async (i: Record<string, unknown>) => reply(i)),
    search: vi.fn(async (i: Record<string, unknown>) => reply(i)),
    resolve: vi.fn(async (i: Record<string, unknown>) => reply(i)),
    cancel: vi.fn(),
  } satisfies ApplePlaceNative;
  const provider = createApplePlaceProvider(native, {
    accountId: randomUUID(),
    tripId: randomUUID(),
    editorId: randomUUID(),
    accountGeneration: getAccountGeneration(),
    isCurrent: () => current,
  });
  return {
    native,
    provider,
    row,
    reply,
    invalidate: () => {
      current = false;
    },
  };
}
it("reuses frozen normalization without changing authored text", () => {
  expect(normalizePlaceQuery("  ２９５ Sandy Bay–Marahau  Road ")).toMatchObject({
    original: "  ２９５ Sandy Bay–Marahau  Road ",
    phrase: "295 Sandy Bay-Marahau Road",
    tokens: ["295", "sandy", "bay-marahau", "road"],
  });
});
it("uses opaque Apple handles, preserves resolved facts and explicit qualified soft bias", async () => {
  const f = fixture(),
    rows = await f.provider.complete({
      text: " Sky Tower ",
      region: { latitude: -36.84, longitude: 174.76 },
    });
  expect(f.native.complete).toHaveBeenCalledOnce();
  expect(f.native.complete.mock.calls[0][0]).toMatchObject({
    text: "Sky Tower",
    region: { latitude: -36.84, longitude: 174.76 },
  });
  expect(f.native.complete.mock.calls[0][0]).not.toHaveProperty("sessionToken");
  expect(await f.provider.resolve(rows[0], { text: "Sky Tower" })).toMatchObject({
    provider: "apple",
    title: "Sky Tower",
    address: "Victoria Street, Auckland",
  });
});
it("caps quick5 and Search More20; makes one request and never performs fill-up calls", async () => {
  const f = fixture();
  f.native.complete.mockImplementation(async (i) =>
    f.reply(
      i,
      Array.from({ length: 20 }, () => ({ ...f.row, handle: randomUUID() })),
    ),
  );
  expect(await f.provider.complete({ text: "Tower" })).toHaveLength(5);
  expect(await f.provider.search({ text: "Tower" })).toHaveLength(1);
  expect(f.native.search).toHaveBeenCalledOnce();
});
it("does not query empty input or invent GPS/placeholder bias", async () => {
  const f = fixture();
  expect(await f.provider.complete({ text: "   " })).toEqual([]);
  expect(f.native.complete).not.toHaveBeenCalled();
  await f.provider.search({ text: "Sky Tower", region: { latitude: 0, longitude: 0 } });
  expect(f.native.search.mock.calls[0][0]).not.toHaveProperty("region");
});
it("cancel abort is generation-scoped and late callbacks cannot write", async () => {
  const f = fixture(),
    controller = new AbortController();
  let finish!: (v: unknown) => void;
  f.native.complete.mockImplementation(
    (i) =>
      new Promise((resolve) => {
        finish = () => resolve(f.reply(i));
      }),
  );
  const pending = f.provider.complete({ text: "Tower" }, controller.signal);
  controller.abort();
  expect(f.native.cancel.mock.calls[0][1]).toBe(1);
  const newer = await f.provider.search({ text: "SkyCity" });
  finish({});
  await expect(pending).rejects.toThrow("CANCELLED");
  expect(newer[0].generation).toBe(2);
});
it("rejects stale selection, wrong response binding, closed editor and Account generation changes", async () => {
  const f = fixture(),
    rows = await f.provider.complete({ text: "Tower" });
  await f.provider.search({ text: "Hotel" });
  await expect(f.provider.resolve(rows[0], { text: "Tower" })).rejects.toThrow(
    "STALE_HANDLE",
  );
  f.native.search.mockImplementation(async (i) => ({
    ...f.reply(i),
    sessionId: randomUUID(),
  }));
  await expect(f.provider.search({ text: "Hotel" })).rejects.toThrow("CANCELLED");
  f.invalidate();
  await expect(f.provider.search({ text: "Hotel" })).rejects.toThrow("CANCELLED");
  const fresh = fixture();
  advanceAccountGeneration();
  await expect(fresh.provider.search({ text: "Hotel" })).rejects.toThrow("CANCELLED");
});
it("exposes no-result and provider failure honestly; never converts errors to synthetic facts", async () => {
  const f = fixture();
  f.native.search.mockImplementation(async (i) => ({
    ...f.reply(i),
    status: "NO_RESULTS",
    candidates: [],
  }));
  expect(await f.provider.search({ text: "Absent" })).toEqual([]);
  f.native.search.mockImplementation(async (i) => ({
    ...f.reply(i),
    status: "NETWORK_ERROR",
    candidates: [],
  }));
  await expect(f.provider.search({ text: "Hotel" })).rejects.toThrow("NETWORK_ERROR");
  f.native.search.mockImplementation(async (i) => ({
    ...f.reply(i),
    candidates: [{ ...f.row, provider: "mock" }],
  }));
  await expect(f.provider.search({ text: "Hotel" })).rejects.toThrow();
});
it("clearing input invalidates pending completion even without a UI cancel call", async () => {
  const f = fixture();
  let finish!: (v: unknown) => void;
  f.native.complete.mockImplementation(
    (i) =>
      new Promise((resolve) => {
        finish = () => resolve(f.reply(i));
      }),
  );
  const pending = f.provider.complete({ text: "Sky Tower" });
  expect(await f.provider.complete({ text: "" })).toEqual([]);
  finish({});
  await expect(pending).rejects.toThrow("CANCELLED");
  expect(f.native.cancel).toHaveBeenCalledWith(expect.any(String), 1);
});
it("rejects UTF8-overlong queries consistently before native dispatch", async () => {
  const f = fixture();
  await expect(f.provider.search({ text: "旅".repeat(700) })).rejects.toThrow(
    "INVALID_REQUEST",
  );
  expect(f.native.search).not.toHaveBeenCalled();
});

it("supports a real precreation draft binding without manufacturing a Trip", async () => {
  const f = fixture();
  let active = true;
  const p = createApplePlaceProvider(f.native, {
    accountId: randomUUID(),
    draftId: randomUUID(),
    editorId: randomUUID(),
    accountGeneration: getAccountGeneration(),
    isCurrent: () => active,
  });
  const rows = await p.complete({ text: "Tokyo" });
  expect(rows).toHaveLength(1);
  const request = f.native.complete.mock.calls[0][0];
  expect(request).not.toHaveProperty("tripId");
  expect(request).not.toHaveProperty("draftId");
  expect(request).not.toHaveProperty("accountId");
  active = false;
  await expect(p.resolve(rows[0], { text: "Tokyo" })).rejects.toMatchObject({
    code: "CANCELLED",
  });
  p.close();
  expect(() =>
    createApplePlaceProvider(f.native, {
      accountId: randomUUID(),
      editorId: randomUUID(),
      tripId: randomUUID(),
      draftId: randomUUID(),
      accountGeneration: getAccountGeneration(),
      isCurrent: () => true,
    } as never),
  ).toThrow("INVALID_BINDING");
});
