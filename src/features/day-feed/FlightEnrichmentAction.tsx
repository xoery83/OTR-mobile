import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { StyleSheet, View } from "react-native";
import { useNetworkState } from "expo-network";
import { randomUUID } from "expo-crypto";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { readFlightEnrichmentRepository } from "@/data/repositories/flightEnrichmentRepository";
import {
  requestSchema,
  canApplySuggestions,
  type FlightEnrichmentRequest,
  type FlightEnrichmentResponse,
  type Suggestion,
} from "@/domain/intelligence/flightEnrichmentContracts";
import { UiButton, UiText } from "@/ui/controls";
import { t, formatUiDate } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
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
  const styles = useThemedStyles(createStyles);
  const network = useNetworkState();
  const online = network.isConnected === true && network.isInternetReachable !== false;
  const [lookupEpoch, setLookupEpoch] = useState(0);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const [capability, setCapability] = useState<{
    tripId: string;
    generation: number;
    enabled: boolean;
  } | null>(null);
  const available =
    capability?.tripId === tripId &&
    capability.generation === generation &&
    capability.enabled;
  const [status, setStatus] = useState<
    "idle" | "loading" | "filled" | "manual" | "stale" | "review" | "budget" | "unknown"
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
  const snapshot = useRef({
    bytes: "",
    revision: 0,
    generation: getAccountGeneration(),
    tripId,
  });
  const bytes = JSON.stringify(value);
  useLayoutEffect(() => {
    if (snapshot.current.bytes !== bytes || snapshot.current.tripId !== tripId)
      snapshot.current = {
        ...snapshot.current,
        bytes,
        tripId,
        revision: snapshot.current.revision + 1,
      };
  }, [bytes, tripId]);
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
            setSuggestions(null);
            setCapability({ tripId, generation, enabled });
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
  }, [tripId, online, generation]);
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
        response.failureReason === "UNKNOWN"
          ? "unknown"
          : response.failureReason === "BUDGET_REJECTED"
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
  const heldForReview =
    !!suggestions &&
    canApplySuggestions(suggestions.response, suggestions.request) &&
    applyFlightLookup(suggestions.response, suggestions.request, value) === null;
  const cancel = () => {
    requestOwner.current = null;
    controller.current?.abort();
    inFlight.current = false;
    suggestionToken.current = null;
    setSuggestions(null);
    setStatus((previous) => (previous === "unknown" ? "unknown" : "manual"));
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

  const fieldLabel = (field: Suggestion["field"]) =>
    t(
      (
        {
          flightNumber: "manualFlight.number",
          departureAirport: "manualFlight.originAirport",
          arrivalAirport: "manualFlight.destinationAirport",
          departureLocalDate: "manualFlight.departureDate",
          arrivalLocalDate: "tripCreate.arrivalDate",
          departureLocalTime: "manualFlight.departureLocal",
          arrivalLocalTime: "manualFlight.arrivalLocal",
          departureTimezone: "manualFlight.departureZone",
          arrivalTimezone: "manualFlight.arrivalZone",
          marketingCarrier: "flightLookup.marketingCarrier",
          operatingCarrier: "flightLookup.operatingCarrier",
        } as const
      )[field],
    );
  const evidence = (suggestion: Suggestion) => (
    <View>
      <UiText style={styles.meta}>
        {t("flightLookup.source", { value: suggestion.source.url })}
      </UiText>
      <UiText style={styles.meta}>
        {t("flightLookup.observed", {
          value: formatUiDate(new Date(suggestion.source.observedAt), {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
            timeZoneName: "short",
          }),
        })}
      </UiText>
      <UiText style={styles.meta}>
        {suggestion.applicableDate.from && suggestion.applicableDate.to
          ? t("flightLookup.applies", {
              from: formatUiDate(
                new Date(suggestion.applicableDate.from + "T12:00:00Z"),
                { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" },
              ),
              to: formatUiDate(new Date(suggestion.applicableDate.to + "T12:00:00Z"), {
                year: "numeric",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }),
            })
          : t("flightLookup.dateUnconfirmed")}
      </UiText>
      <UiText style={styles.meta}>{suggestion.source.quote}</UiText>
      {suggestion.reason ? (
        <UiText style={styles.meta}>
          {t(`flightLookup.reason.${suggestion.reason}`)}
        </UiText>
      ) : null}
    </View>
  );

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
        <UiText style={styles.text}>{t("flightLookup.references")}</UiText>
      ) : null}
      {suggestions?.response.references.map((reference, index) => (
        <View key={`reference:${index}`}>
          <UiText style={styles.text}>
            {t("flightLookup.reference", {
              field: fieldLabel(reference.field),
              value: reference.value,
            })}
          </UiText>
          {evidence(reference)}
        </View>
      ))}
      {heldForReview ? (
        <UiText style={styles.text}>{t("flightLookup.inconsistent")}</UiText>
      ) : null}
      {suggestions?.response.suggestions.map((suggestion, index) => {
        if (
          heldForReview ||
          ["departureTimezone", "arrivalTimezone"].includes(suggestion.field)
        )
          return (
            <View key={suggestion.field}>
              <UiText style={styles.text}>
                {t("flightLookup.reference", {
                  field: fieldLabel(suggestion.field),
                  value: suggestion.value,
                })}
              </UiText>
              {evidence(suggestion)}
            </View>
          );
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
            <View key={suggestion.field}>
              <UiButton
                label={t("flightLookup.adopt", {
                  field: fieldLabel(suggestion.field),
                  value: suggestion.value,
                })}
                disabled={disabled || bytes !== suggestions.bytes}
                onPress={() => resolve(index, changes)}
              />
              {evidence(suggestion)}
            </View>
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
            <UiText style={styles.text}>
              {t("flightLookup.suggestion", { field: label, value: suggestion.value })}
            </UiText>
            {evidence(suggestion)}
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
      {suggestions?.response.usage?.metering === "PENDING" ? (
        <UiText style={styles.text}>{t("flightLookup.usagePending")}</UiText>
      ) : null}
      {status !== "idle" && status !== "loading" ? (
        <UiText style={styles.text}>{t(`flightLookup.${status}`)}</UiText>
      ) : null}
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    text: { color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
  });
