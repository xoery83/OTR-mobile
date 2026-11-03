import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  checkMemberRead,
  runMemberReadProbe,
} from "../../scripts/auth/member-claim-qa-member-read";
import template from "../../docs/ops/auth-c04-20261103/after-fix-fresh-invite-qa/CASE_CANDIDATE.json";
import {
  makeCoreReadCollection,
  coreHashValue,
  type CoreReadRecord,
} from "../../src/domain/trip/tripCoreV2Read";
import type { RegisteredQaHostContext } from "../../scripts/auth/registered-qa-host-session";
const qa = template.qaCase;
const binding: CoreReadRecord = {
  kind: "PERSON_BINDING",
  id: qa.personId,
  revision: 1,
  body: {
    person_id: qa.personId,
    account_id: qa.claimantAccountId,
    active: true,
    participating: true,
  },
};
const privateItem: CoreReadRecord = {
  kind: "ITEM",
  id: "private-fixture",
  revision: 1,
  body: { visibility: "PRIVATE", owner_account_id: qa.ownerAccountId },
};
afterEach(() => vi.useRealTimers());
it("does not invent a private-item negative from an empty owner collection", () => {
  expect(checkMemberRead([], [binding])).toMatchObject({
    memberRead: "PASS",
    privateItemNegative: "NO_QUALIFIED_PRIVATE_FIXTURE",
  });
});
it("checks only qualified owner-private fixtures and rejects their leakage", () => {
  expect(checkMemberRead([privateItem], [binding])).toMatchObject({
    privateItemNegative: "OWNER_PRIVATE_ITEMS_ABSENT_FOR_B",
    qualifiedPrivateItemCount: 1,
  });
  expect(() => checkMemberRead([privateItem], [binding, privateItem])).toThrow(
    "PRIVATE_ITEM_LEAK",
  );
});
it("rejects wrong, duplicate and inactive member bindings", () => {
  for (const body of [
    { ...(binding.body as object), person_id: qa.tripId },
    { ...(binding.body as object), account_id: qa.ownerAccountId },
    { ...(binding.body as object), active: false },
  ])
    expect(() => checkMemberRead([], [{ ...binding, body }])).toThrow("BINDING_MISMATCH");
  expect(() => checkMemberRead([], [binding, binding])).toThrow("BINDING_MISMATCH");
});
it("rejects a foreign session before any network call", async () => {
  const wire = vi.fn();
  await expect(
    runMemberReadProbe({
      withOwnerSession: async (work) =>
        work({
          accountId: qa.claimantAccountId,
          tripId: qa.tripId,
          readSession: vi.fn(),
        }),
      withClaimantSession: vi.fn(),
      fetchImplementation: wire,
      note: vi.fn(),
    }),
  ).rejects.toThrow("SESSION_SCOPE_MISMATCH");
  expect(wire).not.toHaveBeenCalled();
});
it("accepts sequential20-second validated GETs within one bounded90-second read budget and verifies both cleanup scopes", async () => {
  vi.useFakeTimers();
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const make = async (accountId: string) => {
    const bindings = accountId === qa.claimantAccountId ? [binding.body] : [];
    return makeCoreReadCollection(
      accountId === qa.claimantAccountId ? [binding] : [],
      {
        actorAccountId: accountId,
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
          bindings.map((b) => (b as { person_id: string }).person_id),
          hash,
        ),
        generatedAt: new Date().toISOString(),
      },
      hash,
    );
  };
  const responses = new Map(
    await Promise.all(
      [qa.ownerAccountId, qa.claimantAccountId].map(
        async (id) => [id, await make(id)] as const,
      ),
    ),
  );
  const wire = vi.fn<typeof fetch>(async (url, init) => {
    expect(init?.method).toBe("GET");
    expect(String(url)).toBe(
      `https://api-dev.xoery.art/v2/trips/${qa.tripId}/core/collection`,
    );
    const actor = String((init?.headers as Record<string, string>).Authorization).replace(
      "Bearer unit-",
      "",
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 20_000));
    return Response.json(responses.get(actor), {
      headers: { "x-request-id": "synthetic-response-id" },
    });
  });
  const cleaned: string[] = [];
  const session =
    (accountId: string) =>
    async (work: (c: RegisteredQaHostContext) => Promise<void>) => {
      try {
        await work({
          accountId,
          tripId: qa.tripId,
          readSession: async () => ({
            identity: { userId: accountId, email: "unit@example.test", displayName: "" },
            accessToken: "unit-" + accountId,
            refreshToken: null,
            expiresAt: null,
          }),
        });
      } finally {
        cleaned.push(accountId);
      }
      return {
        status: "PASS",
        accountId,
        tripId: qa.tripId,
        ownSessionCleanup: "PASS_LOCAL_SCOPE_REFRESH_REVOKED",
      };
    };
  const notes: Record<string, unknown>[] = [];
  const result = runMemberReadProbe({
    withOwnerSession: session(qa.ownerAccountId),
    withClaimantSession: session(qa.claimantAccountId),
    fetchImplementation: wire,
    note: (v) => notes.push(v),
  });
  for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(20_001);
  expect(await result).toMatchObject({
    memberRead: "PASS",
    privateItemNegative: "NO_QUALIFIED_PRIVATE_FIXTURE",
  });
  expect(wire).toHaveBeenCalledTimes(2);
  expect(cleaned).toEqual([qa.ownerAccountId, qa.claimantAccountId]);
  expect(JSON.stringify(notes)).not.toContain("Bearer");
});
