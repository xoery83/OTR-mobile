import { expect, it } from "vitest";
import { universalBindingDiagnostic } from "./universalBindingDiagnostic";

it.each([
  [Error("Query read timeout"), { kind: "Error", code: "PG_QUERY_TIMEOUT" }],
  [Error("CORE_CONNECTION_TIMEOUT"), { kind: "Error", code: "CORE_CONNECTION_TIMEOUT" }],
  [Error("UNIVERSAL_AUTH_REJECTED"), { kind: "Error", code: "UNIVERSAL_AUTH_REJECTED" }],
  [
    Object.assign(Error("private"), { name: "AbortError" }),
    { kind: "AbortError", code: "UNKNOWN" },
  ],
  [
    Object.assign(Error("private"), { name: "TimeoutError" }),
    { kind: "TimeoutError", code: "UNKNOWN" },
  ],
  [
    { code: "42501", message: "private permission detail" },
    { kind: "UNKNOWN", code: "UNKNOWN", sqlState: "42501" },
  ],
] as const)("classifies only known binding failure enums %#", (error, expected) => {
  expect(universalBindingDiagnostic(Object.freeze(error))).toEqual({
    sqlState: undefined,
    ...expected,
  });
});

it.each([
  null,
  "private JWT SQL original https://private.invalid",
  {
    name: "private",
    message: "permission denied for function private_source",
    code: "ABCDE",
    detail: "private",
  },
  { name: "private", message: "Query read timeout private", code: "57014private" },
])("withholds arbitrary names/messages/codes and attached material %#", (error) => {
  expect(universalBindingDiagnostic(error)).toEqual({
    kind: "UNKNOWN",
    code: "UNKNOWN",
    sqlState: undefined,
  });
});
