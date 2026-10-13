import { describe, expect, it } from "vitest";
import {
  executeMemberClaim,
  type MemberClaimAuthorityPort,
  type MemberClaimTransaction,
} from "./tripMemberClaimAuthority";

const tripId = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";
const organizer = "33333333-3333-4333-8333-333333333333";
const claimant = "44444444-4444-4444-8444-444444444444";
const other = "55555555-5555-4555-8555-555555555555";
const inviteId = "66666666-6666-4666-8666-666666666666";
const operationId = "77777777-7777-4777-8777-777777777777";
const laterOperation = "88888888-8888-4888-8888-888888888888";

function fixture() {
  const facts = {
    organizer: true,
    approved: true,
    confirmed: true,
    denied: false,
    linked: null as string | null | undefined,
    otherPerson: null as string | null,
    inviteStatus: "PENDING" as "PENDING" | "REVOKED" | "EXPIRED" | "CLAIMED",
    expiresAt: "2026-10-15T00:00:00Z",
    access: "NONE" as "NONE" | "READ" | "COLLABORATE" | "ORGANIZER",
    issues: 0,
    links: 0,
    revokes: 0,
    receipts: new Map<string, Awaited<ReturnType<MemberClaimTransaction["receipt"]>>>(),
    target: { kind: "UNREGISTERED_PERSON" } as
      { kind: "UNREGISTERED_PERSON" } | { kind: "REGISTERED_ACCOUNT"; accountId: string },
  };
  const tx: MemberClaimTransaction = {
    currentTime: async () => "2026-10-14T00:00:00Z",
    currentEffectiveAccess: async () => facts.access,
    currentOrganizerAuthority: async () => facts.organizer,
    personLinkedAccount: async () => facts.linked,
    accountLinkedPerson: async () => facts.otherPerson,
    exactOrganizerApproval: async () => facts.approved,
    confirmedClaimantIdentity: async () => facts.confirmed,
    accountAccessDenied: async () => facts.denied,
    invite: async (id) =>
      id === inviteId
        ? {
            id,
            tripId,
            personId,
            target: facts.target,
            status: facts.inviteStatus,
            expiresAt: facts.expiresAt,
          }
        : null,
    receipt: async (id) => facts.receipts.get(id) ?? null,
    issue: async () => {
      facts.issues++;
      return { inviteId, expiresAt: facts.expiresAt };
    },
    link: async (_, account) => {
      facts.links++;
      facts.linked = account;
    },
    revokeUnclaimed: async () => {
      facts.revokes++;
      facts.inviteStatus = "REVOKED";
    },
    saveReceipt: async (receipt) => {
      facts.receipts.set(receipt.operationId, receipt);
    },
  };
  const port: MemberClaimAuthorityPort = {
    atomic: async (_scope, work) => work(tx),
  };
  return { facts, port };
}
const issue = (
  target:
    | { kind: "UNREGISTERED_PERSON" }
    | { kind: "REGISTERED_ACCOUNT"; accountId: string } = { kind: "UNREGISTERED_PERSON" },
) => ({
  kind: "ISSUE_TARGETED_INVITE" as const,
  operationId,
  tripId,
  personId,
  target,
});
const claim = (operation = laterOperation) => ({
  kind: "CLAIM_PERSON" as const,
  operationId: operation,
  tripId,
  personId,
  inviteId,
  explicitConsent: true,
});

