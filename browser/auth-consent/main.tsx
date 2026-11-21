import {
  mcpProviderCallbackPath,
  completeProviderPopup,
  openMcpProviderPopup,
} from "../../src/data/auth/mcpBrowserProvider";
import { operationApprovalIdFromUrl } from "../../src/data/auth/mcpOperationApprovalLocation";
import { McpOperationApproval } from "../../src/features/auth/McpOperationApproval";
import { createMcpOperationApprovalRepository } from "../../src/data/auth/mcpOperationApprovalRepository";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { McpOAuthConsent } from "../../src/features/auth/McpOAuthConsent";
import {
  createMcpOAuthConsentRepository,
  mcpConsentConfigSchema,
  mcpBetaConsentConfigSchema,
} from "../../src/data/auth/mcpOAuthConsentRepository";
import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import { resolveUiLocale, setUiLocale, t } from "../../src/ui/locale";

setUiLocale(resolveUiLocale(navigator.language));
document.documentElement.lang = resolveUiLocale(navigator.language);
document.title = t("oauthConsent.title");
const root = createRoot(document.getElementById("root")!);
let locationChanged = false;
window.addEventListener("hashchange", () => {
  if (location.pathname !== "/oauth/consent" || locationChanged) return;
  locationChanged = true;
  root.unmount();
  location.reload();
});
async function start() {
  const boundary = createRequestBoundary(10000);
  try {
    const url = new URL(location.href);
    if (url.pathname === mcpProviderCallbackPath) {
      completeProviderPopup(window);
      return;
    }
    const operation = url.pathname === "/mcp/approve";
    const approvalId = operation ? operationApprovalIdFromUrl(url) : undefined;
    const idKey = "authorization_id";
    const managedId =
      !operation && url.pathname === "/oauth/consent" && !url.search
        ? /^#managed=([a-f0-9-]{36})$/.exec(url.hash)?.[1]
        : undefined;
    if (
      !operation &&
      !managedId &&
      (url.searchParams.getAll(idKey).length !== 1 ||
        [...url.searchParams.keys()].some((key) => key !== idKey))
    )
      throw Error();
    const response = await boundary.run(() =>
      fetch("/oauth/consent/config", {
        signal: boundary.signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      }),
    );
    if (!response.ok) throw Error();
    const raw = await readBoundedJson(response, 16384, boundary);
    if (locationChanged) return;
    const config =
      raw && typeof raw === "object" && "authOrigin" in raw
        ? mcpBetaConsentConfigSchema.parse(raw)
        : mcpConsentConfigSchema.parse(raw);
    if (operation) {
      root.render(
        <McpOperationApproval
          repository={createMcpOperationApprovalRepository(
            mcpBetaConsentConfigSchema.parse(raw),
            approvalId!,
          )}
        />,
      );
      return;
    }
    const repository = createMcpOAuthConsentRepository(
      config,
      managedId ? z.uuid().parse(managedId) : url.searchParams.get(idKey)!,
      undefined,
      fetch,
      !!managedId,
    );
    root.render(
      <McpOAuthConsent
        repository={repository}
        showUnavailableProviders={Boolean(
          "managedDev" in config && config.managedNativeOAuth && !config.browserProviders && !managedId,
        )}
        openProvider={() => openMcpProviderPopup(window)}
        navigate={(target) => location.replace(target)}
      />,
    );
  } catch {
    if (locationChanged) return;
    root.render(
      location.pathname === "/mcp/approve" ? (
        <McpOperationApproval />
      ) : (
        <McpOAuthConsent navigate={() => undefined} />
      ),
    );
  } finally {
    boundary.close();
  }
}
void start();
