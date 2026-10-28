import { describe, expect, it, vi } from "vitest";
import { createGuestPrincipalRepository } from "./guestPrincipalRepository";
import { createAuthRepository, type SecureSessionStorage } from "./authSessionRepository";

function memory() {
  const entries = new Map<string, string>();
  const storage: SecureSessionStorage = {
    getItem: async (key) => entries.get(key) ?? null,
    setItem: async (key, value) => {
      entries.set(key, value);
    },
    deleteItem: async (key) => {
      entries.delete(key);
    },
  };
  return { entries, storage };
}
const session = {
  accessToken: "expired",
  refreshToken: "refresh",
  expiresAt: "2020-01-01",
  identity: { userId: "real-account", displayName: "Person", email: null },
};

describe("Auth-only Guest launch identity", () => {
  it("creates one separate local identity and preserves it through cold construction", async () => {
    const { storage, entries } = memory();
    const createId = vi.fn(() => "local-guest");
    const repository = createGuestPrincipalRepository(storage, createId);
    const identities = await Promise.all([
      repository.readLaunchIdentity(null),
      repository.readLaunchIdentity(null),
    ]);
    expect(identities).toEqual([
      { kind: "GUEST", localId: "local-guest" },
      { kind: "GUEST", localId: "local-guest" },
    ]);
    expect(createId).toHaveBeenCalledOnce();
    expect(
      await createGuestPrincipalRepository(storage, () => "wrong").readLaunchIdentity(
        null,
      ),
    ).toEqual(identities[0]);
    expect([...entries.keys()]).toEqual(["otr.mobile.launch.v1"]);
    expect(await createAuthRepository(storage).readLocalSession()).toBeNull();
  });
  it("blocks account installation before Guest preflight without changing Guest data", async () => {
    const { storage, entries } = memory();
    const guest = createGuestPrincipalRepository(storage, () => "guest");
    await guest.readLaunchIdentity(null);
    const before = [...entries];
    await expect(
      createAuthRepository(storage).writeLocalSession(session),
    ).rejects.toThrow("GUEST_ADOPTION_PREFLIGHT_REQUIRED");
    expect([...entries]).toEqual(before);
  });
  it("keeps previous sign-out distinct from first use", async () => {
    const { storage } = memory();
    const auth = createAuthRepository(storage);
    await auth.writeLocalSession(session);
    await auth.clearLocalSession();
    expect(
      await createGuestPrincipalRepository(
        storage,
        () => "must-not-create",
      ).readLaunchIdentity(null),
    ).toEqual({ kind: "SIGNED_OUT" });
  });
  it("preserves authenticated offline access even with an unreadable new marker", async () => {
    const { storage, entries } = memory();
    entries.set("otr.mobile.launch.v1", "broken");
    expect(
      await createGuestPrincipalRepository(storage, () => "guest").readLaunchIdentity(
        session,
      ),
    ).toEqual({ kind: "ACCOUNT", accountId: "real-account" });
    await expect(
      createGuestPrincipalRepository(storage, () => "guest").readLaunchIdentity(null),
    ).rejects.toThrow();
  });
  it.each(["otr.mobile.accounts.v2", "otr.mobile.session.v1"])(
    "never guesses first-ever from pre-existing %s",
    async (key) => {
      const { storage, entries } = memory();
      entries.set(key, "unreadable old state");
      expect(
        await createGuestPrincipalRepository(storage, () => "guest").readLaunchIdentity(
          null,
        ),
      ).toEqual({ kind: "SIGNED_OUT" });
      expect(entries.get(key)).toBe("unreadable old state");
    },
  );
  it("does not return an unpersisted Guest after storage failure", async () => {
    const { storage } = memory();
    const repo = createGuestPrincipalRepository(
      {
        ...storage,
        setItem: async () => {
          throw new Error("locked storage");
        },
      },
      () => "guest",
    );
    await expect(repo.readLaunchIdentity(null)).rejects.toThrow("locked storage");
  });
});
