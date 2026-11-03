import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { runMemberClaimQaScenario } from "../../scripts/auth/member-claim-qa-scenario";
import {
  makeCoreReadCollection,
  coreHashValue,
} from "../../src/domain/trip/tripCoreV2Read";
import { memberClaimIntentDigest } from "./tripMemberClaimAuthority";
import type { MemberClaimCommand } from "../../src/data/api/memberClaimContracts";
import type { RegisteredQaHostContext } from "../../scripts/auth/registered-qa-host-session";

function fixture() {
  const qa = {
    projectRef: "tuqigdxrvrerfewsxqgm" as const,
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
  const inviteId = randomUUID(),
    notes: Record<string, unknown>[] = [];
  let instant = Date.parse(qa.opensAt),
    wrongAccount = false,
    wrongReceipt = false,
    badCleanup = false;
  let unknown: "none" | "committed" | "absent" = "none";
  const sessions =
    (accountId: string) =>
    async (work: (c: RegisteredQaHostContext) => Promise<void>) => {
      await work({
        accountId,
        tripId: qa.tripId,
        readSession: async () => ({
          accessToken: "unit-only-" + accountId,
          refreshToken: null,
          expiresAt: qa.closesAt,
          identity: {
            userId: wrongAccount ? qa.ownerAccountId : accountId,
            email: "qa@example.test",
            displayName: "",
          },
        }),
      });
      return {
        status: "PASS",
        accountId,
        tripId: qa.tripId,
        ownSessionCleanup: badCleanup ? "UNRESOLVED" : "PASS_LOCAL_SCOPE_REFRESH_REVOKED",
      };
    };
  const wire = vi.fn<typeof fetch>(async (url, init) => {
    const actor = String((init?.headers as Record<string, string>).Authorization).replace(
      "Bearer unit-only-",
      "",
    );
    if (String(url).endsWith("/collection")) {
      const hash = async (bytes: Uint8Array) =>
        createHash("sha256").update(bytes).digest("hex");
      const bindings =
        actor === qa.claimantAccountId
          ? [
              {
                person_id: qa.personId,
                account_id: actor,
                active: true,
                participating: true,
              },
            ]
          : [];
      return Response.json(
        await makeCoreReadCollection(
          actor === qa.claimantAccountId
            ? [
                {
                  kind: "PERSON_BINDING",
                  id: qa.personId,
                  revision: 1,
                  body: {
                    person_id: qa.personId,
                    account_id: actor,
                    active: true,
                    participating: true,
                  },
                },
              ]
            : [],
          {
            actorAccountId: actor,
            tripId: qa.tripId,
            epoch: qa.tripId,
            revision: 1,
            accessRevision: 1,
            actorPersonBindingHash: await coreHashValue(
              "otr-trip-core-person-bindings-v2",
              bindings,
              hash,
            ),
            participatingRosterHash: await coreHashValue(
              "otr-trip-core-participating-roster-v2",
              bindings.map((b) => b.person_id),
              hash,
            ),
            generatedAt: qa.opensAt,
          },
          hash,
        ),
      );
    }
    const c = JSON.parse(String(init?.body)) as MemberClaimCommand;
    if (unknown !== "none" && c.kind === "CLAIM_PERSON") {
      if (!String(url).endsWith("/recovery")) throw Error("unit simulated response loss");
      if (unknown === "absent") return Response.json({ status: "ABSENT_UNCONFIRMED" });
    }
    return Response.json({
      status: c.kind === "ISSUE_TARGETED_INVITE" ? "ISSUED" : "LINKED",
      personId: qa.personId,
      inviteId,
      currentAccess: c.kind === "CLAIM_PERSON" ? "READ" : "ORGANIZER",
    });
  });
  const deps = {
    withOwnerSession: sessions(qa.ownerAccountId),
    withClaimantSession: sessions(qa.claimantAccountId),
    preflight: vi.fn(async () => {}),
    now: () => instant,
    fetchImplementation: wire,
    readReceipt: vi.fn(async (c: MemberClaimCommand, actorAccountId: string) => ({
      tripId: qa.tripId,
      actorAccountId,
      personId: qa.personId,
      operationId: c.operationId,
      intentDigest: wrongReceipt ? "0".repeat(64) : memberClaimIntentDigest(c),
      inviteId,
      outcome: c.kind === "ISSUE_TARGETED_INVITE" ? "ISSUED" : "LINKED",
    })),
    retain: (v: Record<string, unknown>) => notes.push(v),
  };
  return {
    qa,
    deps,
    wire,
    notes,
    setWrongAccount() {
      wrongAccount = true;
    },
    setWrongReceipt() {
      wrongReceipt = true;
    },
    setBadCleanup() {
      badCleanup = true;
    },
    setUnknown(value: typeof unknown) {
      unknown = value;
    },
    expire() {
      instant = Date.parse(qa.closesAt);
    },
  };
}

it("orchestrates distinct accounts through real repositories and hashed Core transport without inventing a private negative", async () => {
  const f = fixture();
  expect(await runMemberClaimQaScenario(f.qa, f.deps)).toMatchObject({
    status: "INVITE_CLAIM_MEMBER_READ_CHECKED",
    privateItemNegative: "NO_QUALIFIED_PRIVATE_FIXTURE",
    memberRevoke: "NOT_RUN",
    nativeColdRestore: "NOT_RUN",
  });
  expect(f.deps.preflight).toHaveBeenCalledOnce();
  expect(f.deps.readReceipt).toHaveBeenCalledTimes(2);
  expect(f.notes.filter((n) => n.phase === "ORIGINAL_COMMAND_RETAINED")).toHaveLength(2);
  expect(JSON.stringify(f.notes)).not.toContain("unit-only-");
});

it("rejects a claimant using the owner's session before any mutation", async () => {
  const f = fixture();
  f.setWrongAccount();
  await expect(runMemberClaimQaScenario(f.qa, f.deps)).rejects.toThrow("CASE_UNPROVEN");
  expect(f.wire).not.toHaveBeenCalled();
});

it("uses only original read-only recovery after UNKNOWN and never replays an absent operation", async () => {
  const f = fixture();
  f.setUnknown("absent");
  await expect(runMemberClaimQaScenario(f.qa, f.deps)).rejects.toThrow(
    "ORIGINAL_OPERATION_UNCONFIRMED",
  );
  const claims = f.wire.mock.calls.filter(
    ([, init]) => JSON.parse(String(init?.body)).kind === "CLAIM_PERSON",
  );
  expect(claims).toHaveLength(2);
  expect(String(claims[1][0])).toMatch(/\/recovery$/);
  expect(claims[0][1]?.body).toBe(claims[1][1]?.body);
});

it("stops on independent receipt mismatch before Claim", async () => {
  const f = fixture();
  f.setWrongReceipt();
  await expect(runMemberClaimQaScenario(f.qa, f.deps)).rejects.toThrow("CASE_UNPROVEN");
  expect(f.wire).toHaveBeenCalledTimes(1);
});

it("does not return success without verified cleanup", async () => {
  const f = fixture();
  f.setBadCleanup();
  await expect(runMemberClaimQaScenario(f.qa, f.deps)).rejects.toThrow();
});

it("rejects a stale window before any Session or network work", async () => {
  const f = fixture();
  f.expire();
  await expect(runMemberClaimQaScenario(f.qa, f.deps)).rejects.toThrow(
    "WINDOW_NOT_CURRENT",
  );
  expect(f.wire).not.toHaveBeenCalled();
});

it("isolates receipt-reader mutation from the fixed original command and duplicate", async () => {
  const f = fixture(),
    read = f.deps.readReceipt.getMockImplementation()!;
  f.deps.readReceipt.mockImplementation(async (command, actor) => {
    command.operationId = randomUUID();
    return read(command, actor);
  });
  await expect(runMemberClaimQaScenario(f.qa, f.deps)).rejects.toThrow("CASE_UNPROVEN");
  expect(f.wire).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(f.wire.mock.calls[0][1]?.body)).operationId).toBe(
    f.qa.issueOperationId,
  );
});

it("stops pre-cancelled scenarios before creating either Session", async () => {
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  const owner = vi.fn(f.deps.withOwnerSession),
    claimant = vi.fn(f.deps.withClaimantSession);
  await expect(
    runMemberClaimQaScenario(f.qa, {
      ...f.deps,
      withOwnerSession: owner,
      withClaimantSession: claimant,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(owner).not.toHaveBeenCalled();
  expect(claimant).not.toHaveBeenCalled();
  expect(f.deps.preflight).not.toHaveBeenCalled();
  expect(f.wire).not.toHaveBeenCalled();
});
