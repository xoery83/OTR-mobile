import { createMemberClaimQaRecoveryOnly } from "./tripMemberClaimQaRecoveryOnly";
import { loadDevTripCreateRuntime } from "./tripCreateRuntime";
import {
  createMemberClaimQaAuthority,
  createNativeMemberClaimQaAuthority,
  parseMemberClaimQaCase,
  parseNativeMemberClaimQaCase,
  type MemberClaimQaCase,
  type NativeMemberClaimQaCase,
} from "./tripMemberClaimQa";
import type { PublishedUniversalP1Reader } from "./universalP1SourcePg";

// Non-secret Root selection only; normal Auth and the owning PG port still authorize.
export async function loadDevTripCreateWithMemberClaimQaRuntime(
  environment: Record<string, string | undefined>,
  readUniversalP1?: PublishedUniversalP1Reader,
  options?: Pick<NonNullable<Parameters<typeof loadDevTripCreateRuntime>[2]>, "selfTripNickname" | "retainedPng" | "memberAccess" | "directedInviteRead" | "claimResolution" | "claimGeneralOrigin">,
) {
  let selected: MemberClaimQaCase | undefined;
  let nativeSelected: NativeMemberClaimQaCase | undefined;
  const raw = environment.OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG;
  const mode = environment.OTR_DEV_AUTH_MEMBER_CLAIM_QA_MODE;
  const nativeRaw = environment.OTR_DEV_AUTH_MEMBER_CLAIM_NATIVE_CONFIG;
  const nativeMode = environment.OTR_DEV_AUTH_MEMBER_CLAIM_NATIVE_MODE;
  if (nativeRaw !== undefined || nativeMode !== undefined) {
    try {
      if (raw !== undefined || mode !== undefined || nativeRaw === undefined ||
        nativeMode !== "ORIGINAL_ID_FINITE" || Buffer.byteLength(nativeRaw) > 4096 ||
        environment.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
        environment.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co")
        throw Error();
      const candidate = parseNativeMemberClaimQaCase(JSON.parse(nativeRaw));
      const now = Date.now();
      if (!Number.isFinite(now) || now < Date.parse(candidate.opensAt) ||
        now >= Date.parse(candidate.closesAt) || now >= Date.parse(candidate.inviteExpiresAt))
        throw Error();
      nativeSelected = candidate;
    } catch {
      console.info("MEMBER_CLAIM_NATIVE_SELECTION_CLOSED");
    }
  } else if (raw !== undefined) {
    try {
      if (
        (mode !== undefined && mode !== "RECOVERY_ONLY") ||
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
  const admission = nativeSelected ?? selected;
  const runtime = await loadDevTripCreateRuntime(
    environment,
    readUniversalP1,
    admission || options
      ? {
          ...options,
          ...(admission ? { memberClaim: { inviteExpiresAt: admission.inviteExpiresAt } } : {}),
        }
      : undefined,
  );
  if (!runtime) return runtime;
  // Never expose an unqualified raw Claim port, including a failed wrapper path.
  const { memberClaimPort: rawPort, ...ordinary } = {
    ...runtime,
    memberClaimPort: "memberClaimPort" in runtime ? runtime.memberClaimPort : undefined,
  };
  let qa: ReturnType<typeof createMemberClaimQaAuthority> | undefined;
  if ((selected || nativeSelected) && rawPort) {
    try {
      qa = nativeSelected
        ? createNativeMemberClaimQaAuthority(rawPort, nativeSelected)
        : createMemberClaimQaAuthority(rawPort, selected!);
    } catch {
      console.info("MEMBER_CLAIM_QA_SELECTION_CLOSED");
    }
  }
  return {
    ...ordinary,
    ...(qa ? { memberClaimPort: selected && mode === "RECOVERY_ONLY" ? createMemberClaimQaRecoveryOnly(qa.port, selected) : qa.port } : {}),
    async close() {
      qa?.close();
      await runtime.close();
    },
  };
}
