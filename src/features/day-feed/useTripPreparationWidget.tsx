import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  readTripPreparationSetupRepository,
  type TripPreparationSetup,
} from "@/data/repositories/tripPreparationSetupRepository";
import type { TripSetupMetadata } from "./TripSetupRows";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  readTripPreparation,
  type TripPreparationRead,
} from "@/data/repositories/tripPreparationRepository";
import type { TripHomeWidget } from "@/features/trip/TripHomeWidgetHost";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { TripPreparationWidget } from "./TripPreparationWidget";

export function useTripPreparationWidget({
  tripId,
  undated,
  onImport,
  onBuild,
  onOpenDay,
  onOpenItem,
  metadata,
  onEdit,
  onCover,
  onSetup,
}: {
  tripId: string | null;
  undated: boolean;
  onImport?: () => void;
  onBuild?: () => void;
  onOpenDay?: () => void;
  onOpenItem?: (tripId: string, itemId: string, epoch: string) => Promise<void>;
  metadata?: TripSetupMetadata;
  onEdit?: () => void;
  onCover?: () => void;
  onSetup?: (value: TripPreparationSetup | null) => void;
}): TripHomeWidget | null {
  useUiLocale();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const [read, setRead] = useState<TripPreparationRead | null>(null);
  const [state, setState] = useState<"LOADING" | "READY" | "UNAVAILABLE">("LOADING");
  const [setup, setSetup] = useState<TripPreparationSetup | null>(null);
  const request = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++request.current;
    if (!tripId) return;
    // Keep a scoped local projection visible during refresh; failure still clears it.
    setState((previous) => (previous === "READY" ? previous : "LOADING"));
    try {
      const [value, facts] = await Promise.all([
        readTripPreparation().then((reader) => reader.read(tripId)),
        readTripPreparationSetupRepository()
          .then((reader) => reader.read(tripId))
          .catch(() => null),
      ]);
      if (request.current !== ticket || generation !== getAccountGeneration()) return;
      setRead(value);
      const scopedFacts =
        facts &&
        value &&
        facts.context.tripId === value.scope.tripId &&
        facts.context.accountId === value.scope.accountId &&
        facts.context.generation === generation
          ? facts
          : null;
      setSetup(scopedFacts);
      onSetup?.(scopedFacts);
      setState(value ? "READY" : "UNAVAILABLE");
    } catch {
      if (request.current === ticket && generation === getAccountGeneration()) {
        setRead(null);
        setSetup(null);
        onSetup?.(null);
        setState("UNAVAILABLE");
      }
    }
  }, [tripId, generation, onSetup]);
  const cancelPending = useCallback(() => {
    request.current++;
  }, []);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.resolve().then(() => {
        if (active) void load();
      });
      const sub = AppState.addEventListener("change", (value) => {
        if (value === "active") void load();
      });
      return () => {
        active = false;
        cancelPending();
        sub.remove();
      };
    }, [load, cancelPending]),
  );
  const visible =
    read?.scope.tripId === tripId && read.scope.generation === generation ? read : null;
  const visibleSetup =
    visible &&
    setup?.context.tripId === tripId &&
    setup.context.accountId === visible.scope.accountId &&
    setup.context.generation === generation
      ? setup
      : null;
  const act = async (callback: () => void, needsPlan = false, itemId?: string) => {
    if (!tripId || generation !== getAccountGeneration()) return;
    const ticket = request.current;
    try {
      const reader = await readTripPreparation();
      const current = await reader.read(tripId);
      if (
        !current ||
        !visible ||
        current.scope.accountId !== visible.scope.accountId ||
        current.epoch !== visible.epoch ||
        (needsPlan && !current.canPlan)
      )
        return;
      if (request.current !== ticket || generation !== getAccountGeneration()) return;
      if (itemId && current.epoch && onOpenItem) {
        const item = await reader.resolveItem(tripId, itemId, current.epoch);
        if (item && request.current === ticket && generation === getAccountGeneration())
          await onOpenItem(tripId, itemId, current.epoch);
      } else callback();
    } catch {
      if (request.current === ticket && generation === getAccountGeneration())
        setState("UNAVAILABLE");
    }
  };
  if (!tripId) return null;
  const title = t(
    visible?.preparation.itemCount === 0
      ? "tripForm.prepare"
      : undated
        ? "tripHome.preparation.undated"
        : "tripHome.preparation.title",
  );
  return {
    id: "preparation",
    title,
    content: (
      <TripPreparationWidget
        setup={visibleSetup}
        metadata={metadata}
        onEdit={
          visible?.canPlan && onEdit
            ? () => {
                void act(onEdit, true);
              }
            : undefined
        }
        onCover={
          visible && onCover
            ? () => {
                void act(onCover);
              }
            : undefined
        }
        onCurrency={
          visible && visibleSetup
            ? () => {
                void act(() =>
                  router.push({
                    pathname: "/expenses/settings",
                    params: { journeyId: tripId },
                  }),
                );
              }
            : undefined
        }
        value={visible?.preparation ?? null}
        state={visible ? state : state === "READY" ? "UNAVAILABLE" : state}
        copy={{
          title,
          empty: t("tripHome.preparation.empty"),
          recent: t("tripHome.preparation.recent"),
          loading: t("tripHome.preparation.loading"),
          unavailable: t("tripHome.preparation.unavailable"),
          importPlans: t("tripHome.preparation.import"),
          buildItinerary: t("tripHome.preparation.build"),
          importMore: t("tripHome.preparation.more"),
          openDay: t("tripHome.preparation.day"),
          families: {
            P1: t("tripHome.preparation.P1"),
            P2: t("tripHome.preparation.P2"),
            P3: t("tripHome.preparation.P3"),
            P4: t("tripHome.preparation.P4"),
            P5: t("tripHome.preparation.P5"),
            P6: t("tripHome.preparation.P6"),
          },
        }}
        onImport={
          visible?.canPlan && onImport
            ? () => {
                void act(onImport, true);
              }
            : undefined
        }
        onBuildItinerary={
          visible?.canPlan && onBuild
            ? () => {
                void act(onBuild, true);
              }
            : undefined
        }
        onOpenDay={
          visible && onOpenDay
            ? () => {
                void act(onOpenDay);
              }
            : undefined
        }
        onOpenItem={
          visible?.epoch && onOpenItem
            ? (itemId) => {
                void act(() => {}, false, itemId);
              }
            : undefined
        }
      />
    ),
  };
}
