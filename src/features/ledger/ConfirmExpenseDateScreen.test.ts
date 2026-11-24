import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { ConfirmExpenseDateScreen } from "./ConfirmExpenseDateScreen";

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("expo-router", () => ({
  router: { back: vi.fn() },
  useLocalSearchParams: () => ({ expenseId: "shared-expense" }),
}));
vi.mock("expo-router/react-navigation", () => ({}));
vi.mock("react-native", () => ({}));
vi.mock("@/components/SheetHost", () => ({}));
vi.mock("@/components/SheetRoutePanel", () => ({}));
vi.mock("@/data/operations/completeEconomicDate", () => ({}));
vi.mock("@/data/repositories/defaultLedgerExpenseRepository", () => ({}));
vi.mock("@/ui/controls", () => ({}));
vi.mock("@/ui/domainLabels", () => ({}));
vi.mock("@/ui/forms", () => ({}));
vi.mock("@/ui/theme", () => ({}));
vi.mock("@/ui/useUiLocale", () => ({}));

it("replaces the direct-route draft on account change even for the same shared expense", () => {
  const first = ConfirmExpenseDateScreen();
  advanceAccountGeneration();
  const second = ConfirmExpenseDateScreen();
  expect(second.props.expenseId).toBe(first.props.expenseId);
  expect(second.key).not.toBe(first.key);
});
