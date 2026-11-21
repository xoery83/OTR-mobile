import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  render: vi.fn(),
  unmount: vi.fn(),
  repository: vi.fn(),
  provider: vi.fn(),
}));
vi.mock("../../../browser/auth-consent/node_modules/react-dom/client.js", () => ({ createRoot: () => fixture }));
vi.mock("@/features/auth/McpOAuthConsent", () => ({ McpOAuthConsent: () => null }));
vi.mock("@/features/auth/McpOperationApproval", () => ({ McpOperationApproval: () => null }));
vi.mock("@/data/auth/mcpBrowserProvider", () => ({
  mcpProviderCallbackPath: "/oauth/provider-callback",
  completeProviderPopup: fixture.provider,
  openMcpProviderPopup: fixture.provider,
}));
vi.mock("@/data/auth/mcpOAuthConsentRepository", () => ({
  createMcpOAuthConsentRepository: fixture.repository,
  mcpConsentConfigSchema: { parse: (value: unknown) => value },
  mcpBetaConsentConfigSchema: { parse: (value: unknown) => value },
}));
vi.mock("@/ui/locale", () => ({
  resolveUiLocale: () => "en",
  setUiLocale: vi.fn(),
  t: () => "Consent",
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

it.each([
  "#managed=22222222-2222-4222-8222-222222222222",
  "#managed=invalid",
  "",
])("disables the old request before reloading changed fragment %s", async (hash) => {
  let change: (() => void) | undefined;
  const reload = vi.fn();
  const oldId = "11111111-1111-4111-8111-111111111111";
  const location = { pathname: "/oauth/consent", href: `https://qa.invalid/oauth/consent#managed=${oldId}`, reload };
  let resolveFetch!: (response: Response) => void;
  const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
  vi.stubGlobal("location", location);
  vi.stubGlobal("document", { documentElement: {}, getElementById: () => ({}) });
  vi.stubGlobal("window", { addEventListener: (_event: string, listener: () => void) => { change = listener; } });
  vi.stubGlobal("navigator", { language: "en" });
  vi.stubGlobal("fetch", fetch);
  await import("../../../browser/auth-consent/main");
  expect(change).toBeTypeOf("function");
  location.href = "https://qa.invalid/oauth/consent" + hash;
  change!();
  expect(fixture.unmount).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
  expect(fixture.unmount.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
  resolveFetch(Response.json({}));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fixture.render).not.toHaveBeenCalled();
  expect(fixture.repository).not.toHaveBeenCalled();
  expect(fixture.provider).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toBe("/oauth/consent/config");
});
