import { describe, expect, it } from "vitest";
import { operationApprovalIdFromUrl } from "./mcpOperationApprovalLocation";
const id = "688c9038-cd8c-4e81-bae7-ade39b1d0173";
const base = "https://example.test/mcp/approve";
describe("operation approval link attribution", () => {
  it.each([
    `?approval_id=${id}`,
    `?approval_id=${id}&utm_source=chatgpt.com`,
    `?utm_source=chatgpt.com&approval_id=${id}`,
  ])("preserves the sole exact approval ID: %s", (query) => {
    expect(operationApprovalIdFromUrl(new URL(base + query))).toBe(id);
  });
  it.each([
    "",
    "?approval_id=invalid",
    `?approval_id=${id}&approval_id=${id}`,
    `?approval_id=${id}&utm_source=other`,
    `?approval_id=${id}&utm_source=chatgpt.com&utm_source=chatgpt.com`,
    `?approval_id=${id}&redirect_uri=https://evil.test`,
    `?approval_id=${id}&utm_source=chatgpt.com&decision=APPROVE`,
    `?approval_id=${id}&utm_medium=chat`,
  ])("rejects missing, ambiguous or unrecognized parameters: %s", (query) => {
    expect(() => operationApprovalIdFromUrl(new URL(base + query))).toThrow();
  });
  it("does not accept OAuth consent URLs", () => {
    expect(() =>
      operationApprovalIdFromUrl(
        new URL(
          `https://example.test/oauth/consent?approval_id=${id}&utm_source=chatgpt.com`,
        ),
      ),
    ).toThrow();
  });
});
