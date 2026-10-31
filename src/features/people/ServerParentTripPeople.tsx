import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";
import {
  readServerParentPeopleContext,
  saveServerParentTripTraveler,
} from "@/data/repositories/tripPersonCloudCreateRepository";
import { TripMembersSummary } from "@/features/day-feed/TripSetupRows";
import type { AddTravelerInput } from "./AddTravelerSheet";

const sameContext = (a: AccountRequestContext, b: AccountRequestContext) =>
  a.accountId === b.accountId && a.tripId === b.tripId && a.generation === b.generation;

// The caller keeps this unmounted until the owning parent reader is enabled.
export function ServerParentTripPeople({
  tripId,
  generation,
  setup,
  onSetup,
}: {
  tripId: string;
  generation: number;
  setup: TripPreparationSetup | null;
  onSetup(setup: TripPreparationSetup): void;
}) {
  const current =
    setup?.context.tripId === tripId && setup.context.generation === generation
      ? setup
      : null;
  const actors =
    current?.members.state === "AVAILABLE"
      ? current.members.people.filter((person) => person.isCurrentActor)
      : [];
  const actorId = actors.length === 1 ? actors[0].personId : null;
  const scope = current?.context;
  const accountId = scope?.accountId,
    scopeTripId = scope?.tripId,
    scopeGeneration = scope?.generation;
  const qualificationKey = useMemo(
    () => ({ accountId, tripId: scopeTripId, generation: scopeGeneration, actorId }),
    [accountId, scopeTripId, scopeGeneration, actorId],
  );
  const [qualified, setQualified] = useState<
    | (Awaited<ReturnType<typeof readServerParentPeopleContext>> & {
        key: typeof qualificationKey;
      })
    | undefined
  >();
  const alive = useRef(false);
  const latest = useRef({ current, actorId, onSetup, qualificationKey });
  useLayoutEffect(() => {
    latest.current = { current, actorId, onSetup, qualificationKey };
  }, [current, actorId, onSetup, qualificationKey]);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const isCurrent = useCallback(
    (origin: AccountRequestContext, owner: string, key: typeof qualificationKey) =>
      alive.current &&
      origin.generation === getAccountGeneration() &&
      !!latest.current.current &&
      sameContext(origin, latest.current.current.context) &&
      latest.current.actorId === owner &&
      latest.current.qualificationKey === key,
    [],
  );
  useEffect(() => {
    let cancelled = false;
    const { accountId, tripId, generation, actorId } = qualificationKey;
    if (accountId && tripId && generation !== undefined && actorId) {
      const origin = Object.freeze({ accountId, tripId, generation });
      void readServerParentPeopleContext(origin)
        .then((proof) => {
          if (
            !cancelled &&
            isCurrent(origin, actorId, qualificationKey) &&
            sameContext(proof.context, origin) &&
            proof.ownerPersonId === actorId
          )
            setQualified({ ...proof, key: qualificationKey });
        })
        .catch(() => {
          // A missing/closed parent never enables authoring or removes the readable roster.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isCurrent, qualificationKey]);
  const available =
    qualified &&
    qualified.key === qualificationKey &&
    scope &&
    actorId === qualified.ownerPersonId &&
    sameContext(qualified.context, scope) &&
    generation === getAccountGeneration();
  const add = available
    ? async (input: AddTravelerInput) => {
        const origin = qualified.context;
        const owner = qualified.ownerPersonId;
        if (!isCurrent(origin, owner, qualified.key))
          throw Error("PEOPLE_CONTEXT_CHANGED");
        // The repository re-reads the owning parent and validates again before queueing.
        const result = await saveServerParentTripTraveler(origin, input);
        if (!isCurrent(origin, owner, qualified.key))
          throw Error("PEOPLE_CONTEXT_CHANGED");
        const currentSetup = latest.current.current!;
        latest.current.onSetup({
          ...currentSetup,
          members: {
            state: "AVAILABLE",
            namedCount: result.people.filter((person) => person.displayName.trim())
              .length,
            people: result.people
              .filter((person) => person.displayName.trim() || person.personId === owner)
              .map(({ personId, displayName, localState }) => ({
                personId,
                displayName,
                ...(localState ? { localState } : {}),
                isCurrentActor: personId === owner,
              })),
          },
        });
      }
    : undefined;
  return (
    <TripMembersSummary
      tripId={tripId}
      generation={generation}
      setup={current}
      onAddTraveler={add}
    />
  );
}
