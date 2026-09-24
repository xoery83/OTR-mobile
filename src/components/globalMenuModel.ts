export type GlobalMenuModule = "TODAY" | "LEDGER" | "TRIP" | "CAPTURE";

export type GlobalMenuDestination = {
  label: "My Ledger" | "Currency";
  path: "/expenses/all-journeys" | "/expenses/currency";
};

export function contextualMenuDestinations(
  module: GlobalMenuModule,
): GlobalMenuDestination[] {
  return module === "LEDGER"
    ? [
        { label: "My Ledger", path: "/expenses/all-journeys" },
        { label: "Currency", path: "/expenses/currency" },
      ]
    : [];
}

export function moduleReturnPath(module: GlobalMenuModule) {
  if (module === "LEDGER") return "/expenses";
  if (module === "TRIP") return "/trip";
  if (module === "CAPTURE") return "/capture";
  return "/";
}

export function journeyRoleLabel(role: string | null) {
  if (!role) return null;
  return role === "owner" ? "Organizer" : "Member";
}

export function maskEmail(email: string | null) {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return null;
  return `${local[0]}•••@${domain}`;
}

const APPROVED_DEV_ACCOUNT_IDS = new Set([
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
]);

export function isApprovedDevIdentity(identity: { userId: string }) {
  return APPROVED_DEV_ACCOUNT_IDS.has(identity.userId);
}
