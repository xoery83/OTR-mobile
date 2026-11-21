// Transient popup transport: only the Auth code crosses back to the original PKCE SDK.
export const mcpProviderCallbackPath = "/oauth/consent/provider-callback";
export type McpBrowserProvider = "google" | "apple";
export type McpProviderInteraction = Readonly<{
  receive(url: string, signal: AbortSignal): Promise<string>;
  close(): void;
}>;
const codePattern = /^[A-Za-z0-9_-]{1,2048}$/;
export function isMcpProviderAuthorizeUrl(
  url: URL,
  origin: string,
  providers: readonly McpBrowserProvider[],
  callbackOrigin = origin,
) {
  const keys = ["provider", "redirect_to", "code_challenge", "code_challenge_method"];
  return (
    url.origin === origin &&
    url.pathname === "/auth/v1/authorize" &&
    !url.username &&
    !url.password &&
    !url.hash &&
    url.searchParams.size === keys.length &&
    keys.every((key) => url.searchParams.getAll(key).length === 1) &&
    providers.includes(url.searchParams.get("provider") as McpBrowserProvider) &&
    url.searchParams.get("redirect_to") === callbackOrigin + mcpProviderCallbackPath &&
    url.searchParams.get("code_challenge_method") === "s256" &&
    /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("code_challenge") ?? "")
  );
}
export const mcpIdentityAuthorizePath = "/auth/v1/user/identities/authorize";
export const mcpIdentityStatusPath = "/auth/v1/user/identities/link-status";
const flowUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isMcpIdentityLinkRequest(
  url: URL,
  origin: string,
  providers: readonly McpBrowserProvider[],
  accountId: string,
) {
  if (url.pathname === mcpIdentityStatusPath)
    return (
      url.origin === origin &&
      url.searchParams.size === 1 &&
      flowUuid.test(url.searchParams.get("flow_id") ?? "")
    );
  if (url.pathname !== mcpIdentityAuthorizePath || url.searchParams.size !== 7)
    return false;
  const params = new URLSearchParams(url.search);
  for (const [key, value] of [
    ["otr_link_confirmed", "true"],
    ["otr_link_account_id", accountId],
    ["skip_http_redirect", "true"],
  ]) {
    if (params.getAll(key).length !== 1 || params.get(key) !== value) return false;
    params.delete(key);
  }
  const authorize = new URL(url);
  authorize.pathname = "/auth/v1/authorize";
  authorize.search = params.toString();
  return isMcpProviderAuthorizeUrl(authorize, origin, providers);
}

export function mcpIdentityProviderState(
  url: URL,
  origin: string,
  provider: McpBrowserProvider,
): string | undefined {
  const endpoint =
    provider === "google"
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://appleid.apple.com/auth/authorize";
  const state = url.searchParams.get("state");
  if (
    url.origin + url.pathname !== endpoint ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.getAll("state").length !== 1 ||
    !flowUuid.test(state ?? "") ||
    url.searchParams.getAll("redirect_uri").length !== 1 ||
    url.searchParams.get("redirect_uri") !== origin + "/auth/v1/callback" ||
    url.searchParams.getAll("response_type").length !== 1 ||
    url.searchParams.get("response_type") !== "code"
  )
    return undefined;
  return state!;
}

export function providerCallbackMessage(url: URL) {
  if (
    url.pathname !== mcpProviderCallbackPath ||
    url.username ||
    url.password ||
    url.hash ||
    [...url.searchParams.keys()].some(
      (key) => !["code", "error", "error_code", "error_description"].includes(key),
    ) ||
    [...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)
  )
    throw Error("INVALID_PROVIDER_CALLBACK");
  const code = url.searchParams.get("code");
  if (code && codePattern.test(code) && url.searchParams.size === 1)
    return { kind: "OTR_PROVIDER_CODE" as const, code };
  if (!code && url.searchParams.get("error"))
    return { kind: "OTR_PROVIDER_FAILED" as const };
  throw Error("INVALID_PROVIDER_CALLBACK");
}
export function completeProviderPopup(window: Window): void {
  let message: ReturnType<typeof providerCallbackMessage>;
  try {
    message = providerCallbackMessage(new URL(window.location.href));
  } catch {
    message = { kind: "OTR_PROVIDER_FAILED" };
  }
  window.history.replaceState(null, "", mcpProviderCallbackPath);
  if (!window.opener) throw Error("PROVIDER_OPENER_LOST");
  window.opener.postMessage(message, window.location.origin);
}
// Must be called synchronously from the button gesture, before SDK PKCE crypto awaits.
export function openMcpProviderPopup(window: Window): McpProviderInteraction {
  const popup = window.open(
    "about:blank",
    "otr-auth-" + crypto.randomUUID(),
    "popup,width=520,height=720",
  );
  if (!popup) throw Error("PROVIDER_POPUP_UNAVAILABLE");
  let used = false;
  return {
    close() {
      popup.close();
    },
    receive(url, signal) {
      if (used) return Promise.reject(Error("PROVIDER_POPUP_USED"));
      used = true;
      return new Promise<string>((resolve, reject) => {
        const finish = (code?: string) => {
          clearTimeout(timeout);
          clearInterval(poll);
          window.removeEventListener("message", onMessage);
          signal.removeEventListener("abort", onAbort);
          popup.close();
          if (code) resolve(code);
          else reject(Error("PROVIDER_LOGIN_UNAVAILABLE"));
        };
        const onMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin || event.source !== popup) return;
          const data = event.data;
          if (
            data &&
            typeof data === "object" &&
            data.kind === "OTR_PROVIDER_CODE" &&
            Object.keys(data).length === 2 &&
            typeof data.code === "string" &&
            codePattern.test(data.code)
          )
            finish(data.code);
          else finish();
        };
        const onAbort = () => finish();
        const timeout = setTimeout(onAbort, 120000);
        const poll = setInterval(() => {
          if (popup.closed) finish();
        }, 250);
        window.addEventListener("message", onMessage);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) finish();
        else {
          try {
            popup.location.replace(url);
          } catch {
            finish();
          }
        }
      });
    },
  };
}
