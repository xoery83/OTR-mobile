import { useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  hostedDayMoveEnabled, readDayMoveSheet, releaseDayMoveSheet, stageDayMoveSheet, updateDayMoveSheet,
} from "./dayMoveConfirmationSheet";
import type { DayMoveConfirmation } from "./useP1Move";

export function useHostedDayMoveConfirmation(
  confirmation: DayMoveConfirmation | null,
  active: boolean,
  today: boolean,
  tripId: string,
  generation: number,
) {
  const source = useNavigation();
  const root = useNavigation("/");
  const route = useRoute();
  const scope = useRef<object | null>(null);
  const invocation = useRef<string | undefined>(undefined);
  const presented = useRef<object | undefined>(undefined);
  const [fallback, setFallback] = useState<object>();
  useLayoutEffect(() => {
    scope.current = active ? {} : null;
    return () => { scope.current = null; };
  }, [active, generation, route.key, today, tripId]);
  useLayoutEffect(() => () => releaseDayMoveSheet(invocation.current), []);

  useEffect(() => {
    if (!hostedDayMoveEnabled) return;
    const previous = readDayMoveSheet(invocation.current);
    if (previous) {
      updateDayMoveSheet(previous.id, confirmation);
      return;
    }
    const origin = scope.current;
    if (!confirmation || !origin || !tripId || presented.current === confirmation.proposalIdentity) return;
    const originCurrent = () => {
      const leaf = source.getState()?.routes.find(candidate => candidate.key === route.key);
      const params = leaf?.params;
      return scope.current === origin && generation === getAccountGeneration() && !!leaf &&
        (today || !!params && "view" in params && params.view === "day" &&
          "tripId" in params && params.tripId === tripId);
    };
    const state = root.getState();
    const originKey = state?.routes[state.index]?.key;
    if (!source.isFocused() || !state || !originKey || !originCurrent()) return;
    const id = stageDayMoveSheet({
      generation,
      originKey,
      originCurrent,
      confirmation,
      originFocused: () => {
        const current = root.getState();
        return source.isFocused() && current?.routes[current.index]?.key === originKey;
      },
    });
    if (!id) return;
    presented.current = confirmation.proposalIdentity;
    root.dispatch({
      type: "PUSH", target: state.key, source: originKey,
      payload: { name: "day-move", params: { invocation: id, screen: "index", params: { invocation: id } } },
    });
    const next = root.getState();
    const opened = next?.routes[next.index];
    if (next?.key === state.key && opened?.name === "day-move" &&
        next.routes[next.index - 1]?.key === originKey && opened.params &&
        "invocation" in opened.params && opened.params.invocation === id) {
      invocation.current = id;
    } else {
      releaseDayMoveSheet(id);
      if (source.isFocused() && originCurrent()) setFallback(confirmation.proposalIdentity);
    }
  }, [confirmation, generation, root, route.key, source, today, tripId]);
  return !hostedDayMoveEnabled || !!confirmation && fallback === confirmation.proposalIdentity;
}
