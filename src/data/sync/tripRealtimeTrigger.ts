import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { subscribeAccountGeneration } from "../auth/accountGeneration";

type Dependencies = {
  account(): Promise<string>;
  available(): Promise<boolean>;
  invalidate(context: AccountRequestContext): Promise<void>;
  // Owning adapter must authorize the private channel and validate its hints.
  subscribe?(
    context: AccountRequestContext,
    invalidated: () => void,
    disconnected: () => void,
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
      }
    | undefined;
  let disposed = false;
  function stop() {
    const previous = active;
    active = undefined;
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
      stop();
      if (disposed || !context || !deps.subscribe) return;
      const state = {
        context: Object.freeze({ ...context }),
        dirty: false,
        running: false,
        ready: false,
      };
      active = state;
      if (!(await current(state))) return;
      try {
        const close = await deps.subscribe(
          state.context,
          () => {
            if (active !== state) return;
            state.dirty = true;
            if (state.ready) void drain(state);
          },
          () => {
            if (active === state) stop();
          },
        );
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
