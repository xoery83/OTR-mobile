import { expect, it, vi } from "vitest";
import { advanceAccountGeneration, getAccountGeneration } from "@/data/auth/accountGeneration";
import type { LocalSession } from "@/domain/auth/localSession";
import { completeSignIn, finishSignIn, interceptSignInClose, readSignIn, releaseSignIn, stageSignIn } from "./hostedSignIn";

const session = {} as LocalSession;

it("guards close and double submission while the original account owner installs the session", async () => {
  const apply = vi.fn();
  let finish!: () => void;
  const authenticate = vi.fn(() => new Promise<{ generation: number; apply: typeof apply }>(resolve => {
    finish = () => resolve({ generation: getAccountGeneration(), apply });
  }));
  const id = stageSignIn({ authenticate, onBusyChange: vi.fn() });
  const generation = getAccountGeneration();
  const entry = readSignIn(id)!;
  const installing = completeSignIn(id, session, generation);
  expect(interceptSignInClose(id)).toBe(true);
  await expect(completeSignIn(id, session, generation)).rejects.toThrow("AUTH_CONTEXT_CHANGED");
  advanceAccountGeneration();
  finish();
  await installing;
  expect(entry.result).toBeDefined();
  expect(apply).not.toHaveBeenCalled();
  expect(interceptSignInClose(id)).toBe(false);
  expect(authenticate).toHaveBeenCalledExactlyOnceWith(session, generation, entry.controller.signal);
  finishSignIn(id);
  finishSignIn(id);
  expect(apply).toHaveBeenCalledOnce();
});

it("retires an old presentation without exposing or aborting the replacement scope", async () => {
  const authenticate = vi.fn();
  const old = stageSignIn({ authenticate, onBusyChange: vi.fn() });
  const retired = readSignIn(old)!;
  const next = stageSignIn({ authenticate, onBusyChange: vi.fn() });
  releaseSignIn(old);
  expect(retired.controller.signal.aborted).toBe(true);
  expect(readSignIn(next)?.controller.signal.aborted).toBe(false);
  await expect(completeSignIn(old, session, getAccountGeneration())).rejects.toThrow("AUTH_CONTEXT_CHANGED");
  expect(authenticate).not.toHaveBeenCalled();
  releaseSignIn(next);
});


it("discards a completed sign-in when another account generation wins before dismiss", async () => {
  const apply = vi.fn();
  const id = stageSignIn({
    authenticate: async () => ({ generation: advanceAccountGeneration(), apply }),
    onBusyChange: vi.fn(),
  });
  await completeSignIn(id, session, getAccountGeneration());
  advanceAccountGeneration();
  finishSignIn(id);
  expect(apply).not.toHaveBeenCalled();
});
