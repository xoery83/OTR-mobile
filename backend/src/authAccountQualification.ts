import { coreUuid } from "@/domain/trip/tripCoreV2";

export type AuthAccountClass = "NORMAL_ACCOUNT" | "ANONYMOUS" | "UNKNOWN";
// Optional only for compatibility with existing non-normal/Guest authentication ports.
export type AuthenticatedAccount = Readonly<{
  id: string;
  accountClass?: AuthAccountClass;
}>;

// Input must be the trusted Auth getUser response, never a request or decoded JWT.
export function classifySupabaseAuthAccount(user: {
  id: unknown;
  is_anonymous?: unknown;
}) {
  const id = coreUuid.safeParse(user.id);
  if (!id.success) return null;
  const accountClass: AuthAccountClass =
    user.is_anonymous === false
      ? "NORMAL_ACCOUNT"
      : user.is_anonymous === true
        ? "ANONYMOUS"
        : "UNKNOWN";
  return Object.freeze({ id: id.data, accountClass });
}

// Classification grants no Trip/Person role, entitlement, adoption or cached Session authority.
export function isNormalAccount(user: AuthenticatedAccount) {
  return coreUuid.safeParse(user.id).success && user.accountClass === "NORMAL_ACCOUNT";
}
