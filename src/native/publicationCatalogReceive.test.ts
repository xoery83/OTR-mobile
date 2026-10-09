import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPublicationCatalogNativeFetch,
  PUBLICATION_CATALOG_DEV_ORIGIN,
} from "./publicationCatalogReceive";
import { createTripPublicationCatalogTransport } from "@/data/api/tripPublicationCatalogTransport";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import fixture from "@/data/repositories/__fixtures__/tripImportCatalogs.json";

const mocks = vi.hoisted(() => ({
  platform: { OS: "ios" },
  native: {
    contractVersion: vi.fn(() => 1),
    receive: vi.fn(),
    cancel: vi.fn(),
    release: vi.fn(),
  },
  require: vi.fn(),
}));
vi.mock("expo", () => ({ requireNativeModule: mocks.require }));
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const actor = fixture.actor_account_id,
  trip = fixture.trip_id;
const token = vi.fn(async () => ({ userId: actor, token: "synthetic-token" }));
const raw = canonicalEventJson(fixture as Json);
const encoded = (text: string) => new TextEncoder().encode(text);
const success = () => ({ status: 200, bytes: encoded(raw) });
async function transport(timeoutMs = 30_000) {
  const fetchImplementation = await createPublicationCatalogNativeFetch();
  const t = createTripPublicationCatalogTransport(
    async () => actor,
    { baseUrl: PUBLICATION_CATALOG_DEV_ORIGIN, fetchImplementation, timeoutMs },
    token,
  );
  const context = await t.captureContext(trip);
  return { t, context, fetchImplementation };
}
beforeEach(() => {
  mocks.platform.OS = "ios";
  mocks.require.mockImplementation(() => mocks.native);
  mocks.native.contractVersion.mockReturnValue(1);
  mocks.native.receive.mockResolvedValue(success());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("trusted iOS Publication adapter", () => {
  it("works with the RN buffered Response shape and exact fixed native request", async () => {
    const { t, context } = await transport();
    vi.stubGlobal("Response", class BufferedResponse {});
    vi.stubGlobal("ReadableStream", undefined);
    await expect(t.read(context)).resolves.toBe(raw);
    expect(mocks.native.receive).toHaveBeenCalledWith(
      expect.any(String),
      trip,
      "synthetic-token",
      expect.any(Number),
      expect.any(Number),
    );
    expect(mocks.native.release).toHaveBeenCalledWith(
      mocks.native.receive.mock.calls[0][0],
    );
    expect(token).toHaveBeenCalledTimes(1);
  });
  it.each(["android", "web"])(
    "%s fails before native acquisition/token/network",
    async (platform) => {
      mocks.platform.OS = platform;
      await expect(createPublicationCatalogNativeFetch()).rejects.toMatchObject({
        code: "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
      });
      expect(mocks.require).not.toHaveBeenCalled();
      expect(token).not.toHaveBeenCalled();
      expect(mocks.native.receive).not.toHaveBeenCalled();
    },
  );
  it("missing native module fails closed", async () => {
    mocks.require.mockImplementation(() => {
      throw new Error("unavailable");
    });
    await expect(createPublicationCatalogNativeFetch()).rejects.toMatchObject({
      code: "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
    });
    expect(token).not.toHaveBeenCalled();
    expect(mocks.native.receive).not.toHaveBeenCalled();
  });
  it.each(["android", "missing", "version"])(
    "rechecks %s before token work",
    async (failure) => {
      const { t, context } = await transport();
      if (failure === "android") mocks.platform.OS = "android";
      if (failure === "missing")
        mocks.require.mockImplementation(() => {
          throw new Error("missing");
        });
      if (failure === "version") mocks.native.contractVersion.mockReturnValue(2);
      await expect(t.read(context)).rejects.toMatchObject({
        code: "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
      });
      expect(token).not.toHaveBeenCalled();
      expect(mocks.native.receive).not.toHaveBeenCalled();
    },
  );
  it("arbitrary fetch flags and copied wrappers cannot bypass the RN guard", async () => {
    const { fetchImplementation } = await transport();
    vi.stubGlobal("Response", class BufferedResponse {});
    for (const send of [
      Object.assign(vi.fn(), { nativeBounded: true }),
      vi.fn((...args: Parameters<typeof fetch>) => fetchImplementation(...args)),
    ]) {
      const t = createTripPublicationCatalogTransport(
        async () => actor,
        { baseUrl: PUBLICATION_CATALOG_DEV_ORIGIN, fetchImplementation: send },
        token,
      );
      await expect(t.read(await t.captureContext(trip))).rejects.toMatchObject({
        code: "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
      });
      expect(send).not.toHaveBeenCalled();
    }
    expect(token).not.toHaveBeenCalled();
  });
  it.each([
    "http://api-dev.xoery.art",
    "https://api.test",
    "https://api-dev.xoery.art/path",
    "https://api-dev.xoery.art/",
    "https://api-dev.xoery.art?query=x",
  ])("rejects unsafe origin %s without native IO", async (baseUrl) => {
    const { fetchImplementation } = await transport();
    const t = createTripPublicationCatalogTransport(
      async () => actor,
      { baseUrl, fetchImplementation },
      token,
    );
    await expect(t.read(await t.captureContext(trip))).rejects.toThrow();
    expect(mocks.native.receive).not.toHaveBeenCalled();
  });
  it("facade denies noncontract methods/paths/headers/body before native IO", async () => {
    const { fetchImplementation } = await transport();
    const url = `${PUBLICATION_CATALOG_DEV_ORIGIN}/v2/trips/${trip}/source-import-catalogs`;
    const valid: RequestInit = {
      method: "GET",
      redirect: "error",
      headers: {
        Authorization: "Bearer synthetic-token",
        "X-OTR-Publication-Catalog-Version": "1",
      },
    };
    for (const [target, init] of [
      [`${url}?x=1`, valid],
      [url, { ...valid, method: "POST" }],
      [url, { ...valid, body: "x" }],
      [url, { ...valid, redirect: "follow" }],
      [url, { ...valid, headers: { ...valid.headers, Other: "x" } }],
    ] as const) {
      await expect(fetchImplementation(target, init)).rejects.toThrow();
    }
    expect(mocks.native.receive).not.toHaveBeenCalled();
  });
  it.each([4_194_304, 4_194_305])(
    "guards completed success bytes %i before original-text admission",
    async (size) => {
      mocks.native.receive.mockResolvedValue({
        status: 200,
        bytes: encoded(raw + " ".repeat(size - encoded(raw).length)),
      });
      const { t, context } = await transport();
      if (size === 4_194_304) await expect(t.read(context)).resolves.toBe(raw);
      else await expect(t.read(context)).rejects.toMatchObject({ code: "BODY_LIMIT" });
    },
  );
  it.each([8192, 8193])("guards completed error bytes %i", async (size) => {
    const error = '{"error":{"code":"BACKEND_UNAVAILABLE"}}';
    mocks.native.receive.mockResolvedValue({
      status: 503,
      bytes: encoded(error + " ".repeat(size - error.length)),
    });
    const { t, context } = await transport();
    await expect(t.read(context)).rejects.toMatchObject({
      code: size === 8192 ? "BACKEND_UNAVAILABLE" : "BODY_LIMIT",
    });
  });
  it.each([
    "REDIRECT_DENIED",
    "TLS_FAILURE",
    "UNSUPPORTED_ENCODING",
    "BUSY",
    "BODY_LIMIT",
  ])("safe native %s withholds bytes", async (code) => {
    mocks.native.receive.mockResolvedValue({ error: code });
    const { t, context } = await transport();
    await expect(t.read(context)).rejects.toMatchObject({ code, details: undefined });
    expect(mocks.native.release).toHaveBeenCalledTimes(1);
  });
  it.each([
    raw.replace('"version":1', '"version":1e0'),
    '{"actor_account_id":"' + trip + '",' + raw.slice(1),
    raw.replace('"version":1', '"version":1.0000000000000001'),
  ])("strict parser rejects ambiguous original bytes", async (text) => {
    mocks.native.receive.mockResolvedValue({ status: 200, bytes: encoded(text) });
    const { t, context } = await transport();
    await expect(t.read(context)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("decodes complete UTF-8 and rejects truncated multibyte input", async () => {
    const unicode = raw.replace('"version":1', '"version":1,"extra":"🌍"');
    const { fetchImplementation } = await transport();
    const send = () =>
      fetchImplementation(
        `${PUBLICATION_CATALOG_DEV_ORIGIN}/v2/trips/${trip}/source-import-catalogs`,
        {
          method: "GET",
          redirect: "error",
          headers: {
            Authorization: "Bearer token",
            "X-OTR-Publication-Catalog-Version": "1",
          },
        },
      );
    mocks.native.receive.mockResolvedValue({ status: 200, bytes: encoded(unicode) });
    const response = await send();
    const first = await response.body!.getReader().read();
    expect(new TextDecoder("utf-8", { fatal: true }).decode(first.value)).toBe(unicode);
    mocks.native.receive.mockResolvedValue({
      status: 200,
      bytes: new Uint8Array([0xf0, 0x9f, 0x8c]),
    });
    const { t, context } = await transport();
    await expect(t.read(context)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("cancellation after completion still withholds the bounded reader", async () => {
    const { fetchImplementation } = await transport();
    const controller = new AbortController();
    const response = await fetchImplementation(
      `${PUBLICATION_CATALOG_DEV_ORIGIN}/v2/trips/${trip}/source-import-catalogs`,
      {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: "Bearer token",
          "X-OTR-Publication-Catalog-Version": "1",
        },
      },
    );
    controller.abort();
    await expect(response.body!.getReader().read()).rejects.toMatchObject({
      code: "REQUEST_CANCELED",
    });
  });

  it("one401 refresh remains JS-owned and capped under the same context", async () => {
    mocks.native.receive
      .mockResolvedValueOnce({
        status: 401,
        bytes: encoded('{"error":{"code":"INVALID_SESSION"}}'),
      })
      .mockResolvedValueOnce(success());
    const { t, context } = await transport();
    await expect(t.read(context)).resolves.toBe(raw);
    expect(token).toHaveBeenCalledTimes(2);
    expect(mocks.native.receive).toHaveBeenCalledTimes(2);
    expect(mocks.native.release).toHaveBeenCalledTimes(2);
  });
  it("A→B→A during native completion cannot return a handoff", async () => {
    mocks.native.receive.mockImplementation(async () => {
      advanceAccountGeneration();
      advanceAccountGeneration();
      return success();
    });
    const { t, context } = await transport();
    await expect(t.read(context)).rejects.toThrow();
    expect(mocks.native.release).toHaveBeenCalledTimes(1);
  });
  it("cancellation terminates native and ignores a late callback", async () => {
    let finish!: (value: unknown) => void;
    mocks.native.receive.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { t, context } = await transport();
    const signal = new AbortController();
    const assertion = expect(t.read(context, signal.signal)).rejects.toMatchObject({
      code: "REQUEST_CANCELED",
    });
    await vi.waitFor(() => expect(mocks.native.receive).toHaveBeenCalledTimes(1));
    signal.abort();
    await assertion;
    finish(success());
    await Promise.resolve();
    expect(mocks.native.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.native.release).toHaveBeenCalledTimes(1);
  });
  it("passes remaining whole-request budget after token wait; stalled JS cannot admit expired bytes", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    mocks.native.receive.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    token.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 900);
      return { userId: actor, token: "synthetic-token" };
    });
    const { t, context } = await transport(1000);
    const assertion = expect(t.read(context)).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
    for (let i = 0; i < 30 && !mocks.native.receive.mock.calls.length; i++)
      await Promise.resolve();
    expect(mocks.native.receive.mock.calls[0][3]).toBeLessThanOrEqual(100);
    vi.setSystemTime(Date.now() + 101);
    finish(success());
    await assertion;
    expect(mocks.native.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.native.release).toHaveBeenCalledTimes(1);
  });
});
