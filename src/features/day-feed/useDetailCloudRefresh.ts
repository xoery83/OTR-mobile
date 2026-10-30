import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { useFocusEffect } from "expo-router";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { readCommittedLocalSession } from "@/data/auth/authRepository";
import { subscribeLedgerOperationalSyncCompletion } from "@/data/sync/ledgerOperationalSync";

// Refresh accepted reads while focused; never replace an open editor's draft.
export function useDetailCloudRefresh(
  tripId: string,
  generation: number,
  editing: boolean,
  setRevision: Dispatch<SetStateAction<number>>,
) {
  const wasEditing = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!editing && wasEditing.current) {
        setRevision((value) => value + 1);
      }
      wasEditing.current = editing;
      const stop = subscribeLedgerOperationalSyncCompletion((event) => {
        if (
          editing ||
          event.generation !== generation ||
          generation !== getAccountGeneration() ||
          !event.journeyIds.includes(tripId)
        )
          return;
        void readCommittedLocalSession()
          .then((session) => {
            if (
              !active ||
              generation !== getAccountGeneration() ||
              session?.identity?.userId !== event.accountId
            )
              return;
            setRevision((value) => value + 1);
          })
          .catch(() => undefined);
      });
      return () => {
        active = false;
        stop();
      };
    }, [tripId, generation, editing, setRevision]),
  );
}
