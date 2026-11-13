import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { ImportExceptionReviewContent } from "./ImportExceptionReviewScreen";
import { setUiLocale, t } from "@/ui/locale";
import { localImportDocumentId } from "@/domain/trip/universalImportIdentity";
import {
  completeUniversalV3RequiredFields,
  universalV3ReviewFields,
} from "@/data/operations/universalV3Review";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const h = vi.hoisted(() => ({
  hooks: [] as any[],
  cursor: 0,
  buttons: [] as any[],
  inputs: [] as any[],
  scrolls: [] as any[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: any) => {
    const index = h.cursor++;
    if (!(index in h.hooks)) h.hooks[index] = initial;
    return [
      h.hooks[index],
      (value: any) => {
        h.hooks[index] = typeof value === "function" ? value(h.hooks[index]) : value;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  AppState: { currentState: "active" },
  Platform: { OS: "ios" },
  StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
  View: "div",
  KeyboardAvoidingView: "div",
  Pressable: (p: any) => {
    h.buttons.push(p);
    return createElement("button", {}, p.children);
  },
  ScrollView: (p: any) => {
    h.scrolls.push(p);
    return createElement("div", {}, p.children);
  },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div" }));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));
vi.mock("@/components/navigationChrome", () => ({ NavigationContextTitle: () => null }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", {}, p.children),
  UiButton: (p: any) => {
    h.buttons.push(p);
    return createElement("button", {}, p.label);
  },
}));
vi.mock("@/ui/forms", () => ({
  UiChoiceChip: (p: any) => {
    h.buttons.push(p);
    return createElement("button", {}, p.label);
  },
  UiDatePicker: () => null,
  UiTextInput: (p: any) => {
    h.inputs.push(p);
    return createElement("input", {});
  },
}));
vi.mock("@/data/operations/defaultCaptureSubmission", () => ({
  reopenDefaultCaptureJob: vi.fn(),
}));
vi.mock("@/data/api/universalImportTransport", () => ({
  createUniversalImportTransport: vi.fn(),
}));
vi.mock("@/data/auth/accountRequestContext", () => ({
  captureAccountRequestContext: vi.fn(),
}));
vi.mock("@/data/auth/authRepository", () => ({ requireAdoptedUserId: vi.fn() }));
vi.mock("@/data/repositories/importSubmissionRepository", () => ({
  readImportSubmission: vi.fn(),
  updateImportSubmission: vi.fn(),
}));
vi.mock("./CaptureActivity", () => ({ captureActivityTime: (at: string) => at }));
const account = "00000000-0000-4000-8000-000000000001",
  trip = "00000000-0000-4000-8000-000000000002";
const docs = [
  localImportDocumentId(account, trip, "a".repeat(64)),
  localImportDocumentId(account, trip, "b".repeat(64)),
];
function fixture() {
  const model = {
    batch: {
      accountId: account,
      createdAt: "2026-11-14T00:00:00Z",
      context: { tripPrior: { id: trip } },
    },
    inputs: ["a", "b"].map((sha, i) => ({
      contentSha256: sha.repeat(64),
      originalFilename: i ? "Hotel confirmation.pdf" : "Trip notes.txt",
    })),
  } as any;
  const rows = [0, 1, 2].map((i) => ({
    candidate: {
      candidateId: `00000000-0000-4000-8000-00000000000${i + 3}`,
      kind: "P1" as const,
      subtype: "ACTIVITY",
      fields: { "activity.name": `Museum ${i + 1}` },
      documentIds: docs,
    },
    members: [],
    disposition: "REVIEW" as const,
    reason: "missing" as const,
  }));
  const props = {
    model,
    rows,
    intent: { confirmed: true, resolutions: {} } as any,
    statuses: {} as any,
    owner: {
      actions: (candidate: any) => ({ NEW: !!universalV3ReviewFields(candidate).start }),
      targets: () => [],
    },
    isCurrent: () => true,
    onConfirm: vi.fn(async (..._args: any[]) => {}),
  };
  return props;
}
function render(props: ReturnType<typeof fixture>) {
  h.cursor = 0;
  h.buttons = [];
  h.inputs = [];
  h.scrolls = [];
  return renderToStaticMarkup(createElement(ImportExceptionReviewContent, props));
}
const button = (label: string) =>
  h.buttons.find((b) => b.label === label || b.accessibilityLabel?.startsWith(label));
beforeEach(() => {
  h.hooks = [];
  setUiLocale("en");
});
it.each(["en", "zh-Hans"] as const)(
  "UX-C2 uses one continuous list, one expanded row and named source panel in %s",
  (locale) => {
    setUiLocale(locale);
    const p = fixture();
    let html = render(p);
    expect(html).toContain(t("capture.review.remaining", { count: 3 }));
    expect(h.scrolls.filter((s) => !s.horizontal)).toHaveLength(1);
    expect(h.scrolls.find((s) => !s.horizontal).maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
    });
    button(t("capture.review.question.missing") + ", Museum 1").onPress();
    html = render(p);
    expect(h.scrolls.filter((s) => s.horizontal)).toHaveLength(1);
    expect(h.inputs).toHaveLength(1);
    expect(button("Trip notes.txt").selected).toBe(true);
    button("Hotel confirmation.pdf").onPress();
    render(p);
    expect(button("Hotel confirmation.pdf").selected).toBe(true);
    button(t("capture.review.question.missing") + ", Museum 2").onPress();
    render(p);
    expect(h.inputs).toHaveLength(1);
    expect(h.buttons.filter((b) => b.accessibilityState?.expanded)).toHaveLength(1);
  },
);
it("UX-C2 TYPE-05 retains the inline date, collapses only after durable save, and remaining changes only on VERIFIED", async () => {
  const p = fixture();
  render(p);
  button(t("capture.review.question.missing") + ", Museum 1").onPress();
  render(p);
  expect(button(t("ui.confirm")).disabled).toBe(true);
  h.inputs[0].onChangeText("2026-12-18");
  render(p);
  expect(button(t("ui.confirm")).disabled).toBe(false);
  p.onConfirm.mockImplementation(
    async (candidate: any, decision: any, manual: any, durable: any) => {
      expect(universalV3ReviewFields(candidate).start).toBe("2026-12-18");
      expect(manual).toBe(true);
      p.intent.resolutions[candidate.candidateId] = { candidate, decision, manual };
      durable();
      p.statuses[candidate.candidateId] = "PENDING";
    },
  );
  button(t("ui.confirm")).onPress();
  await vi.waitFor(() => expect(p.onConfirm).toHaveBeenCalledOnce());
  await Promise.resolve();
  let html = render(p);
  expect(html).toContain(t("capture.review.status.applying"));
  expect(html).toContain(t("capture.review.remaining", { count: 3 }));
  expect(h.inputs).toHaveLength(0);
  p.statuses[p.rows[0].candidate.candidateId] = "VERIFIED";
  html = render(p);
  expect(html).toContain(t("capture.review.remaining", { count: 2 }));
  expect(html).toContain(t("capture.review.resolvedCount", { count: 1 }));
  expect(h.buttons.some((b) => b.accessibilityState?.expanded)).toBe(false);
});
it("UX-C2 offline, unknown and version conflict retain the original answer and unresolved count", () => {
  const p = fixture(),
    id = p.rows[0].candidate.candidateId;
  p.intent.resolutions[id] = {
    candidate: completeUniversalV3RequiredFields(p.rows[0].candidate, {
      "schedule.start.local_date": "2026-12-18",
    }),
    decision: { action: "NEW" },
    manual: true,
  };
  let html = render(p);
  expect(html).toContain(t("capture.review.status.waiting"));
  expect(html).toContain(t("capture.review.remaining", { count: 3 }));
  p.statuses[id] = "OUTCOME_UNKNOWN";
  html = render(p);
  expect(html).toContain(t("capture.review.status.unknown"));
  expect(p.onConfirm).not.toHaveBeenCalled();
  p.statuses[id] = "REVIEW_REQUIRED";
  html = render(p);
  expect(html).toContain(t("capture.review.status.recheck"));
  button(t("capture.review.question.missing") + ", Museum 1").onPress();
  const previous = render(p);
  expect(previous).toContain("2026-12-18");
  expect(h.inputs).toHaveLength(0);
  expect(button(t("ui.confirm"))).toBeUndefined();
});
