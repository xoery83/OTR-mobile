import { describe, expect, it } from "vitest";
import { createAuthRepository, type SecureSessionStorage } from "./authSessionRepository";
import { advanceAccountGeneration } from "./accountGeneration";

const guest = "10000000-0000-4000-8000-000000000001";
const account = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const binding = {
  sourceGuestLocalId: guest,
  adoptionId: "30000000-0000-4000-8000-000000000001",
  targetAccountId: account,
};
const slot = `otr.mobile.session.v2.${account}`;
const metadata = `otr.mobile.guest-verification.v1.${guest}`;
// Synthetic JWT-shaped values test local subject pinning only, never Provider authentication.
const session = (sub = account, refreshToken = "synthetic-refresh") => ({
  accessToken: `e30.${btoa(JSON.stringify({ sub }))}.fixture`,
  refreshToken,
  expiresAt: "2026-10-30T00:00:00Z",
  identity: { userId: sub, displayName: "QA", email: null },
});
async function fixture() {
  const entries = new Map<string, string>();
  let fault: ((key: string, value: string) => void) | undefined;
  const storage: SecureSessionStorage = {
    getItem: async (key) => entries.get(key) ?? null,
    setItem: async (key, value) => {
      fault?.(key, value);
      entries.set(key, value);
    },
    deleteItem: async (key) => {
      entries.delete(key);
    },
  };
  entries.set(
    "otr.mobile.launch.v1",
    JSON.stringify({ version: 1, kind: "GUEST", localId: guest }),
  );
  return {
    entries,
    storage,
    repo: createAuthRepository(storage),
    fail(fn?: typeof fault) {
      fault = fn;
    },
  };
}

