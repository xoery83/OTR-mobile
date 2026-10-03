import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { SettlementUpdateScreen } from "./SettlementUpdateScreen";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReactNode): string;
};

vi.mock("@react-native-community/datetimepicker", () => ({ default: "input" }));

vi.mock("react-native", () => ({
  useColorScheme: () => "light",
  useWindowDimensions: () => ({ width: 375, fontScale: 1 }),
  ActivityIndicator: "span",
  Pressable: "button",
  ScrollView: "main",
  Text: "span",
  TextInput: "input",
  View: "div",
  StyleSheet: {
    create: (value: unknown) => value,
    flatten: (value: unknown) =>
      Array.isArray(value) ? Object.assign({}, ...value) : value,
  },
}));
vi.mock("expo-router", () => ({
  router: {},
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => ({ journeyId: "journey" }),
}));
vi.mock("@/data/repositories/defaultLedgerExpenseRepository", () => ({}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({}));
vi.mock("./SettlementRateAcceptance", () => ({ SettlementRateAcceptance: () => null }));
vi.mock("@/hooks/useStage7Settlement", () => ({
  useStage7Settlement: () => ({
    summaryProjection: {
      confirmedSettlement: { balanceMinor: 5500 },
      balanceMinor: 5500,
      paidMinor: 18113,
      shareMinor: 12613,
      currency: "NZD",
      scale: 2,
      confirmationDiff: [],
      freshness: "SAVED",
      sourceFingerprint: null,
    },
    isOrganizer: true,
    confirmationVerified: false,
    updating: false,
    hasPendingFinancialOperations: false,
    refresh: () => undefined,
    refreshDiagnostic: "source_verification · local",
    message:
      "The latest amounts could not be verified. Check for latest changes before confirming.",
  }),
}));

it("keeps internal verification diagnostics out of normal confirmation UI and uses neutral business copy", () => {
  // Hosted Dev transport must not implicitly enable diagnostics.
  vi.stubEnv("EXPO_PUBLIC_OTR_SYNC_TRANSPORT", "dev");
  try {
    const html = renderToStaticMarkup(createElement(SettlementUpdateScreen));
    expect(html).not.toContain("source_verification");
    expect(html).not.toContain("Refresh diagnostic");
    expect(html).not.toContain("conflicting changes");
    expect(html).toContain("The latest amounts could not be verified");
    expect(html).toContain("Check for latest changes");
    expect(html).toContain("disabled");
  } finally {
    vi.unstubAllEnvs();
  }
});
