import { afterEach, expect, it, vi } from "vitest";
import { reportEnrichmentDiagnostic } from "./diagnostics";
afterEach(() => vi.restoreAllMocks());
it("logs only an exact whitelisted reason or SQLSTATE, never raw message/stack/detail", () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  reportEnrichmentDiagnostic(
    "SCOPE_GATEWAY",
    Object.assign(Error("secret-token password=synthetic"), {
      code: "42501",
      stack: "secret-stack",
      detail: "secret-detail",
    }),
  );
  reportEnrichmentDiagnostic("SCOPE_GATEWAY", Error("ENRICHMENT_PRICE_CLOSED"));
  reportEnrichmentDiagnostic(
    "SCOPE_GATEWAY",
    Object.assign(Error("ENRICHMENT_PRICE_CLOSED secret-token"), {
      code: "42501 secret-token",
    }),
  );
  expect(log.mock.calls).toEqual([
    ["FLIGHT_ENRICHMENT_DIAGNOSTIC:SCOPE_GATEWAY:STATE_42501"],
    ["FLIGHT_ENRICHMENT_DIAGNOSTIC:SCOPE_GATEWAY:ENRICHMENT_PRICE_CLOSED"],
    ["FLIGHT_ENRICHMENT_DIAGNOSTIC:SCOPE_GATEWAY:UNCLASSIFIED"],
  ]);
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
});
it("snapshots an error property once before classifying it", () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  let reads = 0;
  reportEnrichmentDiagnostic("SCOPE_GATEWAY", {
    get message() {
      return reads++ ? "secret-swapped-message" : "ENRICHMENT_PRICE_CLOSED";
    },
  });
  expect(reads).toBe(1);
  expect(log).toHaveBeenCalledWith(
    "FLIGHT_ENRICHMENT_DIAGNOSTIC:SCOPE_GATEWAY:ENRICHMENT_PRICE_CLOSED",
  );
});
it("unknown stages, hostile properties and a failed logger cannot affect capability behavior", () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  reportEnrichmentDiagnostic("malicious-stage" as never, Error("secret"));
  const hostile = Object.defineProperty({}, "message", {
    get() {
      throw Error("secret");
    },
  });
  expect(() => reportEnrichmentDiagnostic("SCOPE_GATEWAY", hostile)).not.toThrow();
  expect(log).not.toHaveBeenCalled();
  log.mockImplementation(() => {
    throw Error("secret-logger");
  });
  expect(() =>
    reportEnrichmentDiagnostic("LOAD_RUNTIME", Error("secret-error")),
  ).not.toThrow();
});
