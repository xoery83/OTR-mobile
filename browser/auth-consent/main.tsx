import { createRoot } from "react-dom/client";
import { McpOAuthConsent } from "../../src/features/auth/McpOAuthConsent";
import {
  createMcpOAuthConsentRepository,
  mcpConsentConfigSchema,
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
async function start() {
  const boundary = createRequestBoundary(10000);
  try {
    const url = new URL(location.href);
    if (
      url.searchParams.getAll("authorization_id").length !== 1 ||
      [...url.searchParams.keys()].some((key) => key !== "authorization_id")
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
    const config = mcpConsentConfigSchema.parse(
      await readBoundedJson(response, 16384, boundary),
    );
    const repository = createMcpOAuthConsentRepository(
      config,
      url.searchParams.get("authorization_id")!,
    );
    root.render(
      <McpOAuthConsent
        repository={repository}
        navigate={(target) => location.replace(target)}
      />,
    );
  } catch {
    root.render(<McpOAuthConsent navigate={() => undefined} />);
  } finally {
    boundary.close();
  }
}
void start();
