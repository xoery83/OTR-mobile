import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { DirectedClaimContent, type DirectedClaimCopy } from "./DirectedClaimContent";
const scope = vi.hoisted(() => ({
  generation: 3,
  ref: null as { current: unknown } | null,
  cleanup: undefined as (() => void) | undefined,
}));
beforeEach(() => {
  scope.ref = null;
  scope.cleanup = undefined;
  scope.generation = 3;
});
vi.mock("react", () => ({
  useSyncExternalStore: (_s: unknown, get: () => unknown) => get(),
  useRef: (value: unknown) => (scope.ref ??= { current: value }),
  useLayoutEffect: (effect: () => () => void) => {
    scope.cleanup?.();
    scope.cleanup = effect();
  },
}));
vi.mock("react-native", () => ({
  ScrollView: "ScrollView",
  StyleSheet: { create: (x: unknown) => x },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => scope.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/ui/controls", () => ({
  UiButton: "Button",
  UiText: "Text",
  UiSection: "Section",
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
function props() {
  scope.generation = 3;
  const context = { accountId: randomUUID(), generation: 3 };
  return {
    context,
    state: "READY" as const,
    copy: Object.fromEntries(
      [
        "title",
        "confirm",
        "check",
        "busy",
        "unknown",
        "readback",
        "expired",
        "revoked",
        "unavailable",
      ].map((k) => [k, `catalog.${k}`]),
    ) as DirectedClaimCopy,
    detail: {
      version: 1 as const,
      accountId: context.accountId,
      invitation: {
        inviteId: randomUUID(),
        tripId: randomUUID(),
        personId: randomUUID(),
        tripName: "Synthetic trip",
        personName: "Synthetic person",
        status: "PENDING" as const,
        expiresAt: "2026-11-15T00:00:00Z",
      },
    },
    onConfirm: vi.fn(),
    onCheckOriginal: vi.fn(),
  };
}
const nodes = (v: any): any[] =>
  Array.isArray(v) ? v.flatMap(nodes) : v?.props ? [v, ...nodes(v.props.children)] : [];
it("confirms only a pending explicit recipient review", () => {
  const p = props();
  const button = nodes(DirectedClaimContent(p)).find(
    (n) => n.props.label === p.copy.confirm,
  );
  expect(button.props.disabled).toBe(false);
  button.props.onPress();
  expect(p.onConfirm).toHaveBeenCalledOnce();
});
it.each(["UNKNOWN", "BUSY", "AWAITING_READBACK", "UNAVAILABLE"] as const)(
  "does not resubmit in %s",
  (state) => {
    const p = props();
    const tree = nodes(DirectedClaimContent({ ...p, state }));
    const button = tree.find((n) => n.props.label === p.copy.confirm);
    expect(button.props.disabled).toBe(true);
    button.props.onPress();
    expect(p.onConfirm).not.toHaveBeenCalled();
    if (state === "UNKNOWN") {
      tree.find((n) => n.props.label === p.copy.check).props.onPress();
      expect(p.onCheckOriginal).toHaveBeenCalledOnce();
    }
  },
);
it("hides old Account/generation and fences already-rendered handlers", () => {
  const p = props();
  const button = nodes(DirectedClaimContent(p)).find(
    (n) => n.props.label === p.copy.confirm,
  );
  scope.generation++;
  button.props.onPress();
  expect(p.onConfirm).not.toHaveBeenCalled();
  expect(DirectedClaimContent(p)).toBeNull();
  scope.generation = 3;
  expect(
    DirectedClaimContent({ ...p, detail: { ...p.detail, accountId: randomUUID() } }),
  ).toBeNull();
});
it.each(["EXPIRED", "REVOKED", "CLAIMED"] as const)(
  "never grants from server invitation status %s",
  (status) => {
    const p = props();
    const tree = nodes(
      DirectedClaimContent({
        ...p,
        detail: { ...p.detail, invitation: { ...p.detail.invitation, status } },
      }),
    );
    expect(tree.find((n) => n.props.label === p.copy.confirm).props.disabled).toBe(true);
  },
);

it.each(["BUSY", "UNKNOWN"] as const)(
  "rejects previous READY handlers after committed state becomes %s",
  (state) => {
    const p = props();
    const old = nodes(DirectedClaimContent(p)).find(
      (n) => n.props.label === p.copy.confirm,
    );
    DirectedClaimContent({ ...p, state });
    old.props.onPress();
    expect(p.onConfirm).not.toHaveBeenCalled();
  },
);
it("rejects old confirmation/check handlers after invitation change or unmount", () => {
  const p = props();
  const old = nodes(DirectedClaimContent(p)).find(
    (n) => n.props.label === p.copy.confirm,
  );
  const check = nodes(DirectedClaimContent({ ...p, state: "UNKNOWN" })).find(
    (n) => n.props.label === p.copy.check,
  );
  DirectedClaimContent({
    ...p,
    detail: {
      ...p.detail,
      invitation: {
        ...p.detail.invitation,
        inviteId: randomUUID(),
        tripId: randomUUID(),
        personId: randomUUID(),
      },
    },
  });
  old.props.onPress();
  check.props.onPress();
  expect(p.onConfirm).not.toHaveBeenCalled();
  expect(p.onCheckOriginal).not.toHaveBeenCalled();
  const current = nodes(DirectedClaimContent(p)).find(
    (n) => n.props.label === p.copy.confirm,
  );
  scope.cleanup?.();
  current.props.onPress();
  expect(p.onConfirm).not.toHaveBeenCalled();
});

it("offers only original checking while member readback is unresolved, not after verified completion", () => {
  const p = props();
  let tree = nodes(DirectedClaimContent({ ...p, state: "AWAITING_READBACK" }));
  expect(tree.some((n) => n.props.label === p.copy.check)).toBe(true);
  expect(tree.find((n) => n.props.label === p.copy.confirm).props.disabled).toBe(true);
  tree = nodes(
    DirectedClaimContent({ ...p, state: "AWAITING_READBACK", readbackVerified: true }),
  );
  expect(tree.some((n) => n.props.label === p.copy.check)).toBe(false);
});
