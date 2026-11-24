import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import { useRoute } from "expo-router/react-navigation";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { TripMembersRoster } from "@/features/day-feed/TripMembersSheet";
import { tripMembersInvocations } from "@/features/day-feed/hostedTripMembers";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function TripMembersSheetIndex() {
  useUiLocale();
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const read = () => tripMembersInvocations.read(invocation);
  const entry = useSyncExternalStore(tripMembersInvocations.subscribe, read);
  const navigation = useNavigation();
  const { key: rosterKey } = useRoute();
  const { requestCloseWithAction, isExitPending } = useSheetMotion();
  useEffect(() => () => {
    queueMicrotask(() => tripMembersInvocations.read(invocation)?.onClose());
  }, [invocation]);

  return (
    <SheetRoutePanel title={t("people.title")} action={entry?.onAddTraveler && entry.members?.state === "AVAILABLE" ? {
      label: t("people.addTraveler"),
      // ui-foundation-exception: string -- Native SF Symbol for the Add Traveler action.
      icon: "plus",
      onPress: () => {
        const latest = read();
        if (!navigation.isFocused() || isExitPending() || !latest?.onAddTraveler || latest.members?.state !== "AVAILABLE") return;
        router.push({ pathname: "/trip-members-sheet/add", params: { invocation, rosterKey } });
      },
    } : undefined}>
      <TripMembersRoster members={entry?.members ?? null} onInvitePerson={entry?.onInvitePerson ? personId => {
        if (!navigation.isFocused() || isExitPending()) return;
        const latest = read();
        const person = latest?.members?.state === "AVAILABLE"
          ? latest.members.people.find(member => member.personId === personId) : undefined;
        if (!latest?.onInvitePerson || !person || person.isCurrentActor || person.localState === "LOCAL_PENDING") return;
        requestCloseWithAction(() => {
          const active = read();
          const activeMember = active?.members?.state === "AVAILABLE"
            ? active.members.people.find(member => member.personId === personId) : undefined;
          if (!active?.onInvitePerson || !activeMember || activeMember.isCurrentActor || activeMember.localState === "LOCAL_PENDING") return;
          tripMembersInvocations.release(invocation);
          active.onClose();
          active.onInvitePerson?.(personId);
        });
      } : undefined} />
    </SheetRoutePanel>
  );
}
