import { expect, it } from "vitest";
import { nativeFetchDiagnostic } from "./nativeFetchDiagnostic";
it("recognizes structural Expo error names and fixed redirect/invalid-init classes without leaking text", () => {
  for (const [error, expected] of [
    [
      {
        name: "FetchError",
        message:
          "fetch failed: Redirect is not allowed when redirect mode is 'error' https://PRIVATE.invalid",
      },
      { errorName: "FetchError", fetchClass: "REDIRECT_DISALLOWED" },
    ],
    [
      "Cannot cast 'PRIVATE' for field 'redirect' of type NativeRequestInit",
      { thrownType: "STRING", fetchClass: "INVALID_INIT" },
    ],
    [
      { name: "FetchException", message: "The network connection was lost PRIVATE" },
      { errorName: "FetchException", fetchClass: "NETWORK" },
    ],
  ] as const) {
    const result = nativeFetchDiagnostic(error);
    expect(result).toMatchObject(expected);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  }
});
it("allows only NSURLErrorDomain and finite known integer codes through nested cause", () => {
  expect(
    nativeFetchDiagnostic({
      name: "FetchError",
      cause: {
        domain: "NSURLErrorDomain",
        code: -1202,
        userInfo: { url: "PRIVATE_URL" },
      },
    }),
  ).toMatchObject({
    fetchClass: "TLS",
    nativeDomain: "NSURLErrorDomain",
    nativeCode: -1202,
  });
  expect(
    nativeFetchDiagnostic("Error Domain=NSURLErrorDomain Code=-1009 PRIVATE_URL"),
  ).toMatchObject({ nativeCode: -1009, fetchClass: "NETWORK" });
  for (const error of [
    { domain: "PRIVATE_DOMAIN", code: -1009 },
    { domain: "NSURLErrorDomain", code: 123456789 },
    { domain: "NSURLErrorDomain", code: "-1009" },
  ])
    expect(nativeFetchDiagnostic(error).nativeCode).toBeUndefined();
});
it("maps cancellation but keeps unknown messages/names/objects private", () => {
  expect(nativeFetchDiagnostic({ name: "FetchRequestCanceledException" })).toMatchObject({
    fetchClass: "ABORTED",
  });
  const result = nativeFetchDiagnostic({
    name: "PRIVATE_NAME",
    message: "PRIVATE_MESSAGE https://PRIVATE.invalid Bearer PRIVATE_TOKEN",
    stack: "PRIVATE_STACK",
  });
  expect(result).toEqual({ thrownType: "OBJECT", fetchClass: "UNCLASSIFIED" });
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it("handles throwing native field getters without emitting thrown values", () => {
  const error = Object.defineProperty({}, "message", {
    get() {
      throw Error("PRIVATE");
    },
  });
  expect(nativeFetchDiagnostic(error)).toEqual({
    thrownType: "OBJECT",
    fetchClass: "UNCLASSIFIED",
  });
});
