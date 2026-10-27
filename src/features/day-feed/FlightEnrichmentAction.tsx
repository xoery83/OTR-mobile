import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useNetworkState } from "expo-network";
import { randomUUID } from "expo-crypto";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { readFlightEnrichmentRepository } from "@/data/repositories/flightEnrichmentRepository";
import {
  requestSchema,
  type FlightEnrichmentRequest,
  type FlightEnrichmentResponse,
} from "@/domain/intelligence/flightEnrichmentContracts";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import type { FlightSegmentDraft } from "./manualFlightFormFields";
import {
  applyFlightLookup,
  flightLookupIdentity,
  flightLookupKnownFields,
} from "./flightEnrichmentDraft";
export function FlightEnrichmentAction({
  tripId,
  value,
  editing,
  disabled,
  onApply,
}: {
  tripId: string;
  value: FlightSegmentDraft;
  editing: boolean;
  disabled: boolean;
  onApply(changes: Partial<FlightSegmentDraft>): void;
}) {
  useUiLocale();
  const network = useNetworkState();
  const online = network.isConnected === true && network.isInternetReachable !== false;
  const [available, setAvailable] = useState(false),
    [status, setStatus] = useState<"idle" | "loading" | "filled" | "manual" | "stale">(
      "idle",
    );
  const [suggestions, setSuggestions] = useState<{
    response: FlightEnrichmentResponse;
    bytes: string;
  } | null>(null);
  const [attemptedKeys, setAttemptedKeys] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(false),
    lease = useRef<symbol | null>(null);
  const attempted = useRef(new Set<string>()),
    alive = useRef(false),
    controller = useRef<AbortController | null>(null);
  const snapshot = useRef({ bytes: "", revision: 0, generation: getAccountGeneration() });
  const bytes = JSON.stringify(value);
  useLayoutEffect(() => {
    if (snapshot.current.bytes !== bytes)
      snapshot.current = {
        ...snapshot.current,
        bytes,
        revision: snapshot.current.revision + 1,
      };
  }, [bytes]);
  const lookup = useRef<Awaited<
    ReturnType<typeof readFlightEnrichmentRepository>
  > | null>(null);
  useEffect(() => {
    const owner = Symbol("flight-enrichment");
    lease.current = owner;
    alive.current = true;
    if (online)
      void readFlightEnrichmentRepository(tripId)
        .then(async (repo) => {
          const enabled = await repo.available();
          if (
            alive.current &&
            lease.current === owner &&
            snapshot.current.generation === getAccountGeneration()
          ) {
            lookup.current = repo;
            setAvailable(enabled);
            setStatus((previous) => (previous === "loading" ? "manual" : previous));
          }
        })
        .catch(() => {});
    return () => {
      if (lease.current === owner) lease.current = null;
      alive.current = false;
      inFlight.current = false;
      controller.current?.abort();
      lookup.current = null;
    };
  }, [tripId, online]);
  const identity = flightLookupIdentity(value);
  const emptyDetails =
    !value.originCode &&
    !value.originName &&
    !value.destinationCode &&
    !value.destinationName &&
    !value.departureTime &&
    !value.arrivalTime;
  const eligible = !editing || emptyDetails;
  const find = async () => {
    if (
      inFlight.current ||
      !online ||
      !available ||
      disabled ||
      !eligible ||
      !lookup.current ||
      attempted.current.has(identity)
    )
      return;
    const requestId = randomUUID();
    const parsed = requestSchema.safeParse({
      version: "otr-flight-enrichment/1",
      requestId,
      idempotencyKey: requestId,
      mode: editing ? "EDIT" : "CREATE",
      draft: { id: value.key, revision: snapshot.current.revision },
      flightNumber: identity.split(":")[0],
      departureLocalDate: value.departureDate,
      knownFields: flightLookupKnownFields(value),
    });
    if (!parsed.success) return;
    const request: FlightEnrichmentRequest = parsed.data,
      expected = snapshot.current;
    const owner = lease.current;
    inFlight.current = true;
    attempted.current.add(identity);
    setAttemptedKeys(new Set(attempted.current));
    controller.current = new AbortController();
    setStatus("loading");
    try {
      const response = await lookup.current.find(request, controller.current.signal);
      if (
        !alive.current ||
        lease.current !== owner ||
        expected.generation !== getAccountGeneration()
      )
        return;
      if (snapshot.current.revision !== expected.revision) {
        setStatus("stale");
        return;
      }
      const changes = applyFlightLookup(response, request, value);
      setSuggestions({
        response,
        bytes: JSON.stringify({ ...value, ...(changes ?? {}) }),
      });
      if (changes && Object.keys(changes).length) {
        onApply(changes);
        setStatus("filled");
      } else setStatus("manual");
    } catch {
      if (
        alive.current &&
        lease.current === owner &&
        expected.generation === getAccountGeneration()
      )
        setStatus("manual");
    } finally {
      if (lease.current === owner) inFlight.current = false;
    }
  };
  if (!online || !available || (!eligible && !suggestions)) return null;
  const valid =
    requestSchema.shape.flightNumber.safeParse(identity.split(":")[0]).success &&
    requestSchema.shape.departureLocalDate.safeParse(value.departureDate).success;
  return (
    <View>
      <UiButton
        label={t(status === "loading" ? "flightLookup.loading" : "flightLookup.find")}
        variant="secondary"
        disabled={
          disabled || status === "loading" || !valid || attemptedKeys.has(identity)
        }
        onPress={() => void find()}
      />
      {suggestions?.response.references.length ? (
        <UiText>{t("flightLookup.references")}</UiText>
      ) : null}
      {suggestions?.response.references.map((reference, index) => (
        <UiText key={`reference:${index}`}>
          {t("flightLookup.reference", { value: reference.value })}
        </UiText>
      ))}
      {suggestions?.response.suggestions.map((suggestion, index) => {
        const field =
          suggestion.field === "departureLocalTime"
            ? "departureTime"
            : suggestion.field === "arrivalLocalTime"
              ? "arrivalTime"
              : null;
        if (
          !field ||
          suggestion.referenceOnly ||
          suggestion.eligibility !== "KEEP_OR_REPLACE"
        )
          return null;
        const label = t(
          field === "departureTime"
            ? "manualFlight.departureLocal"
            : "manualFlight.arrivalLocal",
        );
        const resolve = (replace: boolean) => {
          if (
            disabled ||
            snapshot.current.generation !== getAccountGeneration() ||
            snapshot.current.bytes !== suggestions.bytes
          )
            return;
          const changes = replace ? { [field]: suggestion.value } : {};
          if (replace) onApply(changes);
          setSuggestions({
            response: {
              ...suggestions.response,
              suggestions: suggestions.response.suggestions.filter((_, i) => i !== index),
            },
            bytes: JSON.stringify({ ...value, ...changes }),
          });
        };
        return (
          <View key={suggestion.field}>
            <UiText>
              {t("flightLookup.suggestion", { field: label, value: suggestion.value })}
            </UiText>
            <UiButton
              label={t("flightLookup.keep")}
              variant="text"
              disabled={disabled || bytes !== suggestions.bytes}
              onPress={() => resolve(false)}
            />
            <UiButton
              label={t("flightLookup.replace")}
              variant="secondary"
              disabled={disabled || bytes !== suggestions.bytes}
              onPress={() => resolve(true)}
            />
          </View>
        );
      })}
      {status !== "idle" && status !== "loading" ? (
        <UiText>{t(`flightLookup.${status}`)}</UiText>
      ) : null}
    </View>
  );
}
