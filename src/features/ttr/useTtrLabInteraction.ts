import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createTtrInteractionController,
  type TtrInteractionSource,
} from "./interactionController";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import type { TtrMode, TtrIdentity } from "@/domain/trip/ttr";
import type { TtrPresentationProjection, TtrState } from "@/domain/trip/ttrState";

type Controller = ReturnType<typeof createTtrInteractionController>;
type ControllerDependencies = Parameters<typeof createTtrInteractionController>[0];
export type TtrLabInteractionInput = {
  context: AccountRequestContext & {
    travellerKey: string;
    localDate: string;
    visitKey: string;
  };
  authorization: { key: string; version: number; actionable: boolean };
  resolve(identity: TtrIdentity): TtrInteractionSource | null;
  repository: ControllerDependencies["repository"];
  clock(): string;
  publish(projection: TtrPresentationProjection, presentationKey: string): boolean;
  dismissHost(): void;
};
export type TtrLabInteractionView = Readonly<{
  phase:
    | "CLOSED"
    | "OPENING"
    | "READY"
    | "SAVING"
    | "RECOVERING"
    | "UNAVAILABLE"
    | "ERROR"
    | "UNCERTAIN"
    | "PUBLISHED"
    | "SAVED_UNPUBLISHED";
  state: TtrState | null;
  candidate: TtrPresentationProjection | null;
}>;
const empty: TtrLabInteractionView = { phase: "CLOSED", state: null, candidate: null };
const scopeKey = (input: TtrLabInteractionInput) =>
  JSON.stringify([
    input.context.accountId,
    input.context.tripId,
    input.context.generation,
    input.context.travellerKey,
    input.context.localDate,
    input.context.visitKey,
    input.authorization.key,
    input.authorization.version,
    input.authorization.actionable,
  ]);
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

type Descriptor = { key: string; repository: TtrLabInteractionInput["repository"] };
function createBinding(
  descriptor: Descriptor,
  getInput: () => TtrLabInteractionInput,
  onView: (view: TtrLabInteractionView) => void,
) {
  const b = {
    mounted: true,
    sequence: 0,
    active: false,
    candidate: null as TtrPresentationProjection | null,
    publicationResult: null as "PUBLISHED" | "SAVED_UNPUBLISHED" | null,
    pending: null as { sequence: number; promise: Promise<void> } | null,
    controller: null as Controller | null,
  };
  const current = () =>
    b.mounted &&
    scopeKey(getInput()) === descriptor.key &&
    getInput().repository === descriptor.repository;
  const permitted = () =>
    current() &&
    typeof __DEV__ !== "undefined" &&
    __DEV__ === true &&
    getInput().authorization.actionable === true &&
    Number.isSafeInteger(getInput().authorization.version) &&
    getInput().authorization.version >= 0 &&
    !!getInput().authorization.key &&
    !!getInput().context.visitKey;
  b.controller = createTtrInteractionController({
    repository: descriptor.repository,
    context: () => {
      const ctx = b.mounted ? getInput().context : getInput().context;
      return {
        accountId: ctx.accountId,
        tripId: ctx.tripId,
        generation: ctx.generation,
      };
    },
    resolve: (identity) => {
      if (!permitted()) return null;
      const src = getInput().resolve(identity);
      if (
        !src ||
        src.presentation.key !== getInput().authorization.key ||
        src.relation.input.scope.travellerKey !== getInput().context.travellerKey
      )
        return null;
      return {
        ...src,
        presentation: {
          key: getInput().authorization.key,
          authorized: src.presentation.authorized && permitted(),
        },
      };
    },
    clock: () => getInput().clock(),
    publish: (projection, presentationKey) => {
      if (!permitted() || presentationKey !== getInput().authorization.key)
        throw new Error("TTR_LAB_STALE_PUBLICATION");
      b.active = false;
      const candidate = freeze(structuredClone(projection));
      b.candidate = candidate;
      b.publicationResult = "SAVED_UNPUBLISHED";
      if (getInput().publish(candidate, presentationKey) !== true)
        throw new Error("TTR_LAB_PUBLICATION_REJECTED");
      b.publicationResult = "PUBLISHED";
    },
  });
  const update = (
    phase: TtrLabInteractionView["phase"],
    state = b.controller!.snapshot()?.state ?? null,
  ) => {
    if (current()) onView({ phase, state, candidate: b.candidate });
  };
  const close = () => {
    ++b.sequence;
    b.active = false;
    b.controller!.dismiss();
    update("CLOSED");
    if (current()) getInput().dismissHost();
  };

  const binding = Object.assign(b, { current, permitted, update, close });
  return {
    descriptor,
    refresh() {
      if (binding.active && !binding.controller!.snapshot()) {
        binding.active = false;
        ++binding.sequence;
        binding.update("UNAVAILABLE");
      }
    },
    dispose() {
      binding.mounted = false;
      ++binding.sequence;
      binding.active = false;
      binding.controller!.dispose();
    },
    actions: {
      async onOpenTtr(...args: Parameters<Controller["onOpenTtr"]>): Promise<void> {
        if (!binding.current()) return;
        const sequence = ++binding.sequence;
        binding.active = false;
        binding.update("OPENING");
        try {
          if (!binding.permitted()) throw new Error("TTR_LAB_UNAVAILABLE");
          await binding.controller!.onOpenTtr(...args);
          if (binding.current() && sequence === binding.sequence) {
            binding.active = true;
            binding.update("READY");
          }
        } catch {
          if (sequence === binding.sequence) binding.update("UNAVAILABLE");
        }
      },
      preview(mode: TtrMode) {
        if (
          !binding.permitted() ||
          !binding.active ||
          binding.pending?.sequence === binding.sequence
        )
          return;
        try {
          binding.controller!.preview(mode);
          binding.update("READY");
        } catch {
          binding.update(
            binding.controller!.snapshot()?.uncertain ? "UNCERTAIN" : "ERROR",
          );
        }
      },
      confirm(): Promise<void> {
        if (!binding.permitted() || !binding.active) return Promise.resolve();
        if (binding.pending?.sequence === binding.sequence)
          return binding.pending.promise;
        const sequence = binding.sequence;
        const state = binding.controller!.snapshot()?.state ?? null;
        const promise = (async () => {
          try {
            binding.update("SAVING");
            const result = await binding.controller!.confirm();
            if (!binding.current() || sequence !== binding.sequence) return;
            if (result.status === "UNCERTAIN") {
              binding.update("UNCERTAIN");
              return;
            }
            binding.active = false;
            binding.update(
              result.status,
              result.selection && state
                ? { ...state, confirmed: result.selection }
                : state,
            );
            if (result.status === "PUBLISHED") getInput().dismissHost();
          } catch {
            if (sequence === binding.sequence)
              binding.update(
                binding.controller!.snapshot()?.uncertain ? "UNCERTAIN" : "ERROR",
              );
          }
        })();
        binding.pending = { sequence, promise };
        void promise
          .finally(() => {
            if (binding.pending?.promise === promise) binding.pending = null;
          })
          .catch(() => {});
        return promise;
      },
      recover(): Promise<void> {
        if (!binding.permitted() || !binding.active) return Promise.resolve();
        if (binding.pending?.sequence === binding.sequence)
          return binding.pending.promise;
        const sequence = binding.sequence;
        const state = binding.controller!.snapshot()?.state ?? null;
        binding.publicationResult = null;
        binding.update("RECOVERING");
        const promise = (async () => {
          try {
            const selection = await binding.controller!.recover();
            if (!binding.current() || sequence !== binding.sequence) return;
            if (binding.controller!.snapshot()) binding.update("READY");
            else {
              binding.active = false;
              binding.update(
                binding.publicationResult ?? "SAVED_UNPUBLISHED",
                selection && state ? { ...state, confirmed: selection } : state,
              );
              if (binding.publicationResult === "PUBLISHED") getInput().dismissHost();
            }
          } catch {
            if (sequence === binding.sequence)
              binding.update(
                binding.controller!.snapshot()?.uncertain ? "UNCERTAIN" : "ERROR",
              );
          }
        })();
        binding.pending = { sequence, promise };
        void promise
          .finally(() => {
            if (binding.pending?.promise === promise) binding.pending = null;
          })
          .catch(() => {});
        return promise;
      },
      dismiss: binding.close,
      invalidate() {
        if (binding.current()) {
          ++binding.sequence;
          binding.active = false;
          binding.controller!.invalidate();
          binding.update("UNAVAILABLE");
        }
      },
    },
  };
}

