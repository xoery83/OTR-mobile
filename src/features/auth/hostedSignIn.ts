import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { LocalSession } from "@/domain/auth/localSession";

export const hostedSignInEnabled: boolean = true;

type SignInResult = { generation: number; apply(): void };
type SignInOwner = {
  authenticate(session: LocalSession, generation: number, signal: AbortSignal): Promise<SignInResult>;
  onBusyChange(busy: boolean): void;
};

const listeners = new Set<() => void>();

export function subscribeSignIn(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifySignInChange() {
  listeners.forEach(listener => listener());
}

let nextId = 0;
let active: {
  id: string;
  generation: number;
  owner: SignInOwner;
  controller: AbortController;
  installing: boolean;
  result?: SignInResult;
} | undefined;

export function stageSignIn(owner: SignInOwner) {
  releaseSignIn(active?.id);
  const id = String(++nextId);
  active = { id, generation: getAccountGeneration(), owner, controller: new AbortController(), installing: false };
  notifySignInChange();
  return id;
}

export function readSignIn(id: string | undefined) {
  if (!active || active.id !== id || active.generation !== getAccountGeneration()) return;
  return active;
}

export async function completeSignIn(id: string | undefined, session: LocalSession, generation: number) {
  const entry = readSignIn(id);
  if (!entry || entry.generation !== generation || entry.installing || entry.result)
    throw new Error("AUTH_CONTEXT_CHANGED");
  entry.installing = true;
  notifySignInChange();
  try {
    const result = await entry.owner.authenticate(session, generation, entry.controller.signal);
    if (active !== entry || entry.controller.signal.aborted || result.generation !== getAccountGeneration())
      throw new Error("AUTH_CONTEXT_CHANGED");
    entry.result = result;
  } finally {
    entry.installing = false;
    notifySignInChange();
  }
}

export function interceptSignInClose(id: string | undefined) {
  return !!active && active.id === id && active.installing;
}

export function hasSignInResult(id: string | undefined) {
  return Boolean(active && active.id === id && active.result);
}

export function finishSignIn(id: string | undefined) {
  if (!active || active.id !== id) return;
  const result = active.result;
  releaseSignIn(id);
  if (result?.generation === getAccountGeneration()) result.apply();
}

export function releaseSignIn(id: string | undefined) {
  if (!active || active.id !== id) return;
  const retired = active;
  active = undefined;
  retired.controller.abort();
  notifySignInChange();
}
