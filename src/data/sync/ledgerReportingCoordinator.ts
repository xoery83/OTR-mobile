import { requireActiveUserId } from "@/data/auth/authRepository";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import type { MyLedgerPeriod } from "@/data/api/ledgerReadContracts";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { ApiClientError } from "@/data/api/client";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { refreshLedgerPersonalPayments } from "./ledgerPersonalPaymentCoordinator";
import { refreshPersonalSettlementReview } from "./personalSettlementReviewCoordinator";

type JourneyPullResult = {
  changed: boolean;
  incomplete: boolean;
  pullApiRequestCount: number;
  reviewOutcome: "review_success" | "review_blocked_stable" | "review_error";
};
const activePulls = new Map<string, Promise<JourneyPullResult>>();
const cycleTails = new Map<string, Promise<void>>();
function scopedCycle<T>(
  journeyId: string,
  task: (context: AccountRequestContext) => Promise<T>,
) {
  const context = captureAccountRequestContext(journeyId, requireActiveUserId);
  void context.catch(() => undefined);
  const key = `${getAccountGeneration()}:${journeyId}`;
  const previous = cycleTails.get(key) ?? Promise.resolve();
  const run = previous.then(async () => {
    const captured = await context;
    await assertAccountRequestContext(captured, requireActiveUserId);
    return task(captured);
  });
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  cycleTails.set(key, tail);
  void tail.then(() => {
    if (cycleTails.get(key) === tail) cycleTails.delete(key);
  });
  return run;
}

export async function ensureJourneyLedgerActor(journeyId: string) {
  const generation = getAccountGeneration();
  const repository = await getDefaultLedgerReportingRepository();
  const cached = await repository.getActorMemberId(journeyId);
  if (cached?.memberId) return cached;
  await revalidateJourneyLedger(journeyId);
  if (generation !== getAccountGeneration())
    throw new Error("Account changed during Journey bootstrap.");
  return repository.getActorMemberId(journeyId);
}

export function refreshJourneyLedger(journeyId: string) {
  return refreshJourneyLedgerWithStatus(journeyId).then((result) => result.changed);
}

export function refreshJourneyLedgerWithStatus(journeyId: string) {
  const key = `${getAccountGeneration()}:${journeyId}`;
  const active = activePulls.get(key);
  if (active) return active;
  const pull = scopedCycle(journeyId, (context) =>
    pullJourneyLedger(journeyId, context),
  ).finally(() => {
    if (activePulls.get(key) === pull) activePulls.delete(key);
  });
  activePulls.set(key, pull);
  return pull;
}

async function pullJourneyLedger(journeyId: string, context: AccountRequestContext) {
  let personalChanged = false;
  let personalError: unknown;
  let reviewError = false;
  let reviewOutcome: JourneyPullResult["reviewOutcome"] = "review_success";
  let pullApiRequestCount = 0;
  const countRequest = () => {
    pullApiRequestCount += 1;
  };
  try {
    personalChanged = await refreshLedgerPersonalPayments(journeyId, countRequest);
  } catch (error) {
    personalError = error;
  }
  try {
    countRequest();
    await refreshPersonalSettlementReview(journeyId);
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      error.status === 409 &&
      error.code === "SETTLEMENT_REVIEW_BLOCKED"
    ) {
      reviewOutcome = "review_blocked_stable";
    } else {
      reviewOutcome = "review_error";
      reviewError = true;
    }
  }
  const finish = (changed: boolean): JourneyPullResult => ({
    changed,
    incomplete: Boolean(personalError) || reviewError,
    pullApiRequestCount,
    reviewOutcome,
  });
  await assertAccountRequestContext(context, requireActiveUserId);
  const repository = await getDefaultLedgerReadRepository();
  const cursor = (await repository.getCursor(journeyId))?.cursor ?? null;
  if (!cursor) {
    try {
      countRequest();
      const response = await createLedgerReadTransport().bootstrap(journeyId, context);
      await assertAccountRequestContext(context, requireActiveUserId);
      await repository.applyBootstrap(response, context);
      return finish(true);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 403 &&
        error.code === "TRIP_READ_FORBIDDEN"
      ) {
        if (personalError) throw personalError;
        return finish(personalChanged);
      }
      throw error;
    }
  }
  const transport = createLedgerReadTransport();
  let nextCursor: string | null = cursor;
  let changed = false;
  try {
    do {
      countRequest();
      const response = await transport.pull(journeyId, nextCursor, context);
      await assertAccountRequestContext(context, requireActiveUserId);
      await repository.applyChanges(journeyId, response, context, nextCursor);
      changed ||= response.changes.length > 0;
      nextCursor = response.cursor;
      if (!response.hasMore) break;
    } while (true);
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      error.status === 403 &&
      error.code === "TRIP_READ_FORBIDDEN"
    ) {
      if (personalError) throw personalError;
      return finish(personalChanged);
    }
    if (!(error instanceof ApiClientError) || error.code !== "INVALID_CURSOR")
      throw error;
    countRequest();
    const response = await transport.bootstrap(journeyId, context);
    await assertAccountRequestContext(context, requireActiveUserId);
    await repository.applyBootstrap(response, context);
    return finish(true);
  }
  return finish(changed || personalChanged);
}

export function revalidateJourneyLedger(journeyId: string) {
  return scopedCycle(journeyId, async (context) => {
    const response = await createLedgerReadTransport().bootstrap(journeyId, context);
    await assertAccountRequestContext(context, requireActiveUserId);
    await (await getDefaultLedgerReadRepository()).applyBootstrap(response, context);
    return response;
  });
}

export async function refreshMyLedger(
  period: MyLedgerPeriod,
  bounds: { from: string | null; to: string | null },
) {
  const response = await createLedgerReadTransport().myLedger(period, bounds);
  const repository = await getDefaultLedgerReadRepository();
  await repository.cacheMyLedger(response);
}
