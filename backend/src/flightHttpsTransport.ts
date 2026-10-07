import { DEEPSEEK_FLIGHT_DESTINATION, type FlightLiveTransport } from "./deepSeekFlight";
// Low-level transport unit seam; never accepts custody, credentials or host provisioning.
export function createFlightHttpsSend(
  http: typeof fetch = globalThis.fetch,
): FlightLiveTransport["send"] {
  return async (request) => {
    if (
      request.url !== DEEPSEEK_FLIGHT_DESTINATION ||
      request.method !== "POST" ||
      request.redirect !== "error" ||
      request.max_response_bytes !== 131072
    )
      throw new Error("LIVE_DESTINATION_REJECTED");
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30000)]);
    const response = await http(DEEPSEEK_FLIGHT_DESTINATION, {
      method: "POST",
      redirect: "error",
      headers: request.headers,
      body: request.body,
      signal,
    });
    if (
      response.redirected ||
      (response.url && response.url !== DEEPSEEK_FLIGHT_DESTINATION)
    ) {
      await response.body?.cancel();
      throw new Error("LIVE_DESTINATION_REJECTED");
    }
    return {
      status: response.status,
      redirected: response.redirected,
      body: (async function* () {
        if (!response.body) return;
        const reader = response.body.getReader();
        let bytes = 0;
        try {
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            bytes += next.value.byteLength;
            if (bytes > 131072 || signal.aborted) throw new Error("LIVE_RESPONSE_BOUND");
            yield next.value;
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      })(),
    };
  };
}
