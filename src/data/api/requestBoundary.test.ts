import { expect, it, vi } from "vitest";
import { boundedJsonResponse, createRequestBoundary, readBoundedJson } from "./requestBoundary";

it("consumes one bounded in-memory JSON body without platform Response or ReadableStream constructors", async () => {
  vi.stubGlobal("Response", undefined);
  vi.stubGlobal("ReadableStream", undefined);
  const boundary = createRequestBoundary(1000);
  try {
    const response = boundedJsonResponse({ status: "CLOSED" }, { status: 503 });
    expect(response.ok).toBe(false);
    expect(await readBoundedJson(response, 8192, boundary)).toEqual({ status: "CLOSED" });
    expect(await response.body!.getReader().read()).toEqual({ done: true, value: undefined });
    expect(() => boundedJsonResponse({ text: "界".repeat(8192) })).toThrow("BODY_LIMIT");
    const canceled = boundedJsonResponse(null);
    await canceled.body!.cancel();
    expect(await canceled.body!.getReader().read()).toEqual({ done: true, value: undefined });
  } finally { boundary.close(); vi.unstubAllGlobals(); }
});
