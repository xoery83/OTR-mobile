import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { chooseUiLocale } from "@/native/uiLocalePreference";
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
  maskEmail,
  moduleReturnPath,
  type GlobalMenuModule,
} from "./globalMenuModel";

export function GlobalMenu({
  journeyId,
  module,
}: {
  journeyId?: string | null;
  module: GlobalMenuModule;
}) {
  const locale = useUiLocale();
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
  const returnTo = moduleReturnPath(module);
  const sections: AppNavigationMenuItem[][] = [
    ...(contextItems.length ? [contextItems] : []),
    [
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
