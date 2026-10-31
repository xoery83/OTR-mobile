import { afterEach, expect, it, vi } from "vitest";
import { createMcpConsentPage } from "./mcpConsentPage";
const config = () => ({
  clientId: "11111111-1111-4111-8111-111111111111",
  redirectUris: ["https://chatgpt.com/connector/oauth/unit-fixture"],
  qaEmail: "unit@example.invalid",
  publishableKey: "sb_publishable_unit_fixture_only_not_real",
  accountIds: ["1f3d7935-1bdc-4952-8d7f-0f72077368c1"],
  expiresAt: Date.now() + 60000,
});
const request = (path = "/oauth/consent", method = "GET", host = "api-dev.xoery.art") =>
  new Request(`http://${host}${path}`, { method });
afterEach(() => vi.useRealTimers());
it("does not mount without explicit policy and asset, or for another Host/path", () => {
  expect(createMcpConsentPage()(request())).toBeNull();
  expect(createMcpConsentPage(config())(request())).toBeNull();
  const handle = createMcpConsentPage(config(), new Uint8Array([1]));
  expect(handle(request("/v2/trips"))).toBeNull();
  expect(handle(request("/oauth/consent", "GET", "other.invalid"))).toBeNull();
});
it("serves only a hardened page/public config/static script with no mutation", async () => {
  const original = config(),
    bytes = new TextEncoder().encode("/* unit asset */");
  const handle = createMcpConsentPage(original, bytes);
  original.accountIds[0] = "22222222-2222-4222-8222-222222222222";
  bytes.fill(0);
  const page = handle(request())!;
  expect(await page.text()).toContain('src="/oauth/consent/app.js"');
  expect(page.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  expect(page.headers.get("Content-Security-Policy")).not.toContain(
    "script-src 'unsafe-inline'",
  );
  expect(page.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(page.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await handle(request("/oauth/consent/config"))!.json()).accountIds[0]).toBe(
    "1f3d7935-1bdc-4952-8d7f-0f72077368c1",
  );
  expect(await handle(request("/oauth/consent/app.js"))!.text()).toBe("/* unit asset */");
  expect(handle(request("/oauth/consent", "POST"))!.status).toBe(405);
});
it("stops all three surfaces at the finite deadline and refuses secret configuration", () => {
  vi.useFakeTimers();
  const c = config(),
    handle = createMcpConsentPage(c, new Uint8Array([1]));
  vi.setSystemTime(c.expiresAt);
  for (const path of ["/oauth/consent", "/oauth/consent/config", "/oauth/consent/app.js"])
    expect(handle(request(path))!.status).toBe(503);
  expect(() =>
    createMcpConsentPage(
      { ...c, publishableKey: "sb_secret_unit_should_not_be_exposed" },
      new Uint8Array([1]),
    ),
  ).toThrow();
});