/** DEV preparation only. G2 owns and supplies current composed actionability. */
export function useTtrLabInteraction(input: TtrLabInteractionInput) {
  const latest = useRef(input);
  const runtime = useRef<ReturnType<typeof createBinding> | null>(null);
  const key = scopeKey(input);
  const descriptor = useMemo(
    () => ({ key, repository: input.repository }),
    [key, input.repository],
  );
  const [display, setDisplay] = useState<{
    descriptor: Descriptor | null;
    view: TtrLabInteractionView;
  }>({ descriptor: null, view: empty });
  useLayoutEffect(() => {
    latest.current = input;
  });
  useLayoutEffect(() => {
    const binding = createBinding(
      descriptor,
      () => latest.current,
      (view) => setDisplay({ descriptor, view }),
    );
    runtime.current = binding;
    return () => {
      binding.dispose();
      if (runtime.current === binding) runtime.current = null;
    };
  }, [descriptor]);
  useLayoutEffect(() => {
    runtime.current?.refresh();
  });
  const active = () =>
    runtime.current?.descriptor === descriptor ? runtime.current.actions : null;
  const view = display.descriptor === descriptor ? display.view : empty;
  return {
    view:
      typeof __DEV__ !== "undefined" &&
      __DEV__ === true &&
      input.authorization.actionable === true
        ? view
        : { ...empty, phase: "UNAVAILABLE" as const },
    onOpenTtr: (...args: Parameters<Controller["onOpenTtr"]>) =>
      active()?.onOpenTtr(...args) ?? Promise.resolve(),
    preview: (mode: TtrMode) => active()?.preview(mode),
    confirm: () => active()?.confirm() ?? Promise.resolve(),
    recover: () => active()?.recover() ?? Promise.resolve(),
    dismiss: () => active()?.dismiss(),
    invalidate: () => active()?.invalidate(),
    dispose() {
      const binding = runtime.current?.descriptor === descriptor ? runtime.current : null;
      binding?.actions.invalidate();
      binding?.dispose();
      if (runtime.current === binding) runtime.current = null;
    },
  };
}
