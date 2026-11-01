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
  const [lookupEpoch, setLookupEpoch] = useState(0);
  const [available, setAvailable] = useState(false),
    [status, setStatus] = useState<
      "idle" | "loading" | "filled" | "manual" | "stale" | "review" | "budget"
    >("idle");
  const [suggestions, setSuggestions] = useState<{
    response: FlightEnrichmentResponse;
    request: FlightEnrichmentRequest;
    bytes: string;
    revision: number;
    token: symbol;
  } | null>(null);
  const [attemptedKeys, setAttemptedKeys] = useState<ReadonlySet<string>>(new Set());
  const suggestionToken = useRef<symbol | null>(null);
  const requestOwner = useRef<symbol | null>(null);
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
            setLookupEpoch((previous) => previous + 1);
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
      suggestionToken.current = null;
      requestOwner.current = null;
    };
  }, [tripId, online]);
  const identity = flightLookupIdentity(value);
  const missingDetails =
    !(value.originCode || value.originName) ||
    !(value.destinationCode || value.destinationName) ||
    !value.departureTime ||
    !value.arrivalTime ||
    !value.arrivalDate;
  const eligible = missingDetails;
  const find = async () => {
    if (
      !alive.current ||
      !lease.current ||
      snapshot.current.generation !== getAccountGeneration() ||
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
    const queryOwner = Symbol("flight-query");
    requestOwner.current = queryOwner;
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
        requestOwner.current !== queryOwner ||
        expected.generation !== getAccountGeneration()
      )
        return;
      if (snapshot.current.revision !== expected.revision) {
        setStatus("stale");
        return;
      }
      const token = Symbol("flight-suggestions");
      suggestionToken.current = token;
      setSuggestions({
        response,
        request,
        bytes: expected.bytes,
        revision: expected.revision,
        token,
      });
      setStatus(
        response.failureReason === "BUDGET_REJECTED"
          ? "budget"
          : response.suggestions.length
            ? "review"
            : "manual",
      );
    } catch {
      if (
        alive.current &&
        lease.current === owner &&
        requestOwner.current === queryOwner &&
        expected.generation === getAccountGeneration()
      )
        setStatus("manual");
    } finally {
      if (lease.current === owner && requestOwner.current === queryOwner)
        inFlight.current = false;
    }
  };
  const valid =
    requestSchema.shape.flightNumber.safeParse(identity.split(":")[0]).success &&
    requestSchema.shape.departureLocalDate.safeParse(value.departureDate).success;
  const latestFind = useRef(find);
  useLayoutEffect(() => {
    latestFind.current = find;
  });
  useEffect(() => {
    if (
      editing ||
      disabled ||
      !online ||
      !available ||
      !eligible ||
      !valid ||
      status === "loading" ||
      attempted.current.has(identity)
    )
      return;
    const timer = setTimeout(() => {
      void latestFind.current();
    }, 600);
    return () => clearTimeout(timer);
  }, [
    editing,
    disabled,
    online,
    available,
    eligible,
    valid,
    identity,
    status,
    lookupEpoch,
  ]);
  if (!online || !available || (!eligible && !suggestions)) return null;
  const cancel = () => {
    requestOwner.current = null;
    controller.current?.abort();
    inFlight.current = false;
    suggestionToken.current = null;
    setSuggestions(null);
    setStatus("manual");
  };
  const resolve = (index: number, changes: Partial<FlightSegmentDraft>) => {
    if (
      !suggestions ||
      disabled ||
      !alive.current ||
      suggestionToken.current !== suggestions.token ||
      snapshot.current.generation !== getAccountGeneration()
    )
      return;
    if (
      snapshot.current.bytes !== suggestions.bytes ||
      snapshot.current.revision !== suggestions.revision
    ) {
      cancel();
      setStatus("stale");
      return;
    }
    if (Object.keys(changes).length) onApply(changes);
    const nextBytes = JSON.stringify({ ...value, ...changes }),
      token = Symbol("flight-suggestions");
    suggestionToken.current = token;
    setSuggestions({
      ...suggestions,
      response: {
        ...suggestions.response,
        suggestions: suggestions.response.suggestions.filter((_, i) => i !== index),
      },
      bytes: nextBytes,
      revision:
        snapshot.current.revision + (nextBytes === snapshot.current.bytes ? 0 : 1),
      token,
    });
    setStatus("filled");
  };

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
        if (suggestion.referenceOnly) return null;
        if (suggestion.eligibility === "ADOPT") {
          const changes = applyFlightLookup(
            { ...suggestions.response, suggestions: [suggestion] },
            suggestions.request,
            value,
          );
          if (!changes || !Object.keys(changes).length) return null;
          return (
            <UiButton
              key={suggestion.field}
              label={t("flightLookup.adopt", {
                field:
                  suggestion.field === "departureAirport"
                    ? t("manualFlight.originAirport")
                    : suggestion.field === "arrivalAirport"
                      ? t("manualFlight.destinationAirport")
                      : suggestion.field === "arrivalLocalDate"
                        ? t("tripCreate.arrivalDate")
                        : suggestion.field === "departureLocalTime"
                          ? t("manualFlight.departureLocal")
                          : t("manualFlight.arrivalLocal"),
                value: suggestion.value,
              })}
              disabled={disabled || bytes !== suggestions.bytes}
              onPress={() => resolve(index, changes)}
            />
          );
        }
        if (!field || suggestion.eligibility !== "KEEP_OR_REPLACE") return null;
        const label = t(
          field === "departureTime"
            ? "manualFlight.departureLocal"
            : "manualFlight.arrivalLocal",
        );
        return (
          <View key={suggestion.field}>
            <UiText>
              {t("flightLookup.suggestion", { field: label, value: suggestion.value })}
            </UiText>
            <UiButton
              label={t("flightLookup.keep")}
              variant="text"
              disabled={disabled || bytes !== suggestions.bytes}
              onPress={() => resolve(index, {})}
            />
            <UiButton
              label={t("flightLookup.replace")}
              variant="secondary"
              disabled={disabled || bytes !== suggestions.bytes}
              onPress={() => resolve(index, { [field]: suggestion.value })}
            />
          </View>
        );
      })}
      {suggestions || status === "loading" ? (
        <UiButton label={t("common.cancel")} variant="text" onPress={cancel} />
      ) : null}
      {status !== "idle" && status !== "loading" ? (
        <UiText>{t(`flightLookup.${status}`)}</UiText>
      ) : null}
    </View>
  );
}