describe("dormant targeted Member claim authority", () => {
  it("defaults closed and requires explicit consent", async () => {
    expect((await executeMemberClaim(issue(), organizer)).status).toBe("UNAVAILABLE");
    const { facts, port } = fixture();
    expect(
      (await executeMemberClaim({ ...claim(), explicitConsent: false }, claimant, port))
        .status,
    ).toBe("INVALID");
    expect(facts.links).toBe(0);
  });

  it("allows a name-only Person invite before Account signup, then links only after exact approval, identity confirmation and consent", async () => {
    const { facts, port } = fixture();
    expect((await executeMemberClaim(issue(), organizer, port)).status).toBe("ISSUED");
    expect(facts.issues).toBe(1);
    facts.approved = false;
    expect((await executeMemberClaim(claim(), claimant, port)).status).toBe("DENIED");
    facts.approved = true;
    facts.confirmed = false;
    expect((await executeMemberClaim(claim(), claimant, port)).status).toBe("DENIED");
    facts.confirmed = true;
    const result = await executeMemberClaim(claim(), claimant, port);
    expect(result).toMatchObject({ status: "LINKED", personId, currentAccess: "NONE" });
    expect(facts.linked).toBe(claimant);
    expect(facts.links).toBe(1);
    expect(facts.revokes).toBe(0);
  });

  it("registered targeting rejects another Account, and read permission alone cannot issue", async () => {
    const { facts, port } = fixture();
    facts.organizer = false;
    facts.access = "READ";
    expect(
      (
        await executeMemberClaim(
          issue({ kind: "REGISTERED_ACCOUNT", accountId: claimant }),
          organizer,
          port,
        )
      ).status,
    ).toBe("DENIED");
    facts.organizer = true;
    facts.target = { kind: "REGISTERED_ACCOUNT", accountId: claimant };
    expect((await executeMemberClaim(claim(), other, port)).status).toBe("DENIED");
    expect(facts.links).toBe(0);
  });

  it("registered targeting admits only its exact authenticated Account after current approval", async () => {
    const { facts, port } = fixture();
    facts.target = { kind: "REGISTERED_ACCOUNT", accountId: claimant };
    facts.confirmed = false;
    expect((await executeMemberClaim(claim(), claimant, port)).status).toBe("LINKED");
    expect(facts.linked).toBe(claimant);
    expect(facts.access).toBe("NONE");
  });

  it("expired, revoked, denied and conflicting links never mutate Person identity", async () => {
    const { facts, port } = fixture();
    facts.inviteStatus = "EXPIRED";
    expect((await executeMemberClaim(claim(), claimant, port)).status).toBe("DENIED");
    facts.inviteStatus = "REVOKED";
    expect((await executeMemberClaim(claim(), claimant, port)).status).toBe("DENIED");
    facts.inviteStatus = "PENDING";
    facts.denied = true;
    expect((await executeMemberClaim(claim(), claimant, port)).status).toBe("DENIED");
    facts.denied = false;
    facts.linked = other;
    expect((await executeMemberClaim(claim(), claimant, port)).status).toBe("DENIED");
    facts.linked = null;
    facts.otherPerson = other;
    expect((await executeMemberClaim(claim(), claimant, port)).status).toBe("CONFLICT");
    expect(facts.links).toBe(0);
  });

  it("fails closed when an owning Invite returns an unknown target kind", async () => {
    const { facts, port } = fixture();
    facts.target = { kind: "GENERIC_BEARER" } as unknown as typeof facts.target;
    expect((await executeMemberClaim(claim(), claimant, port)).status).toBe("DENIED");
    expect(facts.links).toBe(0);
  });

  it("historical receipt replay reports current denial without re-linking or regranting", async () => {
    const { facts, port } = fixture();
    expect((await executeMemberClaim(claim(), claimant, port)).status).toBe("LINKED");
    facts.denied = true;
    facts.access = "NONE";
    facts.inviteStatus = "REVOKED";
    expect(await executeMemberClaim(claim(), claimant, port)).toMatchObject({
      status: "LINKED",
      currentAccess: "NONE",
    });
    expect(facts.links).toBe(1);
    expect(
      (await executeMemberClaim({ ...claim(), inviteId: other }, claimant, port)).status,
    ).toBe("CONFLICT");
  });

  it("revokes only an unclaimed Invite, never a linked Person or existing grant", async () => {
    const { facts, port } = fixture();
    const command = {
      kind: "REVOKE_UNCLAIMED_INVITE",
      operationId,
      tripId,
      personId,
      inviteId,
    };
    facts.linked = claimant;
    expect((await executeMemberClaim(command, organizer, port)).status).toBe("DENIED");
    facts.linked = null;
    expect((await executeMemberClaim(command, organizer, port)).status).toBe(
      "INVITE_REVOKED",
    );
    expect(facts.revokes).toBe(1);
    expect(facts.links).toBe(0);
  });
});
