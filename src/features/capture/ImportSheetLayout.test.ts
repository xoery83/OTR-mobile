import { expect, it, vi } from "vitest";
import ImportSheetLayout from "../../../app/import-plans/_layout";

vi.mock("expo-router", () => ({ Stack: "Stack", useLocalSearchParams: () => ({}) }));
vi.mock("@/ui/theme", () => ({ useUiTheme: () => ({ transparent: "transparent" }) }));
vi.mock("@/components/SheetRouteLayout", () => ({ SheetRouteLayout: "SheetRouteLayout" }));
vi.mock("./hostedImport", () => ({ hostedImportEnabled: false }));

it("keeps the originating page visible behind legacy Import", () => {
  expect(ImportSheetLayout().props.screenOptions).toEqual({
    headerShown: false,
    contentStyle: { backgroundColor: "transparent" },
  });
});
