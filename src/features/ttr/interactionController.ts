import { instantMicroseconds } from "@/domain/trip/dayReadModel";
import type { ComposedTransition } from "@/features/day-feed/TransitionRow";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import type {
  createTtrSelectionRepository,
  TtrSelectionRelation,
} from "@/data/repositories/ttrSelectionRepository";
import {
  qualifyTtr,
  ttrIdentityKey,
  ttrInputSchema,
  ttrModeSchema,
  ttrRouteFingerprint,
  type TtrIdentity,
  type TtrMode,
} from "@/domain/trip/ttr";
import {
  openTtr,
  projectTtr,
  reduceTtr,
  type TtrPresentationProjection,
  type TtrSelection,
  type TtrState,
} from "@/domain/trip/ttrState";

export type TtrInteractionSource = Readonly<{
  relation: TtrSelectionRelation;
  projection: TtrPresentationProjection;
  presentation: Readonly<{ key: string; authorized: boolean }>;
}>;
type Repository = Pick<
  ReturnType<typeof createTtrSelectionRepository>,
  "read" | "confirm"
>;
type Outcome = Readonly<{
  status: "PUBLISHED" | "SAVED_UNPUBLISHED" | "UNCERTAIN";
  selection?: TtrSelection;
}>;

/** Synthetic-only, scoped instance; replace it when Account/Trip/generation changes. */
export function createTtrInteractionController(dependencies: {
  repository: Repository;
  context(): AccountRequestContext;
  resolve(identity: TtrIdentity): TtrInteractionSource | null;
  clock(): string;
  publish(projection: TtrPresentationProjection, presentationKey: string): void;
}) {
  const context = { ...dependencies.context() };
  let disposed = false,
    serial = 0;
  type Session = {
    serial: number;
    source: TtrInteractionSource;
    pin: string;
    state: TtrState;
    choice: number;
    uncertain: boolean;
  };
  let session: Session | null = null;
  let pending: { session: Session; choice: number; promise: Promise<Outcome> } | null =
    null;
  const sameContext = (other: AccountRequestContext) =>
    other.accountId === context.accountId &&
    other.tripId === context.tripId &&
    other.generation === context.generation;
  function source(identity: TtrIdentity): TtrInteractionSource {
    if (disposed || !sameContext(dependencies.context()))
      throw new Error("TTR_INTERACTION_CONTEXT_CHANGED");
    instantMicroseconds(dependencies.clock());
    const raw = dependencies.resolve(identity);
    if (!raw) throw new Error("TTR_INTERACTION_UNAVAILABLE");
    const current = {
      ...structuredClone(raw),
      relation: { ...raw.relation, input: ttrInputSchema.parse(raw.relation.input) },
    };
    const { relation, projection: p, presentation } = current;
    const q = qualifyTtr(relation.input);
    const scope = relation.input.scope;
    if (
      !sameContext(scope) ||
      !Number.isSafeInteger(relation.accessRevision) ||
      relation.accessRevision < 1 ||
      !Number.isSafeInteger(relation.publicationVersion) ||
      relation.publicationVersion < 0 ||
      !presentation.authorized ||
      !presentation.key ||
      q.status !== "QUALIFIED" ||
      ttrIdentityKey(q.identity) !== ttrIdentityKey(identity) ||
      p.version !== "ttr-presentation/1" ||
      p.qualification !== "QUALIFIED" ||
      p.visibility === "HIDDEN" ||
      !p.identity ||
      ttrIdentityKey(p.identity) !== ttrIdentityKey(q.identity) ||
      p.publicationVersion !== relation.publicationVersion ||
      !p.actions.openTtr ||
      p.actions.openTtr.publicationVersion !== p.publicationVersion ||
      ttrIdentityKey(p.actions.openTtr.identity) !== ttrIdentityKey(q.identity) ||
      p.inputFingerprint !== (p.mode ? ttrRouteFingerprint(q, p.mode) : null) ||
      JSON.stringify(p.geometricDistance) !== JSON.stringify(q.geometricDistance) ||
      JSON.stringify(p.anchors) !== JSON.stringify(relation.input.anchors) ||
      projectTtr(openTtr(relation.input), {
        now: dependencies.clock(),
        displayPermission: "DENIED",
      }).visibility === "HIDDEN"
    )
      throw new Error("TTR_INTERACTION_UNAVAILABLE");
    return current;
  }
  const pin = (s: TtrInteractionSource) =>
    JSON.stringify([s.relation, s.presentation, s.projection]);
  function invalidate() {
    ++serial;
    if (session) session.state = reduceTtr(session.state, { type: "DISMISS" });
    session = null;
  }
  function live(s: Session): boolean {
    try {
      if (disposed || session !== s || s.serial !== serial) return false;
      if (pin(source(s.source.projection.identity!)) !== s.pin) {
        invalidate();
        return false;
      }
      return true;
    } catch {
      invalidate();
      return false;
    }
  }
  function active(): Session {
    if (!session || !live(session)) throw new Error("TTR_INTERACTION_STALE");
    return session;
  }
  function publish(s: Session, selection: TtrSelection, choice: number): boolean {
    if (!live(s) || s.choice !== choice) return false;
    if (
      selection.identityKey !== ttrIdentityKey(s.source.projection.identity!) ||
      selection.mode !== s.state.preview?.mode
    )
      throw new Error("TTR_INTERACTION_SELECTION_MISMATCH");
    const durable = { ...s.state, confirmed: selection };
    const projection = projectTtr(reduceTtr(durable, { type: "DISMISS" }), {
      now: dependencies.clock(),
      displayPermission: "DENIED",
    });
    if (!projection.actions.openTtr || !live(s)) return false;
    // Close this local draft before a synchronous consumer can re-enter the controller.
    invalidate();
    try {
      dependencies.publish(projection, s.source.presentation.key);
      return true;
    } catch {
      return false;
    }
  }
  return {
    async onOpenTtr(
      intent: ComposedTransition["openTtr"],
      presentation: Pick<ComposedTransition, "key" | "inputFingerprint">,
    ): Promise<void> {
      const capturedIntent = structuredClone(intent);
      const capturedPresentation = { ...presentation };
      invalidate();
      const ticket = serial;
      const current = source(capturedIntent.identity);
      if (
        capturedIntent.publicationVersion !== current.projection.publicationVersion ||
        capturedPresentation.key !== ttrIdentityKey(capturedIntent.identity) ||
        capturedPresentation.inputFingerprint !== current.projection.inputFingerprint
      )
        throw new Error("TTR_INTERACTION_STALE_INTENT");
      const capturedPin = pin(current);
      const selection = await dependencies.repository.read(context, current.relation);
      if (
        disposed ||
        ticket !== serial ||
        pin(source(capturedIntent.identity)) !== capturedPin
      )
        throw new Error("TTR_INTERACTION_STALE");
      session = {
        serial: ticket,
        source: current,
        pin: capturedPin,
        state: openTtr(
          current.relation.input,
          selection,
          capturedIntent.publicationVersion,
        ),
        choice: 0,
        uncertain: false,
      };
    },
    snapshot(): Readonly<{
      state: TtrState;
      saving: boolean;
      uncertain: boolean;
    }> | null {
      if (!session || !live(session)) return null;
      return structuredClone({
        state: session.state,
        saving: pending?.session === session && pending.choice === session.choice,
        uncertain: session.uncertain,
      });
    },
    preview(mode: TtrMode) {
      const s = active();
      const parsed = ttrModeSchema.parse(mode);
      if (s.state.preview?.mode !== parsed) {
        if (s.uncertain) throw new Error("TTR_INTERACTION_REREAD_REQUIRED");
        s.state = reduceTtr(s.state, { type: "PREVIEW", mode: parsed });
        ++s.choice;
      }
    },
    confirm(): Promise<Outcome> {
      const s = active(),
        choice = s.choice,
        mode = s.state.preview?.mode;
      if (!mode) throw new Error("TTR_INTERACTION_NO_MODE");
      if (s.uncertain) throw new Error("TTR_INTERACTION_REREAD_REQUIRED");
      if (pending?.session === s && pending.choice === choice) return pending.promise;
      const promise = (async (): Promise<Outcome> => {
        let selection: TtrSelection;
        try {
          selection = await dependencies.repository.confirm(
            context,
            s.source.relation,
            mode,
          );
        } catch {
          if (live(s) && s.choice === choice) s.uncertain = true;
          return { status: "UNCERTAIN" };
        }
        return publish(s, selection, choice)
          ? { status: "PUBLISHED", selection }
          : { status: "SAVED_UNPUBLISHED" };
      })();
      pending = { session: s, choice, promise };
      void promise
        .finally(() => {
          if (pending?.promise === promise) pending = null;
        })
        .catch(() => {});
      return promise;
    },
    async recover(): Promise<TtrSelection | null> {
      const s = active(),
        choice = s.choice;
      if (pending?.session === s) throw new Error("TTR_INTERACTION_SAVE_PENDING");
      const selection = await dependencies.repository.read(context, s.source.relation);
      if (!live(s) || s.choice !== choice) throw new Error("TTR_INTERACTION_STALE");
      s.uncertain = false;
      s.state = { ...s.state, confirmed: selection };
      if (selection && selection.mode === s.state.preview?.mode)
        publish(s, selection, choice);
      return selection;
    },
    dismiss: invalidate,
    invalidate,
    dispose() {
      disposed = true;
      invalidate();
    },
  };
}
