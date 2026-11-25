import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Stack, router } from "expo-router";
import { ScrollView } from "react-native";
import {
  readNativeDirectedInvitePorts,
  requireAdoptedUserId,
} from "@/data/auth/authRepository";
import {
  captureAccountScope,
  assertAccountRequestContext,
  type AccountScope,
} from "@/data/auth/accountRequestContext";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import type { IncomingInvitationReference } from "@/data/repositories/incomingInvitationSelection";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

type Ports = Awaited<ReturnType<typeof readNativeDirectedInvitePorts>>;
type Entry = {
  scope: AccountScope;
  ports: Ports;
  invitations: IncomingInvitationReference[];
  selected: IncomingInvitationReference | null;
};

// Opening is read-only; each selected invitation is qualified again by the normal request page.
export default function IncomingInvitationsRoute() {
  useUiLocale();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const [entry, setEntry] = useState<Entry | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [settled, setSettled] = useState<{ generation: number; reload: number } | null>(null);
  const checking = settled?.generation !== generation || settled.reload !== reload;
  useEffect(() => {
    let alive = true;
    void (async () => {
      const scope = await captureAccountScope(requireAdoptedUserId);
      const ports = await readNativeDirectedInvitePorts();
      const result = await ports.selection.open(scope, () =>
        ports.reader.incoming(scope),
      );
      await assertAccountRequestContext(scope, requireAdoptedUserId);
      if (
        alive &&
        scope.generation === generation &&
        generation === getAccountGeneration()
      ) {
        setEntry({
          scope,
          ports,
          selected: result.selected,
          invitations: result.selected ? [result.selected] : result.invitations,
        });
        setFailed(null);
        setSettled({ generation, reload });
      }
    })().catch(() => {
      if (alive && generation === getAccountGeneration()) {
        setFailed(generation);
        setSettled({ generation, reload });
      }
    });
    return () => {
      alive = false;
    };
  }, [generation, reload]);
  const current = entry?.scope.generation === generation ? entry : null;
  const latest = useRef(settled);
  useLayoutEffect(() => {
    latest.current = checking ? null : settled;
    return () => {
      latest.current = null;
    };
  }, [checking, settled]);
  function reloadInbox() {
    latest.current = null;
    setReload((value) => value + 1);
  }
  async function open(reference: IncomingInvitationReference) {
    if (!current || !settled || latest.current !== settled) return;
    try {
      await assertAccountRequestContext(current.scope, requireAdoptedUserId);
      if (latest.current !== settled) return;
      await current.ports.selection.select(current.scope, reference);
      await assertAccountRequestContext(current.scope, requireAdoptedUserId);
      if (latest.current === settled)
        router.push({ pathname: "/pending-claim", params: reference });
    } catch {
      if (latest.current === settled && generation === getAccountGeneration()) setFailed(generation);
    }
  }
  async function showAll() {
    if (!current?.selected || !settled || latest.current !== settled) return;
    try {
      // Navigation reference only: the original Claim checkpoint is never cleared here.
      await current.ports.selection.clear(current.scope, current.selected);
      await assertAccountRequestContext(current.scope, requireAdoptedUserId);
      if (latest.current === settled) reloadInbox();
    } catch { if (latest.current === settled && generation === getAccountGeneration()) setFailed(generation); }
  }
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("people.claimResolution.incomingInvitations"),
        }}
      />
      <ScrollView>
        <UiSection title={t("people.claimResolution.incomingInvitations")}>
          <UiText>
            {checking
              ? t("people.directedInvite.loading")
              : failed === generation
                ? t("people.directedInvite.unavailable")
                : current?.invitations.length
                  ? t("people.pendingClaim.ready")
                  : t("people.directedInvite.incomingEmpty")}
          </UiText>
          {current?.invitations.map((reference) => (
            <UiButton
              key={reference.inviteId}
              label={t("people.directedClaim.title")}
              disabled={checking}
              onPress={() => {
                void open(reference);
              }}
            />
          ))}
          {current?.selected ? <UiButton variant="secondary" label={t("people.directedInvite.all")} disabled={checking} onPress={() => { void showAll(); }} /> : null}
          <UiButton
            variant="secondary"
            label={t("people.directedInvite.reload")}
            disabled={checking}
            onPress={reloadInbox}
          />
        </UiSection>
      </ScrollView>
    </>
  );
}
