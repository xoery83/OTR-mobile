import { shellShowsUpdates } from "./bottomBarVisibility";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { chooseUiLocale } from "@/native/uiLocalePreference";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Alert } from "react-native";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { useTripView } from "@/features/day-feed/TripViewContext";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { useQueryClient } from "@tanstack/react-query";

import { readLocalSession } from "@/data/auth/authRepository";
import { createDefaultAccountSwitchCoordinator } from "@/data/auth/defaultAccountSwitchCoordinator";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import type { AccountIdentity } from "@/domain/auth/localSession";

import { AppNavigationMenu, type AppNavigationMenuItem } from "./AppNavigationMenu";
import {
  contextualMenuDestinations,
  selectedTripMenuId,
  maskEmail,
  moduleReturnPath,
  type GlobalMenuModule,
} from "./globalMenuModel";

export function GlobalMenu({
  journeyId,
  module,
  nativeToolbar = false,
}: {
  journeyId?: string | null;
  module: GlobalMenuModule;
  nativeToolbar?: boolean;
}) {
  const locale = useUiLocale();
  const params = useGlobalSearchParams<{ tripId?: string; view?: string }>();
  const pathname = usePathname();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { quickActions, workingTrip } = useTripView();
  const returnLease = useMemo(
    () => ({
      quickActions,
      tripId: params.tripId,
      view: params.view,
      pathname,
      generation,
    }),
    [quickActions, params.tripId, params.view, pathname, generation],
  );
  const currentReturn = useRef<typeof returnLease | null>(returnLease);
  useLayoutEffect(() => {
    currentReturn.current = returnLease;
    return () => {
      currentReturn.current = null;
    };
  }, [returnLease]);
  const changeLanguage = () =>
    Alert.alert(t("navigation.language"), undefined, [
      {
        text:
          locale === "en"
            ? t("navigation.selectedLanguage", { language: t("navigation.english") })
            : t("navigation.english"),
        onPress: () => {
          void chooseUiLocale("en").catch(() =>
            Alert.alert(t("navigation.languageFailed")),
          );
        },
      },
      {
        text:
          locale === "zh-Hans"
            ? t("navigation.selectedLanguage", { language: t("navigation.chinese") })
            : t("navigation.chinese"),
        onPress: () => {
          void chooseUiLocale("zh-Hans").catch(() =>
            Alert.alert(t("navigation.languageFailed")),
          );
        },
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  const queryClient = useQueryClient();
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [actor, setActor] = useState<{
    displayName: string | null;
    journeyId: string | null;
    role: string | null;
  }>({ displayName: null, journeyId: null, role: null });
  const accountSwitch = useMemo(
    () =>
      createDefaultAccountSwitchCoordinator({
        clearInMemoryState: () => queryClient.clear(),
      }),
    [queryClient],
  );

  useEffect(() => {
    let active = true;
    void readLocalSession()
      .then(async (session) => {
        if (!active) return;
        setIdentity(session?.identity ?? null);
        if (!session?.identity) return;
        try {
          const repository = await getDefaultLedgerReportingRepository();
          const actorContext = journeyId
            ? await repository.getActorContext(journeyId)
            : null;
          if (!active) return;
          setActor({
            displayName: actorContext?.displayName ?? null,
            journeyId: journeyId ?? null,
            role: actorContext?.role ?? null,
          });
        } catch {
          if (active)
            setActor({ displayName: null, journeyId: journeyId ?? null, role: null });
        }
      })
      .catch(() => {
        if (active) setIdentity(null);
      });
    return () => {
      active = false;
    };
  }, [journeyId]);

  const contextItems = contextualMenuDestinations(module).map<AppNavigationMenuItem>(
    (destination) => ({
      icon:
        destination.label === "My Ledger" ? "list.bullet.rectangle" : "dollarsign.circle",
      label:
        destination.label === "My Ledger"
          ? t("navigation.myLedger")
          : t("navigation.currency"),
      onPress: () =>
        destination.label === "Currency" && journeyId
          ? router.push({ pathname: destination.path, params: { journeyId } } as never)
          : router.push(destination.path as never),
    }),
  );
  const tripContextId = selectedTripMenuId(pathname, params);
  const hasTripItems =
    module === "TRIP" &&
    tripContextId &&
    quickActions?.tripId === tripContextId &&
    quickActions.generation === generation &&
    (!!quickActions.editTrip || !!quickActions.chooseDay || !!quickActions.members);
  const tripItems: AppNavigationMenuItem[] = hasTripItems
    ? [
        ...(quickActions.editTrip
          ? [
              {
                icon: "square.and.pencil" as const,
                label: t("tripHome.edit"),
                onPress: () => {
                  if (
                    currentReturn.current === returnLease &&
                    generation === getAccountGeneration()
                  )
                    quickActions.editTrip?.();
                },
              },
            ]
          : []),
        ...(quickActions.members
          ? [
              {
                icon: "person.2" as const,
                label: t("tripHome.members"),
                onPress: () => {
                  if (
                    currentReturn.current === returnLease &&
                    generation === getAccountGeneration()
                  )
                    quickActions.members?.();
                },
              },
            ]
          : []),
        ...(quickActions.chooseDay
          ? [
              {
                icon: "calendar" as const,
                label: t("dayFeed.openDay"),
                onPress: () => {
                  if (
                    currentReturn.current === returnLease &&
                    generation === getAccountGeneration()
                  )
                    quickActions.chooseDay?.();
                },
              },
            ]
          : []),
      ]
    : [];
  const returnTo = moduleReturnPath(module);
  const sections: AppNavigationMenuItem[][] = [
    ...(hasTripItems ? [tripItems] : []),
    ...(contextItems.length ? [contextItems] : []),
    ...(pathname === "/trip" &&
    !selectedTripMenuId(pathname, params) &&
    params.view !== "create"
      ? []
      : [
          [
            {
              icon: "suitcase",
              label: t("navigation.allTrips"),
              onPress: () => {
                const current = () =>
                  returnLease === currentReturn.current &&
                  generation === getAccountGeneration();
                if (!current()) return;
                const navigate = () => {
                  if (!current()) return;
                  router.navigate({
                    pathname: "/trip",
                    params: { view: "trips", tripId: "", date: "", zone: "" },
                  });
                };
                if (pathname === "/trip" && params.view === "create") {
                  Alert.alert(t("navigation.leaveTripSetup"), undefined, [
                    { text: t("actionIsland.stay"), style: "cancel" },
                    {
                      text: t("actionIsland.discard"),
                      style: "destructive",
                      onPress: navigate,
                    },
                  ]);
                  return;
                }
                const selectedTripId = selectedTripMenuId(pathname, params);
                if (
                  selectedTripId &&
                  quickActions?.tripId === selectedTripId &&
                  quickActions.generation === generation &&
                  quickActions.backToTrips
                )
                  quickActions.backToTrips();
                else navigate();
              },
            },
          ] as AppNavigationMenuItem[],
        ]),
    [
      ...(identity?.userId && !shellShowsUpdates(pathname, params, Boolean(workingTrip))
        ? [
            {
              icon: "tray" as const,
              label: t("updates.title"),
              onPress: () => router.navigate("/updates" as never),
            },
          ]
        : []),
      {
        icon: "gearshape",
        label: t("navigation.settings"),
        onPress: () => router.push("/settings" as never),
      },
      {
        icon: "globe",
        label: t("navigation.language"),
        onPress: changeLanguage,
      },
    ],
    [
      {
        destructive: true,
        icon: "arrow.right",
        label: t("navigation.logOut"),
        onPress: () =>
          Alert.alert(t("navigation.logOutQuestion"), t("navigation.localDataRemains"), [
            { style: "cancel", text: t("common.cancel") },
            {
              style: "destructive",
              text: t("navigation.logOut"),
              onPress: () => {
                void accountSwitch
                  .logout()
                  .then(() => router.replace("/foundation"))
                  .catch(() =>
                    Alert.alert(
                      t("navigation.logOutFailed"),
                      t("navigation.pleaseTryAgain"),
                    ),
                  );
              },
            },
          ]),
      },
    ],
  ];
  const role = actor.journeyId === (journeyId ?? null) ? actor.role : null;
  const displayName = actor.journeyId === (journeyId ?? null) ? actor.displayName : null;
  const detail = [
    role ? t(role === "owner" ? "role.organizer" : "role.member") : null,
    maskEmail(identity?.email ?? null),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AppNavigationMenu
      nativeToolbar={nativeToolbar}
      identity={{
        primary: displayName ?? identity?.displayName ?? t("common.currentAccount"),
        secondary: detail || null,
      }}
      onIdentityPress={() =>
        router.push({ pathname: "/account", params: { returnTo } } as never)
      }
      sections={sections}
    />
  );
}
