import { getAccountGeneration, advanceAccountGeneration } from "./accountGeneration";

export type AccountRequestContext = Readonly<{
  accountId: string;
  tripId: string;
  generation: number;
}>;
export type AccountTransitionLease = Readonly<{ token: symbol; generation: number }>;
type RecoveryContext = {
  accountId: string | null;
  generation: number;
  getAccountId(): Promise<string | null>;
};
let gate: Promise<void> = Promise.resolve();
let activeTransition: { lease: AccountTransitionLease; release(): void } | null = null;
let pendingTransitions = 0;

async function acquireAccountGate() {
  const previous = gate;
  let release!: () => void;
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  return release;
}
export async function withAccountApplyGate<T>(task: () => Promise<T>): Promise<T> {
  const release = await acquireAccountGate();
  try {
    return await task();
  } finally {
    release();
  }
}
export function beginAccountTransition(): Promise<AccountTransitionLease>;
export function beginAccountTransition(
  expected: RecoveryContext,
): Promise<AccountTransitionLease | null>;
export async function beginAccountTransition(
  expected?: RecoveryContext,
): Promise<AccountTransitionLease | null> {
  pendingTransitions += 1;
  const release = await acquireAccountGate();
  try {
    if (expected) {
      const accountId = await expected.getAccountId();
      if (
        expected.generation !== getAccountGeneration() ||
        accountId !== expected.accountId
      ) {
        release();
        return null; // Superseded recovery: no generation or session mutation.
      }
    }
    const lease = Object.freeze({
      token: Symbol("Account transition"),
      generation: advanceAccountGeneration(),
    });
    activeTransition = { lease, release };
    return lease;
  } catch (error) {
    release();
    throw error;
  } finally {
    pendingTransitions -= 1;
  }
}
export function endAccountTransition(lease: AccountTransitionLease) {
  if (activeTransition?.lease !== lease)
    throw new Error("Account transition lease is not active.");
  const { release } = activeTransition;
  activeTransition = null;
  release();
}
export function assertAccountRequestGeneration(context: AccountRequestContext) {
  if (
    activeTransition !== null ||
    pendingTransitions > 0 ||
    context.generation !== getAccountGeneration()
  )
    throw new Error("Account changed during Ledger request.");
}
export async function assertAccountRequestContext(
  context: AccountRequestContext,
  getUserId: () => Promise<string>,
) {
  const userId = await getUserId();
  if (
    activeTransition !== null ||
    pendingTransitions > 0 ||
    context.generation !== getAccountGeneration() ||
    context.accountId !== userId
  )
    throw new Error("Account changed during Ledger request.");
}
export async function captureAccountRequestContext(
  tripId: string,
  getUserId: () => Promise<string>,
): Promise<AccountRequestContext> {
  const generation = getAccountGeneration();
  const accountId = await getUserId();
  if (!accountId) throw new Error("No active Account for Ledger request.");
  const context = Object.freeze({ accountId, tripId, generation });
  await assertAccountRequestContext(context, getUserId);
  return context;
}
