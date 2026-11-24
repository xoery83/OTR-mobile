import { beforeEach, expect, it, vi } from "vitest";
import ImportSheetLayout from "../../../app/import-plans/_layout";

const route = vi.hoisted(() => ({ pathname: "/import-plans", jobId: undefined as string | undefined }));
vi.mock("expo-router", () => ({
  Stack: "Stack",
  useLocalSearchParams: () => ({ jobId: route.jobId }),
  usePathname: () => route.pathname,
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "import" }) }));
vi.mock("@/ui/theme", () => ({ useUiTheme: () => ({ transparent: "transparent" }) }));
vi.mock("@/components/SheetRouteLayout", () => ({ SheetRouteLayout: "SheetRouteLayout" }));

beforeEach(() => {
  route.pathname = "/import-plans";
  route.jobId = undefined;
});

it("uses the short hosted layout on the fresh Import route", () => {
  expect(ImportSheetLayout().props.immersive).toBe(false);
});

it("uses the near-top hosted layout for a retained batch and its review", () => {
  route.jobId = "original-job";
  expect(ImportSheetLayout().props.immersive).toBe(true);
  route.jobId = undefined;
  route.pathname = "/import-plans/review";
  expect(ImportSheetLayout().props.immersive).toBe(true);
});
