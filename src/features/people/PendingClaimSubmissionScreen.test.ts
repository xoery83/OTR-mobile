import { beforeEach, expect, it, vi } from "vitest";
import { PendingClaimSubmissionScreen } from "./PendingClaimSubmissionScreen";
const run = vi.hoisted(() => ({
  generation: 3,
  state: null as any,
  cleanup: [] as (() => void)[],
  push: vi.fn(),
}));
vi.mock("react", () => ({
  useSyncExternalStore: (_s: unknown, get: () => unknown) => get(),
  useRef: (value: unknown) => ({ current: value }),
  useLayoutEffect: (f: () => () => void) => run.cleanup.push(f()),
}));
vi.mock("react-native", () => ({ ScrollView: "ScrollView" }));
vi.mock("expo-router", () => ({ router: { push: run.push } }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => run.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/ui/controls", () => ({
  UiSection: "Section",
  UiText: "Text",
  UiButton: "Button",
}));
vi.mock("@/ui/locale", () => ({ t: (k: string) => k }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));
const nodes = (n: any): any[] =>
  Array.isArray(n) ? n.flatMap(nodes) : n?.props ? [n, ...nodes(n.props.children)] : [];
function setup(phase = "READY") {
  run.state = {
    phase,
    invitation: { tripName: "Authorized Trip", personName: "授权成员" },
    preview: { requestId: "preview-request" },
    requestId: "real-request",
    operationId: null,
  };
  const c = {
    context: { accountId: "account", tripId: "trip", generation: 3 },
    getSnapshot: () => run.state,
    subscribe: () => () => {},
    submit: vi.fn(),
    checkOriginal: vi.fn(),
  };
  return {
    c,
    render: () => nodes(PendingClaimSubmissionScreen({ controller: c as never })),
  };
}
beforeEach(() => {
  run.generation = 3;
  run.cleanup = [];
  run.push.mockReset();
});
it("shows only authorized detail labels and requires explicit submission", () => {
  const s = setup();
  const tree = s.render();
  expect(s.c.submit).not.toHaveBeenCalled();
  expect(tree.some((n) => n.props.children === "授权成员")).toBe(true);
  tree.find((n) => n.props.label === "people.pendingClaim.submit").props.onPress();
  expect(s.c.submit).toHaveBeenCalledOnce();
  expect(run.push).not.toHaveBeenCalled();
});
it.each(["LOADING", "BUSY", "UNAVAILABLE", "NOT_VISIBLE"])(
  "%s cannot submit or invent a request navigation",
  (phase) => {
    const s = setup(phase);
    const tree = s.render();
    expect(tree.some((n) => n.props.label === "people.pendingClaim.submit")).toBe(false);
    expect(tree.some((n) => n.props.label === "people.pendingClaim.review")).toBe(false);
    expect(s.c.submit).not.toHaveBeenCalled();
  },
);
it("UNKNOWN only checks the original, never resubmits or navigates", () => {
  const s = setup("UNKNOWN");
  const tree = s.render();
  tree.find((n) => n.props.label === "people.claimResolution.check").props.onPress();
  expect(s.c.checkOriginal).toHaveBeenCalledOnce();
  expect(s.c.submit).not.toHaveBeenCalled();
  expect(run.push).not.toHaveBeenCalled();
  expect(tree.filter((n) => n.type === "Button")).toHaveLength(1);
});
it("RECORDED remains awaiting review and navigates the real request ID", () => {
  const s = setup("RECORDED");
  const tree = s.render();
  expect(tree.some((n) => n.props.children === "people.pendingClaim.recorded")).toBe(
    true,
  );
  tree.find((n) => n.props.label === "people.pendingClaim.review").props.onPress();
  expect(run.push).toHaveBeenCalledWith({
    pathname: "/claim-resolution",
    params: { tripId: "trip", requestId: "real-request" },
  });
  expect(s.c.submit).not.toHaveBeenCalled();
});
it.each(["generation", "snapshot", "unmount"])(
  "old callback cannot dispatch after %s",
  (change) => {
    const s = setup();
    const tree = s.render();
    if (change === "generation") run.generation++;
    else if (change === "snapshot") run.state = { ...run.state };
    else run.cleanup.forEach((f) => f());
    tree.find((n) => n.props.label === "people.pendingClaim.submit").props.onPress();
    expect(s.c.submit).not.toHaveBeenCalled();
  },
);
it("missing preview cannot submit", () => {
  const s = setup();
  run.state.preview = null;
  const button = s.render().find((n) => n.props.label === "people.pendingClaim.submit");
  expect(button.props.disabled).toBe(true);
  button.props.onPress();
  expect(s.c.submit).not.toHaveBeenCalled();
});