describe("Guest verification in the existing secure Account slot", () => {
  it("survives repository restart while launch remains Guest and no active Session is installed", async () => {
    const f = await fixture();
    await f.repo.guestVerification.store(binding, session());
    const restarted = createAuthRepository(f.storage);
    expect(await restarted.guestVerification.read(binding)).toEqual({
      status: "SESSION",
      session: session(),
    });
    expect(await restarted.readCommittedLocalPrincipal()).toEqual({
      kind: "GUEST",
      localId: guest,
    });
    expect(await restarted.readAdoptedLocalSession()).toBeNull();
    expect(await restarted.listAccounts()).toEqual([]);
    expect([...f.entries.keys()].sort()).toEqual(
      [metadata, "otr.mobile.launch.v1", slot].sort(),
    );
    expect(f.entries.get(metadata)).not.toContain("synthetic-refresh");
  });
  it("does not weaken normal Guest login/Account switch guards", async () => {
    const f = await fixture();
    await f.repo.guestVerification.store(binding, session());
    await expect(f.repo.writeLocalSession(session())).rejects.toThrow(
      "GUEST_ADOPTION_PREFLIGHT_REQUIRED",
    );
    await expect(f.repo.selectAccount(account)).rejects.toThrow(
      "GUEST_ADOPTION_PREFLIGHT_REQUIRED",
    );
  });
  it("rejects a different JWT subject before any secure write", async () => {
    const f = await fixture();
    await expect(
      f.repo.guestVerification.store(binding, {
        ...session(),
        accessToken: session(other).accessToken,
      }),
    ).rejects.toThrow("GUEST_VERIFICATION_IDENTITY_MISMATCH");
    expect(f.entries.size).toBe(1);
  });
  it("does not overwrite unbound credentials even for the same Account", async () => {
    const f = await fixture();
    f.entries.set(slot, JSON.stringify(session()));
    await expect(f.repo.guestVerification.store(binding, session())).rejects.toThrow(
      "GUEST_VERIFICATION_SLOT_OCCUPIED",
    );
    expect(f.entries.has(metadata)).toBe(false);
  });
  it("does not read or replace a different adoption binding", async () => {
    const f = await fixture();
    await f.repo.guestVerification.store(binding, session());
    const changed = { ...binding, adoptionId: "30000000-0000-4000-8000-000000000002" };
    await expect(f.repo.guestVerification.read(changed)).rejects.toThrow(
      "GUEST_VERIFICATION_BINDING_MISMATCH",
    );
    await expect(f.repo.guestVerification.store(changed, session())).rejects.toThrow(
      "GUEST_VERIFICATION_BINDING_MISMATCH",
    );
  });
  it("refreshes with previous-token CAS and rejects a stale retry", async () => {
    const f = await fixture();
    await f.repo.guestVerification.store(binding, session());
    await f.repo.guestVerification.store(
      binding,
      session(account, "next"),
      "synthetic-refresh",
    );
    await expect(
      f.repo.guestVerification.store(
        binding,
        session(account, "stale"),
        "synthetic-refresh",
      ),
    ).rejects.toThrow("GUEST_VERIFICATION_REFRESH_CAS");
    expect(await f.repo.guestVerification.read(binding)).toEqual({
      status: "SESSION",
      session: session(account, "next"),
    });
  });
  it("can retry the exact stored result after an interrupted READY checkpoint", async () => {
    const f = await fixture();
    f.fail((key, value) => {
      if (key === metadata && value.includes('"READY"')) throw Error("POWER_LOSS");
    });
    await expect(f.repo.guestVerification.store(binding, session())).rejects.toThrow(
      "GUEST_VERIFICATION_STORAGE_UNAVAILABLE",
    );
    f.fail();
    const restarted = createAuthRepository(f.storage);
    expect(await restarted.guestVerification.read(binding)).toEqual({
      status: "SESSION",
      session: session(),
    });
    await restarted.guestVerification.store(binding, session());
    expect(JSON.parse(f.entries.get(metadata)!).phase).toBe("READY");
  });
  it("retains recoverable metadata when credential storage fails", async () => {
    const f = await fixture();
    f.fail((key) => {
      if (key === slot) throw Error("KEYCHAIN_UNAVAILABLE");
    });
    await expect(f.repo.guestVerification.store(binding, session())).rejects.toThrow(
      "GUEST_VERIFICATION_STORAGE_UNAVAILABLE",
    );
    expect(await createAuthRepository(f.storage).guestVerification.read(binding)).toEqual(
      { status: "PENDING_WRITE" },
    );
    f.fail();
    await f.repo.guestVerification.store(binding, session());
  });
  it("does not accept a different same-Account credential in a failed pending slot", async () => {
    const f = await fixture();
    f.fail((key) => {
      if (key === slot) throw Error("UNKNOWN_WRITE");
    });
    await expect(f.repo.guestVerification.store(binding, session())).rejects.toThrow(
      "GUEST_VERIFICATION_STORAGE_UNAVAILABLE",
    );
    f.fail();
    f.entries.set(slot, JSON.stringify(session(account, "unrelated-session")));
    await expect(f.repo.guestVerification.read(binding)).rejects.toThrow(
      "GUEST_VERIFICATION_CREDENTIAL_MISMATCH",
    );
    await expect(
      f.repo.guestVerification.store(binding, session(account, "unrelated-session")),
    ).rejects.toThrow("GUEST_VERIFICATION_CREDENTIAL_MISMATCH");
  });
  it("recovers only the pinned old or new credential after an interrupted refresh", async () => {
    const f = await fixture();
    await f.repo.guestVerification.store(binding, session());
    f.fail((key) => {
      if (key === slot) throw Error("REFRESH_WRITE_FAILED");
    });
    await expect(
      f.repo.guestVerification.store(
        binding,
        session(account, "next"),
        "synthetic-refresh",
      ),
    ).rejects.toThrow("GUEST_VERIFICATION_STORAGE_UNAVAILABLE");
    f.fail();
    expect(await createAuthRepository(f.storage).guestVerification.read(binding)).toEqual(
      { status: "SESSION", session: session() },
    );
    await f.repo.guestVerification.store(
      binding,
      session(account, "next"),
      "synthetic-refresh",
    );
    expect(await f.repo.guestVerification.read(binding)).toEqual({
      status: "SESSION",
      session: session(account, "next"),
    });
  });
  it.each(["", "{}", "not-json"])("fails closed on corrupt metadata %j", async (raw) => {
    const f = await fixture();
    f.entries.set(metadata, raw);
    await expect(f.repo.guestVerification.read(binding)).rejects.toThrow(
      "GUEST_VERIFICATION_METADATA_INVALID",
    );
  });
  it("fails closed for missing READY credentials", async () => {
    const f = await fixture();
    await f.repo.guestVerification.store(binding, session());
    f.entries.delete(slot);
    await expect(f.repo.guestVerification.read(binding)).rejects.toThrow(
      "GUEST_VERIFICATION_SESSION_MISSING",
    );
  });
  it("rejects Account/Guest changes during a write and does not install the Account", async () => {
    const f = await fixture();
    f.fail((key) => {
      if (key === metadata) advanceAccountGeneration();
    });
    await expect(f.repo.guestVerification.store(binding, session())).rejects.toThrow(
      "GUEST_VERIFICATION_STALE",
    );
    expect(f.entries.has(slot)).toBe(false);
    expect(await f.repo.readAdoptedLocalSession()).toBeNull();
  });
  it.each(["ACCOUNT_INDEX", "LEGACY_SESSION", "OTHER_GUEST"])(
    "rejects a conflicting principal %s before credential access",
    async (conflict) => {
      const f = await fixture();
      if (conflict === "ACCOUNT_INDEX")
        f.entries.set(
          "otr.mobile.accounts.v2",
          JSON.stringify({
            activeUserId: other,
            accounts: [{ ...session(other).identity }],
          }),
        );
      if (conflict === "LEGACY_SESSION")
        f.entries.set("otr.mobile.session.v1", JSON.stringify(session(other)));
      if (conflict === "OTHER_GUEST")
        f.entries.set(
          "otr.mobile.launch.v1",
          JSON.stringify({ version: 1, kind: "GUEST", localId: other }),
        );
      await expect(f.repo.guestVerification.store(binding, session())).rejects.toThrow(
        "GUEST_LOCAL_SCOPE_REQUIRED",
      );
      expect(f.entries.has(slot)).toBe(false);
      expect(f.entries.has(metadata)).toBe(false);
    },
  );
  it.each(["get", "set"])(
    "does not surface credential text from a %s storage exception",
    async (kind) => {
      const f = await fixture();
      const sentinel = "DO_NOT_SURFACE_CREDENTIAL";
      if (kind === "get")
        f.storage.getItem = async () => {
          throw Error(sentinel);
        };
      else
        f.fail(() => {
          throw Error(sentinel);
        });
      await expect(f.repo.guestVerification.store(binding, session())).rejects.toThrow(
        "GUEST_VERIFICATION_STORAGE_UNAVAILABLE",
      );
    },
  );
  it("snapshots binding and credentials before awaiting storage", async () => {
    const f = await fixture(),
      input = { ...binding },
      credentials = session();
    const pending = f.repo.guestVerification.store(input, credentials);
    input.targetAccountId = other;
    credentials.identity.userId = other;
    credentials.refreshToken = "changed";
    await pending;
    expect(await f.repo.guestVerification.read(binding)).toEqual({
      status: "SESSION",
      session: session(),
    });
  });
});
