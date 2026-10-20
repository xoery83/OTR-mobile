import { describe, it, expect, vi } from "vitest";
import { createFlightHttpsSend } from "./flightHttpsTransport";
import { DEEPSEEK_FLIGHT_DESTINATION, type FlightLiveTransport } from "./deepSeekFlight";
const request = (): Parameters<FlightLiveTransport["send"]>[0] => ({
  url: DEEPSEEK_FLIGHT_DESTINATION,
  method: "POST",
  redirect: "error",
  headers: { Authorization: "Bearer FAKE_UNIT_KEY", "Content-Type": "application/json" },
  body: "{}",
  signal: new AbortController().signal,
  max_response_bytes: 131072,
});
describe("fixed HTTPS transport unit, injected boundary only", () => {
  it("one fixed POST carries Authorization only to the approved origin", async () => {
    const http = vi.fn<typeof fetch>(async () => new Response("ok"));
    const result = await createFlightHttpsSend(http)(request());
    const chunks = [];
    for await (const chunk of result.body) chunks.push(chunk);
    expect(http).toHaveBeenCalledTimes(1);
    expect(http).toHaveBeenCalledWith(
      DEEPSEEK_FLIGHT_DESTINATION,
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: request().headers,
      }),
    );
    expect(new TextDecoder().decode(chunks[0])).toBe("ok");
  });
  it("unapproved destination rejects before attaching Authorization", async () => {
    const http = vi.fn<typeof fetch>();
    await expect(
      createFlightHttpsSend(http)({ ...request(), url: "https://evil.invalid" as never }),
    ).rejects.toThrow("LIVE_DESTINATION_REJECTED");
    expect(http).not.toHaveBeenCalled();
  });
  it.each(["redirect", "different-url"])("rejects %s without retry", async (mode) => {
    const response = new Response("{}");
    Object.defineProperty(response, mode === "redirect" ? "redirected" : "url", {
      value: mode === "redirect" ? true : "https://evil.invalid",
    });
    const http = vi.fn<typeof fetch>(async () => response);
    await expect(createFlightHttpsSend(http)(request())).rejects.toThrow(
      "LIVE_DESTINATION_REJECTED",
    );
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("oversize streamed response rejects with reader cleanup", async () => {
    const http = vi.fn<typeof fetch>(async () => new Response("x".repeat(131073)));
    const result = await createFlightHttpsSend(http)(request());
    await expect(
      (async () => {
        for await (const chunk of result.body) void chunk;
      })(),
    ).rejects.toThrow("LIVE_RESPONSE_BOUND");
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("deadline abort rejects once and does not retry", async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const http = vi.fn<typeof fetch>(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener(
            "abort",
            () => reject(new Error("TEST_TIMEOUT")),
            { once: true },
          );
          deadline.abort();
        }),
    );
    try {
      await expect(createFlightHttpsSend(http)(request())).rejects.toThrow(
        "TEST_TIMEOUT",
      );
      expect(timeout).toHaveBeenCalledWith(30000);
      expect(http).toHaveBeenCalledTimes(1);
    } finally {
      timeout.mockRestore();
    }
  });
  it("connection loss does not retry", async () => {
    const http = vi.fn<typeof fetch>(async () => {
      throw new Error("TEST_LOSS");
    });
    await expect(createFlightHttpsSend(http)(request())).rejects.toThrow("TEST_LOSS");
    expect(http).toHaveBeenCalledTimes(1);
  });
});
