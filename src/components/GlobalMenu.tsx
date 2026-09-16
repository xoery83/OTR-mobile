import { useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { readLocalSession } from "@/data/auth/authRepository";
import { createDefaultAccountSwitchCoordinator } from "@/data/auth/defaultAccountSwitchCoordinator";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import type { AccountIdentity } from "@/domain/auth/localSession";

import { AppNavigationMenu, type AppNavigationMenuItem } from "./AppNavigationMenu";
import {
  contextualMenuDestinations,
  journeyRoleLabel,
  maskEmail,
  moduleReturnPath,
  showDevMenu,
  type GlobalMenuModule,
} from "./globalMenuModel";

export function GlobalMenu({
  journeyId,
  module,
}: {
  journeyId?: string | null;
  module: GlobalMenuModule;
}) {
  const queryClient = useQueryClient();
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [actor, setActor] = useState<{
    displayName: string | null;
    journeyId: string | null;
    role: string | null;
  }>({ displayName: null, journeyId: null, role: null });
  const [debugMode, setDebugMode] = useState(false);
  const accountSwitch = useMemo(
    () =>
      createDefaultAccountSwitchCoordinator({
        clearInMemoryState: () => queryClient.clear(),
        bootstrapAccount: async () => undefined,
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
          const [actorContext, preferences] = await Promise.all([
            journeyId ? repository.getActorContext(journeyId) : Promise.resolve(null),
            repository.getPreferences(),
          ]);
          if (!active) return;
          setActor({
            displayName: actorContext?.displayName ?? null,
            journeyId: journeyId ?? null,
            role: actorContext?.role ?? null,
          });
          setDebugMode(preferences.debugMode);
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
        destination.label === "My Ledger"
          ? "list.bullet.rectangle"
          : destination.label === "Review"
            ? "checkmark"
            : "gearshape",
      label: destination.label,
      onPress: () => {
        if (destination.label === "Review" && journeyId) {
          router.push({ pathname: destination.path, params: { journeyId } } as never);
        } else {
          router.push(destination.path as never);
        }
      },
    }),
  );
  const returnTo = moduleReturnPath(module);
  const sections: AppNavigationMenuItem[][] = [
    ...(contextItems.length ? [contextItems] : []),
    [
      {
        icon: "gearshape",
        label: "Settings",
        onPress: () => router.push("/settings" as never),
      },
      {
        icon: "globe",
        label: "Language",
        onPress: () =>
          Alert.alert("Language", "OTR currently follows your device language settings."),
      },
    ],
    ...(showDevMenu(debugMode)
      ? [
          [
            {
              icon: "person.2",
              label: "Switch test account",
              onPress: () =>
                router.push({
                  pathname: "/account",
                  params: { mode: "dev", returnTo },
                } as never),
            },
            {
              icon: "wrench.and.screwdriver",
              label: "Diagnostics",
              onPress: () => router.push("/diagnostics" as never),
            },
          ] satisfies AppNavigationMenuItem[],
        ]
      : []),
    [
      {
        destructive: true,
        icon: "arrow.right",
        label: "Log out",
        onPress: () =>
          Alert.alert("Log out?", "Your saved local data will remain on this device.", [
            { style: "cancel", text: "Cancel" },
            {
              style: "destructive",
              text: "Log out",
              onPress: () => {
                void accountSwitch
                  .logout()
                  .then(() => router.replace("/foundation"))
                  .catch(() => Alert.alert("Log out failed", "Please try again."));
              },
            },
          ]),
      },
    ],
  ];
  const role = actor.journeyId === (journeyId ?? null) ? actor.role : null;
  const displayName = actor.journeyId === (journeyId ?? null) ? actor.displayName : null;
  const detail = [journeyRoleLabel(role), maskEmail(identity?.email ?? null)]
    .filter(Boolean)
    .join(" · ");

  return (
    <AppNavigationMenu
      identity={{
        primary: displayName ?? identity?.displayName ?? "Current account",
        secondary: detail || null,
      }}
      onIdentityPress={() =>
        router.push({ pathname: "/account", params: { returnTo } } as never)
      }
      sections={sections}
    />
  );
}
