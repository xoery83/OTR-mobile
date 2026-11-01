import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { subscribeAccountGeneration } from "../auth/accountGeneration";

type Dependencies = {
  account(): Promise<string>;
  available(): Promise<boolean>;
  invalidate(context: AccountRequestContext): Promise<void>;
  // Owning adapter must authorize/expire/revoke, honor abort and validate hints.
  subscribe?(
    context: AccountRequestContext,
    invalidated: () => void,
    disconnected: () => void,
    signal: AbortSignal,
  ): Promise<() => void>;
};

// No default transport: absence of the owning authorization port stays closed.
export function createTripRealtimeTrigger(deps: Dependencies) {
  let active:
    | {
        context: AccountRequestContext;
        close?: () => void;
        dirty: boolean;
        running: boolean;
        ready: boolean;
        controller: AbortController;
        opening?: ReturnType<typeof setTimeout>;
        signalTimer?: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let disposed = false;
  function stop() {
    const previous = active;
    active = undefined;
    if (previous?.opening !== undefined) clearTimeout(previous.opening);
    if (previous?.signalTimer !== undefined) clearTimeout(previous.signalTimer);
    try {
      previous?.controller.abort();
    } catch {
      // Transport abort listeners must not interrupt Account transitions either.
    }
    try {
      previous?.close?.();
    } catch {
      // A broken transport cleanup must not interrupt Account transition listeners.
    }
  }
  const unlisten = subscribeAccountGeneration(stop);
  async function current(state: NonNullable<typeof active>) {
    try {
      await assertAccountRequestContext(state.context, deps.account);
      if (active !== state) return false;
      const available = await deps.available();
      if (active !== state) return false;
      if (!available) stop();
      return available;
    } catch {
      if (active === state) stop();
      return false;
    }
  }
  async function drain(state: NonNullable<typeof active>) {
    if (state.running) return;
    state.running = true;
    try {
      while (state.dirty && (await current(state))) {
        state.dirty = false;
        await deps.invalidate(state.context);
      }
    } catch {
      // Existing Downstream owns retry/backoff and retains the lawful cache.
    } finally {
      state.running = false;
    }
  }
  return {
    async activate(context: AccountRequestContext | null) {
      if (
        active &&
        context &&
        active.context.accountId === context.accountId &&
        active.context.tripId === context.tripId &&
        active.context.generation === context.generation
      ) {
        await current(active);
        return;
      }
      stop();
      if (disposed || !context || !deps.subscribe) return;
      const state: NonNullable<typeof active> = {
        context: Object.freeze({ ...context }),
        dirty: false,
        running: false,
        ready: false,
        controller: new AbortController(),
      };
      active = state;
      if (!(await current(state))) return;
      state.opening = setTimeout(() => {
        if (active === state) stop();
      }, 15_000);
      try {
        const close = await deps.subscribe(
          state.context,
          () => {
            if (active !== state) return;
            state.dirty = true;
            if (state.ready && !state.running && state.signalTimer === undefined) {
              state.signalTimer = setTimeout(() => {
                delete state.signalTimer;
                if (active === state) void drain(state);
              }, 200);
            }
          },
          () => {
            if (active === state) stop();
          },
          state.controller.signal,
        );
        clearTimeout(state.opening);
        delete state.opening;
        if (!(await current(state))) {
          close();
          return;
        }
        Object.assign(state, { close });
        state.ready = true;
        state.dirty = true; // Pull after subscribe to close the setup race.
        await drain(state);
      } catch {
        if (active === state) stop();
      }
    },
    stop,
    dispose() {
      disposed = true;
      stop();
      unlisten();
    },
  };
}
