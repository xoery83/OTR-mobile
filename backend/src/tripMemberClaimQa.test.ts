import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createMemberClaimQaAuthority,
  parseMemberClaimQaCase,
  type MemberClaimQaCase,
} from "./tripMemberClaimQa";
import {
  executeMemberClaim,
  type MemberClaimTransaction,
  type MemberClaimAuthorityPort,
} from "./tripMemberClaimAuthority";
import { recoverMemberClaimReceipt } from "./tripMemberClaimRecovery";

function fixture() {
  const qa: MemberClaimQaCase = {
    projectRef: "tuqigdxrvrerfewsxqgm",
    tripId: randomUUID(),
    personId: randomUUID(),
    ownerAccountId: randomUUID(),
    claimantAccountId: randomUUID(),
    issueOperationId: randomUUID(),
    claimOperationId: randomUUID(),
    opensAt: "2026-11-03T00:00:00Z",
    inviteExpiresAt: "2026-11-03T00:10:00Z",
    closesAt: "2026-11-03T00:30:00Z",
  };
  let instant = Date.parse(qa.opensAt),
    linked: string | null = null;
  const inviteId = randomUUID();
  const receipts = new Map<
    string,
    Parameters<MemberClaimTransaction["saveReceipt"]>[0]
  >();
  const tx: MemberClaimTransaction = {
    currentTime: vi.fn(async () => new Date(instant).toISOString()),
    currentEffectiveAccess: vi.fn(async () => (linked ? "READ" : "NONE")),
    currentOrganizerAuthority: vi.fn(async () => true),
    personLinkedAccount: vi.fn(async () => linked),
    accountLinkedPerson: vi.fn(async () => (linked ? qa.personId : null)),
    exactOrganizerApproval: vi.fn(async () => true),
    confirmedClaimantIdentity: vi.fn(async () => true),
    accountAccessDenied: vi.fn(async () => false),
    invite: vi.fn<MemberClaimTransaction["invite"]>(async () => ({
      id: inviteId,
      tripId: qa.tripId,
      personId: qa.personId,
      target: { kind: "REGISTERED_ACCOUNT", accountId: qa.claimantAccountId },
      status: "PENDING",
      expiresAt: qa.inviteExpiresAt,
    })),
    receipt: vi.fn(async (id) => receipts.get(id) ?? null),
    issue: vi.fn(async () => ({ inviteId, expiresAt: qa.inviteExpiresAt })),
    link: vi.fn(async (_, account) => {
      linked = account;
    }),
    revokeUnclaimed: vi.fn(async () => {}),
    saveReceipt: vi.fn(async (r) => {
      receipts.set(r.operationId, r);
    }),
  };
  const underlying: MemberClaimAuthorityPort = {
    atomic: vi.fn(async (_, work) => work(tx)),
  };
  const authority = createMemberClaimQaAuthority(underlying, qa, () => instant);
  const issue = {
    kind: "ISSUE_TARGETED_INVITE" as const,
    operationId: qa.issueOperationId,
    tripId: qa.tripId,
    personId: qa.personId,
    target: { kind: "REGISTERED_ACCOUNT" as const, accountId: qa.claimantAccountId },
  };
  const claim = {
    kind: "CLAIM_PERSON" as const,
    operationId: qa.claimOperationId,
    tripId: qa.tripId,
    personId: qa.personId,
    inviteId,
    explicitConsent: true as const,
  };
  return {
    qa,
    tx,
    receipts,
    underlying,
    authority,
    issue,
    claim,
    clock(value: string) {
      instant = Date.parse(value);
    },
    unlink() {
      linked = null;
    },
  };
}

