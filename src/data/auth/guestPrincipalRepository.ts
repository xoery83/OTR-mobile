import type { SecureSessionStorage } from "./authSessionRepository";
import type { LocalSession } from "@/domain/auth/localSession";

const launchKey = "otr.mobile.launch.v1";
export type GuestPrincipal = Readonly<{ kind: "GUEST"; localId: string }>;
export type LaunchIdentity =
  GuestPrincipal | { kind: "ACCOUNT"; accountId: string } | { kind: "SIGNED_OUT" };
type LaunchRecord =
  { version: 1; kind: "GUEST"; localId: string } | { version: 1; kind: "SIGNED_OUT" };

export function createGuestPrincipalRepository(
  storage: SecureSessionStorage,
  createId: () => string,
) {
  let pending: Promise<GuestPrincipal | { kind: "SIGNED_OUT" }> | null = null;
  async function readRecord(): Promise<LaunchRecord | null> {
    const raw = await storage.getItem(launchKey);
    if (!raw) return null;
    let record: Partial<LaunchRecord> | null;
    try {
      record = JSON.parse(raw) as Partial<LaunchRecord> | null;
    } catch {
      throw new Error("LOCAL_PRINCIPAL_RECOVERY_REQUIRED");
    }
    if (
      !record ||
      record.version !== 1 ||
      (record.kind !== "SIGNED_OUT" &&
        !(
          record.kind === "GUEST" &&
          typeof record.localId === "string" &&
          record.localId.length > 0
        ))
    )
      throw new Error("LOCAL_PRINCIPAL_RECOVERY_REQUIRED");
    return record as LaunchRecord;
  }
  return {
    async readLaunchIdentity(session: LocalSession | null): Promise<LaunchIdentity> {
      // Existing offline Account access never depends on the new Guest marker.
      if (session?.identity?.userId)
        return { kind: "ACCOUNT", accountId: session.identity.userId };
      if (session) throw new Error("LOCAL_PRINCIPAL_RECOVERY_REQUIRED");
      if (!pending)
        pending = (async () => {
          const record = await readRecord();
          if (record?.kind === "GUEST")
            return { kind: "GUEST" as const, localId: record.localId };
          if (record?.kind === "SIGNED_OUT") return { kind: "SIGNED_OUT" as const };
          // Prior installations without a marker must not become a fresh Guest.
          const [index, legacy] = await Promise.all([
            storage.getItem("otr.mobile.accounts.v2"),
            storage.getItem("otr.mobile.session.v1"),
          ]);
          if (index || legacy) {
            await storage.setItem(
              launchKey,
              JSON.stringify({ version: 1, kind: "SIGNED_OUT" }),
            );
            return { kind: "SIGNED_OUT" as const };
          }
          const localId = createId();
          if (!localId) throw new Error("LOCAL_PRINCIPAL_RECOVERY_REQUIRED");
          await storage.setItem(
            launchKey,
            JSON.stringify({ version: 1, kind: "GUEST", localId }),
          );
          return { kind: "GUEST" as const, localId };
        })().finally(() => {
          pending = null;
        });
      return pending;
    },
    async assertNoGuestAdoption() {
      if ((await readRecord())?.kind === "GUEST")
        throw new Error("GUEST_ADOPTION_PREFLIGHT_REQUIRED");
    },
    async markPreviouslySignedIn() {
      await storage.setItem(
        launchKey,
        JSON.stringify({ version: 1, kind: "SIGNED_OUT" }),
      );
    },
  };
}
