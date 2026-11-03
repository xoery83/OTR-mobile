import { createHash } from "node:crypto";
import { z } from "zod";
import template from "../../docs/ops/auth-c04-20261103/after-fix-fresh-invite-qa/CASE_CANDIDATE.json";
import { createCoreV2Transport } from "../../src/data/api/tripCoreV2Transport";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import {
  corePersonBindingSchema,
  type CoreReadRecord,
} from "../../src/domain/trip/tripCoreV2Read";
import { itinerary_eventsSchema } from "../../src/domain/trip/tripCoreV2";
import type { RegisteredQaHostContext } from "./registered-qa-host-session";
const qa = template.qaCase;
const itemScope = itinerary_eventsSchema.pick({
  visibility: true,
  owner_account_id: true,
});
type SessionRun = (
  work: (context: RegisteredQaHostContext) => Promise<void>,
) => Promise<unknown>;
export function checkMemberRead(owner: CoreReadRecord[], claimant: CoreReadRecord[]) {
  const own = claimant
    .filter((r) => r.kind === "PERSON_BINDING")
    .map((r) => corePersonBindingSchema.parse(r.body))
    .filter((b) => b.active && b.account_id === qa.claimantAccountId);
  if (own.length !== 1 || own[0].person_id !== qa.personId)
    throw Error("C04_MEMBER_BINDING_MISMATCH");
  const privateIds = new Set(
    owner
      .filter((r) => r.kind === "ITEM")
      .filter((r) => {
        const s = itemScope.parse(r.body);
        return s.visibility === "PRIVATE" && s.owner_account_id === qa.ownerAccountId;
      })
      .map((r) => r.id),
  );
  if (claimant.some((r) => r.kind === "ITEM" && privateIds.has(r.id)))
    throw Error("C04_PRIVATE_ITEM_LEAK");
  return {
    memberRead: "PASS",
    privateItemNegative: privateIds.size
      ? "OWNER_PRIVATE_ITEMS_ABSENT_FOR_B"
      : "NO_QUALIFIED_PRIVATE_FIXTURE",
    qualifiedPrivateItemCount: privateIds.size,
  };
}
// Read-only DEV probe of already committed membership; no Claim route, selector, timer or write.
export async function runMemberReadProbe(input: {
  withOwnerSession: SessionRun;
  withClaimantSession: SessionRun;
  fetchImplementation?: typeof fetch;
  note(value: Record<string, unknown>): void;
}) {
  const signal = AbortSignal.timeout(90_000);
  const read = async (run: SessionRun, accountId: string) => {
    let records: CoreReadRecord[] | undefined;
    const cleanup = await run(async (context) => {
      if (context.accountId !== accountId || context.tripId !== qa.tripId)
        throw Error("C04_MEMBER_SESSION_SCOPE_MISMATCH");
      signal.throwIfAborted();
      const account = async () => accountId;
      const ctx = await captureAccountRequestContext(qa.tripId, account);
      const wire = input.fetchImplementation ?? fetch;
      const reader = createCoreV2Transport(
        account,
        async (bytes) => createHash("sha256").update(bytes).digest("hex"),
        {
          baseUrl: "https://api-dev.xoery.art",
          timeoutMs: 90_000,
          signal,
          fetchImplementation: async (url, init) => {
            if (
              init?.method !== "GET" ||
              String(url) !==
                `https://api-dev.xoery.art/v2/trips/${qa.tripId}/core/collection`
            )
              throw Error("C04_MEMBER_READ_ONLY_ROUTE_REQUIRED");
            const started = Date.now();
            const response = await wire(url, init);
            input.note({
              phase: "MEMBER_READ_RESPONSE",
              accountId,
              status: response.status,
              requestId: response.headers.get("x-request-id"),
              durationMs: Date.now() - started,
            });
            return response;
          },
        },
        async () => {
          const s = await context.readSession();
          if (s.identity?.userId !== accountId || !s.accessToken)
            throw Error("C04_MEMBER_TOKEN_SCOPE_MISMATCH");
          return { userId: accountId, token: s.accessToken };
        },
      );
      records = (await reader.collection(ctx)).pages.flatMap((p) => p.records);
      input.note({
        phase: "MEMBER_COLLECTION_VALIDATED",
        accountId,
        recordCount: records.length,
      });
    });
    z.object({
      status: z.literal("PASS"),
      accountId: z.literal(accountId),
      tripId: z.literal(qa.tripId),
      ownSessionCleanup: z.literal("PASS_LOCAL_SCOPE_REFRESH_REVOKED"),
    }).parse(cleanup);
    if (!records) throw Error("C04_MEMBER_READ_NOT_COMPLETED");
    return records;
  };
  const a = await read(input.withOwnerSession, qa.ownerAccountId);
  const b = await read(input.withClaimantSession, qa.claimantAccountId);
  return checkMemberRead(a, b);
}