it("exports the same pure case parser without constructing a port or selecting a window", () => {
  const f = fixture();
  const parsed = parseMemberClaimQaCase(f.qa);
  expect(parsed).toEqual(f.qa);
  const originalPerson = parsed.personId;
  f.qa.personId = randomUUID();
  expect(parsed.personId).toBe(originalPerson);
  expect(() => parseMemberClaimQaCase({ ...f.qa, unknownAuthority: true })).toThrow();
  expect(() => parseMemberClaimQaCase({ ...f.qa, claimantAccountId: f.qa.ownerAccountId })).toThrow();
  expect(f.underlying.atomic).not.toHaveBeenCalled();
});

it("permits only the exact A issue/B claim and read-only original recovery, never grants from history", async () => {
  const f = fixture();
  expect(
    (await executeMemberClaim(f.issue, f.qa.ownerAccountId, f.authority.port)).status,
  ).toBe("ISSUED");
  expect(
    (await executeMemberClaim(f.claim, f.qa.claimantAccountId, f.authority.port)).status,
  ).toBe("LINKED");
  expect(
    (await executeMemberClaim(f.claim, f.qa.claimantAccountId, f.authority.port)).status,
  ).toBe("LINKED");
  expect(f.tx.link).toHaveBeenCalledOnce();
  f.unlink();
  expect(
    await recoverMemberClaimReceipt(f.claim, f.qa.claimantAccountId, f.authority.port),
  ).toMatchObject({ status: "LINKED", currentAccess: "NONE" });
  expect(f.tx.link).toHaveBeenCalledOnce();
});

it.each(["trip", "actor"])(
  "rejects foreign %s before underlying transaction",
  async (field) => {
    const f = fixture();
    await expect(
      f.authority.port.atomic(
        {
          tripId: field === "trip" ? randomUUID() : f.qa.tripId,
          actorAccountId: field === "actor" ? randomUUID() : f.qa.ownerAccountId,
        },
        async () => {},
      ),
    ).rejects.toThrow();
    expect(f.underlying.atomic).not.toHaveBeenCalled();
  },
);

it.each(["person", "target", "operation"])(
  "blocks changed %s before mutation",
  async (field) => {
    const f = fixture(),
      command = {
        ...f.issue,
        ...(field === "person" ? { personId: randomUUID() } : {}),
        ...(field === "target"
          ? { target: { ...f.issue.target, accountId: randomUUID() } }
          : {}),
        ...(field === "operation" ? { operationId: randomUUID() } : {}),
      };
    expect(
      (await executeMemberClaim(command, f.qa.ownerAccountId, f.authority.port)).status,
    ).toBe("UNAVAILABLE");
    expect(f.tx.issue).not.toHaveBeenCalled();
    expect(f.tx.saveReceipt).not.toHaveBeenCalled();
  },
);

it("retains real business denial and forbids revoke/unregistered identity methods", async () => {
  const f = fixture();
  vi.mocked(f.tx.currentOrganizerAuthority).mockResolvedValueOnce(false);
  expect(
    (await executeMemberClaim(f.issue, f.qa.ownerAccountId, f.authority.port)).status,
  ).toBe("DENIED");
  for (const method of ["revokeUnclaimed", "confirmedClaimantIdentity"] as const) {
    await expect(
      f.authority.port.atomic(
        { tripId: f.qa.tripId, actorAccountId: f.qa.claimantAccountId },
        async (tx) => {
          if (method === "revokeUnclaimed") await tx.revokeUnclaimed(f.claim.inviteId);
          else await tx.confirmedClaimantIdentity(f.qa.personId, f.qa.claimantAccountId);
        },
      ),
    ).rejects.toThrow();
    expect(f.tx[method]).not.toHaveBeenCalled();
  }
});

it.each(["2026-11-02T23:59:59Z", "2026-11-03T00:30:00Z"])(
  "rejects outside window %s",
  async (time) => {
    const f = fixture();
    f.clock(time);
    expect(
      (await executeMemberClaim(f.issue, f.qa.ownerAccountId, f.authority.port)).status,
    ).toBe("UNAVAILABLE");
    expect(f.underlying.atomic).not.toHaveBeenCalled();
  },
);

