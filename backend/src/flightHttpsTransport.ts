import { DEEPSEEK_FLIGHT_DESTINATION, type FlightLiveTransport } from "./deepSeekFlight";
export const DEEPSEEK_FLIGHT_SEARCH_DESTINATION =
  "https://api.deepseek.com/v1/tools/search" as const;
type FlightHttpsRequest = Omit<Parameters<FlightLiveTransport["send"]>[0], "url"> & {
  url: typeof DEEPSEEK_FLIGHT_DESTINATION | typeof DEEPSEEK_FLIGHT_SEARCH_DESTINATION;
};
// Low-level transport unit seam; never accepts custody, credentials or host provisioning.
export function createFlightHttpsSend(
  http: typeof fetch = globalThis.fetch,
  profile: "FLIGHT_IMPORT_V1" | "FLIGHT_ENRICHMENT_V1" = "FLIGHT_IMPORT_V1",
): (request: FlightHttpsRequest) => ReturnType<FlightLiveTransport["send"]> {
  return async (request) => {
    if (
      (request.url !== DEEPSEEK_FLIGHT_DESTINATION &&
        !(
          profile === "FLIGHT_ENRICHMENT_V1" &&
          request.url === DEEPSEEK_FLIGHT_SEARCH_DESTINATION
        )) ||
      request.method !== "POST" ||
      request.redirect !== "error" ||
      request.max_response_bytes !== 131072
    )
      throw new Error("LIVE_DESTINATION_REJECTED");
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30000)]);
    const response = await http(request.url, {
      method: "POST",
      redirect: "error",
      headers: request.headers,
      body: request.body,
      signal,
    });
    if (response.redirected || (response.url && response.url !== request.url)) {
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
            signal.throwIfAborted();
            if (bytes > 131072) throw new Error("LIVE_RESPONSE_BOUND");
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
