import { StyleSheet, Text, View } from "react-native";
import { useUiLocale } from "@/ui/useUiLocale";
import { t, formatUiDate, formatUiNumber } from "@/ui/locale";
import { UiSection, UiButton } from "@/ui/controls";
import { visual } from "@/ui/visual";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { getSyncTransportMode } from "@/data/sync/transportSelection";
import { useLocalOperations } from "@/hooks/useLocalOperations";
import type { LocalOperationsSnapshot } from "@/data/operations/localOperations";

export function LocalOperationsDiagnostics() {
  const enabled = __DEV__ && getSyncTransportMode() === "dev";
  const { snapshot, failed, refreshing, refresh } = useLocalOperations(enabled);
  if (!enabled) return null;
  return (
    <LocalOperationsView
      snapshot={snapshot}
      failed={failed}
      refreshing={refreshing}
      onRefresh={refresh}
    />
  );
}

export function LocalOperationsView({
  snapshot,
  failed,
  refreshing,
  onRefresh,
}: {
  snapshot: LocalOperationsSnapshot | null;
  failed: boolean;
  refreshing: boolean;
  onRefresh(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createOperationsStyles);
  const unknown = t("operations.unknown");
  const observedTime = (at: string | null) =>
    at !== null && Number.isFinite(Date.parse(at))
      ? formatUiDate(new Date(at), {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      : unknown;
  const yesNo = (value: boolean | null) =>
    value === null ? unknown : value ? t("common.yes") : t("common.no");
  const number = (value: number | null) =>
    value === null ? unknown : formatUiNumber(value);
  return (
    <UiSection title={t("operations.title")}>
      <UiButton
        label={t("operations.refresh")}
        variant="secondary"
        disabled={refreshing}
        onPress={onRefresh}
      />
      {failed ? <Text style={styles.text}>{t("operations.unavailable")}</Text> : null}
      {!snapshot && !failed ? (
        <Text style={styles.text}>{t("common.loading")}</Text>
      ) : null}
      {snapshot ? (
        <>
          <Text style={styles.text}>
            {t("operations.observed", { time: observedTime(snapshot.observedAt) })}
          </Text>
          {Object.entries(snapshot.coverage).map(([source, coverage]) => (
            <Text key={source} style={styles.text}>
              {t("operations.coverage", {
                source: t(
                  `operations.source.${source as keyof LocalOperationsSnapshot["coverage"]}`,
                ),
                coverage: t(`operations.coverage.${coverage}`),
              })}
            </Text>
          ))}
          <Text style={styles.text}>{t("operations.sample")}</Text>
          {snapshot.coverage.dataHealth === "AVAILABLE" ? (
            <Text style={styles.text}>
              {snapshot.dataHealth
                ? t("operations.health", {
                    outcome: snapshot.dataHealth.outcome
                      ? t(`operations.dataHealth.${snapshot.dataHealth.outcome}`)
                      : unknown,
                    findings: number(snapshot.dataHealth.findingCount),
                    attention: number(snapshot.dataHealth.attentionCount),
                  })
                : t("operations.neverObserved")}
            </Text>
          ) : null}
          {snapshot.dataHealth ? (
            <Text style={styles.text}>
              {t("operations.healthUpdated", {
                time: observedTime(snapshot.dataHealth.updatedAt),
              })}
            </Text>
          ) : null}
          {!snapshot.rows.length ? (
            <Text style={styles.text}>
              {t(
                [snapshot.coverage.continuation, snapshot.coverage.sync].some(
                  (coverage) => coverage === "AVAILABLE" || coverage === "LIMITED",
                )
                  ? "operations.empty"
                  : "operations.noReadableRows",
              )}
            </Text>
          ) : null}
          {snapshot.rows.map((row, index) => (
            <View key={`${row.source}:${row.correlationId}`} style={styles.row}>
              <Text style={styles.heading}>
                {t("operations.row", {
                  source: t(`operations.source.${row.source}`),
                  number: number(index + 1),
                  health: t(`operations.health.${row.health}`),
                })}
              </Text>
              <Text style={styles.text}>
                {t("operations.attention", {
                  user: yesNo(row.userActionRequired),
                  operator: yesNo(row.operatorAttentionRequired),
                })}
              </Text>
              <Text style={styles.text}>
                {t("operations.updated", {
                  time: observedTime(row.sourceUpdatedAt),
                  clock: row.clock ? t(`operations.clock.${row.clock}`) : unknown,
                  age:
                    row.ageSeconds === null
                      ? unknown
                      : t("operations.seconds", { seconds: number(row.ageSeconds) }),
                })}
              </Text>
              {row.failure ? (
                <Text style={styles.text}>
                  {t("operations.failure", {
                    failure: t(`operations.failure.${row.failure}`),
                  })}
                </Text>
              ) : null}
              {row.passComplete !== null ? (
                <Text style={styles.text}>
                  {t("operations.pass", { value: yesNo(row.passComplete) })}
                </Text>
              ) : null}
              {row.waitReason ? (
                <Text style={styles.text}>
                  {t("operations.wait", {
                    value: t(`operations.wait.${row.waitReason}`),
                  })}
                </Text>
              ) : null}
              {row.source === "CONTINUATION" ? (
                <>
                  <Text style={styles.text}>
                    {t("operations.attempt", {
                      execution: row.execution
                        ? t(`operations.execution.${row.execution}`)
                        : unknown,
                      installation: row.installation
                        ? t(`operations.installation.${row.installation}`)
                        : unknown,
                      metering: row.metering
                        ? t(`operations.metering.${row.metering}`)
                        : unknown,
                    })}
                  </Text>
                  <Text style={styles.text}>
                    {t("operations.usage", {
                      input: number(row.usage.inputTokens),
                      output: number(row.usage.outputTokens),
                      total: number(row.usage.totalTokens),
                      quality: t(`operations.quality.${row.usage.quality}`),
                    })}
                  </Text>
                  <Text style={styles.text}>
                    {t("operations.cost", {
                      quality: t(`operations.quality.${row.cost.quality}`),
                    })}
                  </Text>
                </>
              ) : null}
              <Text style={styles.text}>
                {t("operations.recovery", {
                  value: t(`operations.recovery.${row.automaticRecovery}`),
                })}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </UiSection>
  );
}
const createOperationsStyles = (colors: UiColors) =>
  StyleSheet.create({
    text: { color: colors.textSecondary, ...visual.type.meta },
    heading: { color: colors.textPrimary, ...visual.type.row },
    row: { gap: visual.space.heading, paddingTop: visual.space.row },
  });