it("close poisons even a caught method failure and cannot be undone by clock rewind", async () => {
  const f = fixture();
  await expect(
    f.authority.port.atomic(
      { tripId: f.qa.tripId, actorAccountId: f.qa.ownerAccountId },
      async (tx) => {
        try {
          await tx.personLinkedAccount(randomUUID());
        } catch {
          /* simulate caught validation */
        }
        return "must not commit";
      },
    ),
  ).rejects.toThrow();
  f.authority.close();
  f.clock(f.qa.opensAt);
  expect(
    (await executeMemberClaim(f.issue, f.qa.ownerAccountId, f.authority.port)).status,
  ).toBe("UNAVAILABLE");
});

it("checks liveness after an awaited owning read and before callback completion", async () => {
  const f = fixture();
  vi.mocked(f.tx.currentEffectiveAccess).mockImplementationOnce(async () => {
    f.clock(f.qa.closesAt);
    return "NONE";
  });
  expect(
    (await executeMemberClaim(f.issue, f.qa.ownerAccountId, f.authority.port)).status,
  ).toBe("UNAVAILABLE");
  expect(f.tx.receipt).not.toHaveBeenCalled();
});

it("refuses overlong window, same Account and expiry beyond window without selecting a port", () => {
  const f = fixture();
  for (const override of [
    { closesAt: "2026-11-03T01:00:00Z" },
    { claimantAccountId: f.qa.ownerAccountId },
    { inviteExpiresAt: "2026-11-03T00:31:00Z" },
  ])
    expect(() =>
      createMemberClaimQaAuthority(f.underlying, { ...f.qa, ...override }),
    ).toThrow();
});

it("expiration latches closed despite clock rewind", async () => {
  const f = fixture();
  f.clock(f.qa.closesAt);
  expect(
    (await executeMemberClaim(f.issue, f.qa.ownerAccountId, f.authority.port)).status,
  ).toBe("UNAVAILABLE");
  f.clock(f.qa.opensAt);
  expect(
    (await executeMemberClaim(f.issue, f.qa.ownerAccountId, f.authority.port)).status,
  ).toBe("UNAVAILABLE");
  expect(f.underlying.atomic).not.toHaveBeenCalled();
});

it("rejects an invite pointing at another Person before link", async () => {
  const f = fixture();
  const original = await f.tx.invite(f.claim.inviteId);
  vi.mocked(f.tx.invite).mockResolvedValueOnce({ ...original!, personId: randomUUID() });
  expect(
    (await executeMemberClaim(f.claim, f.qa.claimantAccountId, f.authority.port)).status,
  ).toBe("UNAVAILABLE");
  expect(f.tx.link).not.toHaveBeenCalled();
});

it("retires detached reads instead of allowing callback completion with pending work", async () => {
  const f = fixture();
  let release!: () => void;
  vi.mocked(f.tx.currentTime).mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return f.qa.opensAt;
  });
  let escaped!: Promise<string>;
  await expect(
    f.authority.port.atomic(
      { tripId: f.qa.tripId, actorAccountId: f.qa.ownerAccountId },
      async (tx) => {
        escaped = tx.currentTime();
      },
    ),
  ).rejects.toThrow();
  release();
  await expect(escaped).rejects.toThrow();
});

it("post-commit expiry leaves original operation recoverable, never claims rollback", async () => {
  const f = fixture();
  vi.mocked(f.underlying.atomic).mockImplementationOnce(async (_, work) => {
    const result = await work(f.tx);
    f.clock(f.qa.closesAt);
    return result;
  });
  expect(
    (await executeMemberClaim(f.issue, f.qa.ownerAccountId, f.authority.port)).status,
  ).toBe("UNAVAILABLE");
  expect(f.receipts.get(f.qa.issueOperationId)?.outcome).toBe("ISSUED");
  expect(f.tx.issue).toHaveBeenCalledOnce();
});
