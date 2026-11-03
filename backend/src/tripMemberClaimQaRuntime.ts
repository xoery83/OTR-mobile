import { loadDevTripCreateRuntime } from "./tripCreateRuntime";
import {
  createMemberClaimQaAuthority,
  parseMemberClaimQaCase,
  type MemberClaimQaCase,
} from "./tripMemberClaimQa";
import type { PublishedUniversalP1Reader } from "./universalP1SourcePg";

// Non-secret Root selection only; normal Auth and the owning PG port still authorize.
export async function loadDevTripCreateWithMemberClaimQaRuntime(
  environment: Record<string, string | undefined>,
  readUniversalP1?: PublishedUniversalP1Reader,
) {
  let selected: MemberClaimQaCase | undefined;
  const raw = environment.OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG;
  if (raw !== undefined) {
    try {
      if (
        Buffer.byteLength(raw) > 4096 ||
        environment.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
        environment.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
      )
        throw Error();
      const qa = parseMemberClaimQaCase(JSON.parse(raw));
      const now = Date.now();
      if (
        !Number.isFinite(now) ||
        now < Date.parse(qa.opensAt) ||
        now >= Date.parse(qa.closesAt) ||
        now >= Date.parse(qa.inviteExpiresAt) ||
        Date.parse(qa.inviteExpiresAt) - Date.parse(qa.opensAt) > 600000
      )
        throw Error();
      selected = qa;
    } catch {
      console.info("MEMBER_CLAIM_QA_SELECTION_CLOSED");
    }
  }
  const runtime = await loadDevTripCreateRuntime(
    environment,
    readUniversalP1,
    selected ? { memberClaim: { inviteExpiresAt: selected.inviteExpiresAt } } : undefined,
  );
  if (!runtime) return runtime;
  // Never expose an unqualified raw Claim port, including a failed wrapper path.
  const { memberClaimPort: rawPort, ...ordinary } = {
    ...runtime,
    memberClaimPort: "memberClaimPort" in runtime ? runtime.memberClaimPort : undefined,
  };
  let qa: ReturnType<typeof createMemberClaimQaAuthority> | undefined;
  if (selected && rawPort) {
    try {
      qa = createMemberClaimQaAuthority(rawPort, selected);
    } catch {
      console.info("MEMBER_CLAIM_QA_SELECTION_CLOSED");
    }
  }
  return {
    ...ordinary,
    ...(qa ? { memberClaimPort: qa.port } : {}),
    async close() {
      qa?.close();
      await runtime.close();
    },
  };
}
