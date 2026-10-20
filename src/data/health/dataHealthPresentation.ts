import type {
  DataHealthFinding,
  DataHealthProgressStage,
  DataHealthReport,
} from "./dataHealthCoordinator";

export const DATA_HEALTH_PROGRESS_STAGES: readonly {
  id: DataHealthProgressStage;
  label: string;
}[] = [
  { id: "CHECKING_SAVED", label: "Checking saved changes" },
  { id: "SYNCING_REPAIRING", label: "Syncing and repairing" },
  { id: "CHECKING_SHARED", label: "Checking shared data" },
  { id: "VERIFYING", label: "Verifying" },
];

export type DataHealthAttentionItem = {
  key: string;
  title: string;
  message: string;
};

export function presentDataHealthReport(report: DataHealthReport, offline = false) {
  const attentionItems = userAttentionItems(report.findings);
  const messages: string[] = [];
  const convergence = report.convergence;

  if ((convergence?.recoveredChangeCount ?? 0) > 0)
    messages.push(
      `${convergence!.recoveredChangeCount} saved ${plural(convergence!.recoveredChangeCount, "change", "changes")} synced`,
    );
  if ((convergence?.refreshedJourneyCount ?? 0) > 0)
    messages.push("Shared data refreshed");
  if ((convergence?.localRepairCount ?? 0) > 0)
    messages.push(
      `${convergence!.localRepairCount} local ${plural(convergence!.localRepairCount, "issue", "issues")} repaired`,
    );

  const automaticWork = report.findings.some(canContinueAutomatically);
  const protectedDiagnostics = report.findings.some(
    (finding) => !requiresUserAction(finding) && !canContinueAutomatically(finding),
  );
  if (offline && automaticWork)
    messages.push("Some changes will sync when you're online");
  else if (automaticWork)
    messages.push("Some saved changes will continue syncing automatically");
  if (attentionItems.length)
    messages.push(
      `${attentionItems.length} ${plural(attentionItems.length, "item needs", "items need")} your attention`,
    );
  if (protectedDiagnostics) messages.push("Some saved data remains protected");
  if (!messages.length && !attentionItems.length)
    messages.push("Everything is up to date");

  return { title: "Data check complete", messages, attentionItems };
}

export function userAttentionItems(findings: readonly DataHealthFinding[]) {
  const items = new Map<string, DataHealthAttentionItem>();
  for (const finding of findings) {
    if (!requiresUserAction(finding)) continue;
    const key = `${finding.ruleId}:${finding.targetType}:${finding.targetId}`;
    const title = objectLabel(finding.targetType);
    items.set(key, {
      key,
      title,
      message:
        finding.ruleId === "DH_RECEIPT_ORIGINAL_V1"
          ? "Original photo needs to be reattached"
          : finding.category === "CONFLICT"
            ? "Changed in two places"
            : "Needs a correction",
    });
  }
  return [...items.values()];
}

export function formatDataHealthTiming(report: DataHealthReport, now = new Date()) {
  const completedAt = report.runTiming?.completedAt;
  if (!completedAt) return null;
  const elapsed = report.runTiming
    ? Math.max(
        0,
        new Date(report.runTiming.completedAt).getTime() -
          new Date(report.runTiming.startedAt).getTime(),
      )
    : 0;
  return `${formatLastChecked(completedAt, now)} · ${formatDuration(elapsed)}`;
}

export function formatLastChecked(value: string, now = new Date()) {
  const elapsed = Math.max(0, now.getTime() - new Date(value).getTime());
  if (elapsed < 60_000) return "Last checked just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `Last checked ${minutes}m ago`;
  return `Last checked ${Math.floor(minutes / 60)}h ago`;
}

export function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function technicalDataHealthDetails(
  report: DataHealthReport | null,
  debugMode: boolean,
) {
  if (!debugMode || !report) return null;
  if (!report.findings.length) return "No findings";
  return report.findings
    .map(
      (finding) =>
        `${finding.ruleId} · ${finding.category}\n${finding.targetType} · ${finding.targetId}\n${finding.inputDigest}`,
    )
    .join("\n\n");
}

function requiresUserAction(finding: DataHealthFinding) {
  return (
    finding.category === "ACTIONABLE_INPUT" ||
    finding.category === "CONFLICT" ||
    (finding.category === "UNRECOVERABLE_INPUT" &&
      finding.ruleId === "DH_RECEIPT_ORIGINAL_V1")
  );
}

function canContinueAutomatically(finding: DataHealthFinding) {
  return [
    "RETRYABLE",
    "AUTH_PAUSED",
    "DEPENDENCY_BLOCKED",
    "MIRROR_STALE",
    "ORPHAN_REBUILDABLE",
    "PROTECTED_LOCAL",
  ].includes(finding.category);
}

function objectLabel(targetType: string) {
  if (targetType === "receipt" || targetType === "asset_operation") return "Receipt";
  if (targetType.includes("expense")) return "Expense";
  if (targetType.includes("payment")) return "Payment";
  return "Saved item";
}

function plural(count: number, singular: string, pluralValue: string) {
  return count === 1 ? singular : pluralValue;
}
