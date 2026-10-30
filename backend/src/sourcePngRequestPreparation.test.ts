import { expect, it, vi } from "vitest";
import { createSourcePngRequestPreparation } from "./sourcePngRequestPreparation";
import type { PdfSourceRequestIoGuard } from "./sourcePdfStorageProducer";
const actor = "f4b059c5-8241-4ffb-aa15-37fa25474543",
  trip = "825f79b2-4a9d-4535-a62e-43000ca50c4a";
function fixture() {
  let guard: PdfSourceRequestIoGuard | undefined;
  const auth = vi.fn(async () => ({ id: actor })),
    canRead = vi.fn(async () => true);
  const port = { lookup: vi.fn(), execute: vi.fn(), reconcile: vi.fn() };
  const prepare = vi.fn<
    Parameters<typeof createSourcePngRequestPreparation>[0]["prepare"]
  >((_scope, provided) => {
    guard = provided;
    return port;
  });
  const factory = createSourcePngRequestPreparation({
    gateway: { validateAccessToken: auth, canReadTrip: canRead } as never,
    actorId: actor,
    tripId: trip,
    assertEnabled: vi.fn(),
    prepare,
  });
  const request = (signal?: AbortSignal) =>
    new Request(
      `https://dev.example.invalid/v2/trips/${trip}/universal-source-originals/png/result`,
      { signal, headers: { Authorization: "Bearer synthetic-not-a-token" } },
    );
  return { factory, request, prepare, port, auth, canRead, guard: () => guard! };
}
it("normal bearer and Trip checks precede producer creation and repeat on guard access", async () => {
  const f = fixture(),
    scoped = await f.factory(f.request(), actor);
  expect(scoped?.port).toBe(f.port);
  expect(f.prepare).toHaveBeenCalledOnce();
  await f.guard().assertCurrent();
  expect(f.auth).toHaveBeenCalledTimes(2);
  expect(f.canRead).toHaveBeenCalledTimes(2);
  scoped?.close();
  await expect(f.guard().assertCurrent()).rejects.toThrow("SOURCE_REQUEST_UNCONFIRMED");
  expect(f.auth).toHaveBeenCalledTimes(2);
});
it("foreign Actor cannot create a producer or touch Auth", async () => {
  const f = fixture();
  await expect(f.factory(f.request(), trip)).rejects.toThrow("SOURCE_ACCESS_DENIED");
  expect(f.auth).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
});
it("Trip revocation stops the same request before any further producer IO", async () => {
  const f = fixture();
  await f.factory(f.request(), actor);
  f.canRead.mockResolvedValue(false);
  await expect(f.guard().assertCurrent()).rejects.toThrow("SOURCE_ACCESS_DENIED");
  expect(f.port.execute).not.toHaveBeenCalled();
});
it("pre-abort cannot create a producer or validate a token", async () => {
  const f = fixture(),
    cancel = new AbortController();
  cancel.abort();
  await expect(f.factory(f.request(cancel.signal), actor)).rejects.toThrow(
    "SOURCE_REQUEST_UNCONFIRMED",
  );
  expect(f.auth).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
});
