import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { LocalSession } from "@/domain/auth/localSession";

export const hostedSignInEnabled = process.env.EXPO_PUBLIC_OTR_SHEET_SIGN_IN_QA === "true";

type SignInOwner = {
  authenticate(session: LocalSession, generation: number, signal: AbortSignal): Promise<void>;
  onBusyChange(busy: boolean): void;
};

let nextId = 0;
let active: {
  id: string;
  generation: number;
  owner: SignInOwner;
  controller: AbortController;
  installing: boolean;
  completed: boolean;
} | undefined;

export function stageSignIn(owner: SignInOwner) {
  releaseSignIn(active?.id);
  const id = String(++nextId);
  active = { id, generation: getAccountGeneration(), owner, controller: new AbortController(), installing: false, completed: false };
  return id;
}

export function readSignIn(id: string | undefined) {
  if (!active || active.id !== id || active.generation !== getAccountGeneration()) return;
  return active;
}

export async function completeSignIn(id: string | undefined, session: LocalSession, generation: number) {
  const entry = readSignIn(id);
  if (!entry || entry.generation !== generation || entry.installing || entry.completed)
    throw new Error("AUTH_CONTEXT_CHANGED");
  entry.installing = true;
  try {
    await entry.owner.authenticate(session, generation, entry.controller.signal);
    entry.completed = true;
  } finally {
    entry.installing = false;
  }
}

export function interceptSignInClose(id: string | undefined) {
  return !!active && active.id === id && active.installing;
}

export function releaseSignIn(id: string | undefined) {
  if (!active || active.id !== id) return;
  const retired = active;
  active = undefined;
  retired.controller.abort();
}
