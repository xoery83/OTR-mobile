import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@/data/api/client";
import { useStage7Settlement } from "./useStage7Settlement";
import { systemMessage } from "@/ui/domainLabels";
import { getUiLocale, setUiLocale, t } from "@/ui/locale";
const ui = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  refresh: vi.fn(),
}));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = ui.cursor++;
    if (!(index in ui.slots))
      ui.slots[index] = typeof initial === "function" ? initial() : initial;
    return [
      ui.slots[index],
      (value: unknown) => {
        ui.slots[index] = value;
      },
    ];
  },
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
}));
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: true }),
}));
vi.mock("@/data/db/databaseErrorDiagnostic", () => ({
  databaseErrorDiagnostic: () => "synthetic",
}));
vi.mock("@/data/health/defaultDataHealthCoordinator", () => ({
  recoverMissingSettlementEconomicDates: vi.fn(),
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: vi.fn(),
}));
vi.mock("@/data/repositories/defaultLedgerSettlementRepository", () => ({
  getDefaultLedgerSettlementRepository: vi.fn(),
}));
vi.mock("@/data/sync/ledgerReportingCoordinator", () => ({
  refreshJourneyLedger: ui.refresh,
  revalidateJourneyLedger: vi.fn(),
}));
vi.mock("@/data/sync/ledgerSettlementPaymentCoordinator", () => ({
  runLedgerSettlementPaymentSync: vi.fn(),
}));
vi.mock("@/data/sync/ledgerExportCoordinator", () => ({
  generateCurrentSettlementExport: vi.fn(),
  listSettlementExports: vi.fn(),
  shareSettlementExport: vi.fn(),
}));
vi.mock("@/data/sync/ledgerSettlementCoordinator", () => ({
  finalizeSettlement: vi.fn(),
  preflightSettlementFx: vi.fn(),
  previewSettlementAdjustment: vi.fn(),
  previewSettlement: vi.fn(),
  queueSettlementAdjustment: vi.fn(),
}));
vi.mock("@/features/ledger/loadEstimatedSettlement", () => ({
  loadEstimatedSettlement: vi.fn(),
}));
function RenderFixture() {
  return useStage7Settlement("synthetic-trip");
}
function readFixture() {
  ui.cursor = 0;
  return RenderFixture();
}
beforeEach(() => {
  ui.slots = [];
  ui.cursor = 0;
  vi.clearAllMocks();
});
it.each([
  [
    new ApiClientError("private backend body", "http", 503),
    "Settlement preview failed.",
  ],
  [new Error("private database detail"), "Settlement preview failed."],
  [
    new Error("Sync pending Ledger changes before preparing settlement."),
    "Sync pending financial changes before confirming.",
  ],
  [
    new Error(
      "Saved Ledger data does not yet match the current Settlement source.",
    ),
    "Saved Ledger data does not yet match the current Settlement source.",
  ],
])(
  "retains safe readiness feedback and restores interaction: %s",
  async (error, expected) => {
    ui.refresh.mockRejectedValue(error);
    await readFixture().prepare();
    expect(readFixture()).toMatchObject({
      message: expected,
      busy: false,
      preview: null,
    });
  },
);
it("shows localized feedback outside debug mode while keeping diagnostics gated", () => {
  const screen = readFileSync(
    new URL(
      "../features/ledger/SettlementReadinessScreen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  // The complete normal-mode allowlist excludes every other action's raw message.
  const guard = screen.match(
    /settlement\.message &&\s*\(debugMode \|\|\s*(\[[^]*?\])\.includes\(settlement\.message\)\)/,
  );
  expect(guard).not.toBeNull();
  const allowed = JSON.parse(guard![1].replace(/,\s*\]/, "]"));
  expect(allowed).toEqual([
    "Settlement preview failed.",
    "Sync pending financial changes before confirming.",
    "Saved Ledger data does not yet match the current Settlement source.",
  ]);
  expect(allowed).not.toContain("private export/payment backend error");
  expect(screen).toContain(
    "{debugMode ? settlement.message : systemMessage(settlement.message)}",
  );
  expect(screen).toContain("{debugMode && settlement.refreshDiagnostic ? (");
  const original = getUiLocale();
  try {
    setUiLocale("zh-Hans");
    expect(systemMessage("Settlement preview failed.")).toBe(
      t("ledgerFeedback.copy13"),
    );
    expect(systemMessage("Settlement preview failed.")).not.toBe(
      "Settlement preview failed.",
    );
  } finally {
    setUiLocale(original);
  }
});
