import { afterEach, expect, it, vi } from "vitest";
import {
  completeProviderPopup,
  isMcpProviderAuthorizeUrl,
  isMcpIdentityLinkRequest,
  mcpIdentityAuthorizePath,
  mcpIdentityStatusPath,
  mcpProviderCallbackPath,
  openMcpProviderPopup,
  providerCallbackMessage,
} from "./mcpBrowserProvider";
const origin = "https://isolated.invalid";
afterEach(() => vi.useRealTimers());
it.each([
  "?code=one&code=two",
  "?access_token=secret",
  "?code=one#refresh_token=secret",
  "?code=one&error=denied",
  "?code=",
  "?code=a.b",
  "?error=x&error=x",
])("rejects malformed/implicit/ambiguous callback %s", (query) => {
  expect(() =>
    providerCallbackMessage(new URL(origin + mcpProviderCallbackPath + query)),
  ).toThrow();
});
it("returns only the code or generic failure, and scrubs callback history before notifying its opener", () => {
  const postMessage = vi.fn(),
    replaceState = vi.fn();
  completeProviderPopup({
    location: { href: origin + mcpProviderCallbackPath + "?code=one-code", origin },
    history: { replaceState },
    opener: { postMessage },
  } as unknown as Window);
  expect(replaceState).toHaveBeenCalledWith(null, "", mcpProviderCallbackPath);
  expect(postMessage).toHaveBeenCalledWith(
    { kind: "OTR_PROVIDER_CODE", code: "one-code" },
    origin,
  );
  expect(
    providerCallbackMessage(
      new URL(
        origin +
          mcpProviderCallbackPath +
          "?error=access_denied&error_description=private",
      ),
    ),
  ).toEqual({ kind: "OTR_PROVIDER_FAILED" });
  expect(() =>
    completeProviderPopup({
      location: { href: origin + mcpProviderCallbackPath + "?code=one", origin },
      history: { replaceState },
      opener: null,
    } as unknown as Window),
  ).toThrow("PROVIDER_OPENER_LOST");
});
function fixture() {
  vi.useFakeTimers();
  let listener: ((event: unknown) => void) | undefined;
  const popup = { closed: false, close: vi.fn(), location: { replace: vi.fn() } };
  const window = {
    location: { origin },
    open: vi.fn(() => popup),
    addEventListener: vi.fn((_name: string, fn: (event: unknown) => void) => {
      listener = fn;
    }),
    removeEventListener: vi.fn(() => {
      listener = undefined;
    }),
  };
  const controller = new AbortController(),
    interaction = openMcpProviderPopup(window as unknown as Window);
  const promise = interaction.receive(origin + "/auth/v1/authorize", controller.signal);
  const emit = (data: unknown, source: unknown = popup, eventOrigin = origin) =>
    listener?.({ data, source, origin: eventOrigin });
  return { popup, window, controller, interaction, promise, emit };
}
it("requires the exact popup and origin; accepts its code once and removes listeners", async () => {
  const q = fixture();
  q.emit({ kind: "OTR_PROVIDER_CODE", code: "wrong-source" }, {});
  q.emit(
    { kind: "OTR_PROVIDER_CODE", code: "wrong-origin" },
    q.popup,
    "https://other.invalid",
  );
  expect(q.popup.close).not.toHaveBeenCalled();
  q.emit({ kind: "OTR_PROVIDER_CODE", code: "original-code" });
  expect(await q.promise).toBe("original-code");
  q.emit({ kind: "OTR_PROVIDER_CODE", code: "late-code" });
  expect(q.popup.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  await expect(q.interaction.receive("unused", q.controller.signal)).rejects.toThrow(
    "USED",
  );
});
it.each(["cancel", "timeout", "closed", "malformed", "providerError"])(
  "fails closed and removes timers/listeners for %s",
  async (kind) => {
    const q = fixture();
    const rejected = expect(q.promise).rejects.toThrow();
    if (kind === "cancel") q.controller.abort();
    if (kind === "timeout") await vi.advanceTimersByTimeAsync(120000);
    if (kind === "closed") {
      q.popup.closed = true;
      await vi.advanceTimersByTimeAsync(250);
    }
    if (kind === "malformed")
      q.emit({ kind: "OTR_PROVIDER_CODE", code: "one", access_token: "forbidden" });
    if (kind === "providerError") q.emit({ kind: "OTR_PROVIDER_FAILED" });
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    expect(q.window.removeEventListener).toHaveBeenCalled();
  },
);
it("a blocked popup does not start any transport", () => {
  expect(() => openMcpProviderPopup({ open: () => null } as unknown as Window)).toThrow(
    "UNAVAILABLE",
  );
});

it.each(["valid", "origin", "return", "plain", "duplicate", "extra", "disabled"])(
  "authorize boundary checks %s",
  (kind) => {
    const u = new URL(
      origin +
        "/auth/v1/authorize?" +
        new URLSearchParams({
          provider: "google",
          redirect_to: origin + mcpProviderCallbackPath,
          code_challenge_method: "s256",
          code_challenge: "a".repeat(43),
        }),
    );
    if (kind === "origin") u.hostname = "other.invalid";
    if (kind === "return") u.searchParams.set("redirect_to", origin + "/other");
    if (kind === "plain") u.searchParams.set("code_challenge_method", "plain");
    if (kind === "duplicate") u.searchParams.append("provider", "google");
    if (kind === "extra") u.searchParams.set("link_identity", "true");
    expect(
      isMcpProviderAuthorizeUrl(u, origin, kind === "disabled" ? [] : ["google"]),
    ).toBe(kind === "valid");
  },
);

it("admits only the configured account's explicit SDK link or the exact original-flow Reader", () => {
  const account = "11111111-1111-4111-8111-111111111111";
  const url = new URL(origin + mcpIdentityAuthorizePath);
  url.search = new URLSearchParams({
    provider: "google",
    redirect_to: origin + mcpProviderCallbackPath,
    code_challenge: "a".repeat(43),
    code_challenge_method: "s256",
    otr_link_confirmed: "true",
    otr_link_account_id: account,
    skip_http_redirect: "true",
  }).toString();
  const matches = (candidate: URL) =>
    isMcpIdentityLinkRequest(candidate, origin, ["google"], account);
  expect(matches(url)).toBe(true);
  for (const [key, value] of [
    ["otr_link_confirmed", "false"],
    ["otr_link_account_id", "22222222-2222-4222-8222-222222222222"],
    ["provider", "apple"],
    ["redirect_to", "https://untrusted.invalid"],
  ]) {
    const invalid = new URL(url);
    invalid.searchParams.set(key, value);
    expect(matches(invalid)).toBe(false);
  }
  expect(matches(new URL(origin + mcpIdentityStatusPath + "?flow_id=" + account))).toBe(
    true,
  );
  expect(
    matches(
      new URL(
        origin + mcpIdentityStatusPath + "?flow_id=" + account + "&flow_id=" + account,
      ),
    ),
  ).toBe(false);
  expect(matches(new URL(origin + "/auth/v1/user/identities/" + account))).toBe(false);
});
