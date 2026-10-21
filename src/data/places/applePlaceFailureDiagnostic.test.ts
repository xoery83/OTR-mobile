import { expect, it } from "vitest";
import { ApplePlaceError, applePlaceFailureDiagnostic } from "./applePlaceProvider";
it("reports bounded categories and excludes raw query, context and exception text", () => {
  const error = Object.assign(new TypeError("private query and account"), {
    accountId: "secret",
    nativeError: "private",
  });
  expect(applePlaceFailureDiagnostic("READ_CONTEXT", error)).toEqual({
    event: "apple_place_failure",
    phase: "READ_CONTEXT",
    code: "UNKNOWN",
    errorType: "TypeError",
    textEncoderAvailable: true,
  });
  expect(
    JSON.stringify(
      applePlaceFailureDiagnostic("private phase", new ApplePlaceError("private code")),
    ),
  ).not.toMatch(/private|secret/);
  expect(
    applePlaceFailureDiagnostic("LOAD_MODULE", new ApplePlaceError("NATIVE_UNAVAILABLE")),
  ).toMatchObject({ code: "NATIVE_UNAVAILABLE" });
});
