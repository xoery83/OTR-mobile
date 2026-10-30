import { createGuestAdoptionHttpPorts } from "./guestAdoptionHttp";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

// Existing primary Core connection only; this loader never creates a pool or enables SQL policy.
export function loadDevGuestAdoptionPorts(
  environment: Record<string, string | undefined>,
  connection?: CorePgConnection,
) {
  const selected = environment.OTR_DEV_AUTH_GUEST_ADOPTION;
  if (selected === undefined || selected === "0") return undefined;
  if (
    selected !== "1" ||
    environment.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
    environment.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co" ||
    !connection
  )
    throw Error("GUEST_ADOPTION_RUNTIME_UNAVAILABLE");
  return createGuestAdoptionHttpPorts(connection);
}
