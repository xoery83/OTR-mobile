import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import {
  DirectedInviteRecipientsContent,
  type DirectedInviteCopy,
} from "./DirectedInviteRecipientsContent";
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
vi.mock("@/ui/forms", () => ({ UiChoiceChip: "Chip" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
const nodes = (v: any): any[] =>
  Array.isArray(v) ? v.flatMap(nodes) : v?.props ? [v, ...nodes(v.props.children)] : [];
function props() {
  scope.generation = 3;
  const context = { accountId: randomUUID(), tripId: randomUUID(), generation: 3 };
  return {
    context,
    recipients: {
      version: 1 as const,
      accountId: context.accountId,
      tripId: context.tripId,
      recipients: [
        { accountId: randomUUID(), displayName: "同名" },
        { accountId: randomUUID(), displayName: "同名" },
      ],
    },
    selectedAccountId: null as string | null,
    state: "READY" as const,
    copy: Object.fromEntries(
      [
        "title",
        "unnamed",
        "send",
        "check",
        "busy",
        "unknown",
        "pending",
        "unavailable",
        "empty",
      ].map((k) => [k, `catalog.${k}`]),
    ) as DirectedInviteCopy,
    onSelect: vi.fn(),
    onSend: vi.fn(),
    onCheckOriginal: vi.fn(),
  };
}
it("requires an explicit authorized Account selection, not a same-name match", () => {
  const p = props(),
    tree = nodes(DirectedInviteRecipientsContent(p));
  expect(tree.find((n) => n.props.label === p.copy.send).props.disabled).toBe(true);
  tree.filter((n) => n.type === "Chip")[1].props.onPress();
  expect(p.onSelect).toHaveBeenCalledWith(p.recipients.recipients[1].accountId);
  const chosen = nodes(
    DirectedInviteRecipientsContent({
      ...p,
      selectedAccountId: p.recipients.recipients[1].accountId,
    }),
  );
  chosen.find((n) => n.props.label === p.copy.send).props.onPress();
  expect(p.onSend).toHaveBeenCalledOnce();
});
it.each(["UNKNOWN", "BUSY", "ISSUED", "UNAVAILABLE"] as const)(
  "does not send another invite in %s",
  (state) => {
    const p = props(),
      tree = nodes(
        DirectedInviteRecipientsContent({
          ...p,
          state,
          selectedAccountId: p.recipients.recipients[0].accountId,
        }),
      );
    const button = tree.find((n) => n.props.label === p.copy.send);
    expect(button.props.disabled).toBe(true);
    button.props.onPress();
    expect(p.onSend).not.toHaveBeenCalled();
    expect(tree.filter((n) => n.type === "Chip")).toHaveLength(0);
  },
);
it("fences foreign Trip/Account and stale handlers", () => {
  const p = props(),
    tree = nodes(DirectedInviteRecipientsContent(p));
  scope.generation++;
  tree.find((n) => n.type === "Chip").props.onPress();
  expect(p.onSelect).not.toHaveBeenCalled();
  expect(DirectedInviteRecipientsContent(p)).toBeNull();
  scope.generation = 3;
  expect(
    DirectedInviteRecipientsContent({
      ...p,
      recipients: { ...p.recipients, tripId: randomUUID() },
    }),
  ).toBeNull();
});

it("rejects old selection/send/check handlers after same-generation view changes", () => {
  const p = props();
  const selected = { ...p, selectedAccountId: p.recipients.recipients[0].accountId };
  const first = nodes(DirectedInviteRecipientsContent(selected));
  const select = first.find((n) => n.type === "Chip"),
    send = first.find((n) => n.props.label === p.copy.send);
  const check = nodes(
    DirectedInviteRecipientsContent({ ...selected, state: "UNKNOWN" }),
  ).find((n) => n.props.label === p.copy.check);
  DirectedInviteRecipientsContent({
    ...selected,
    context: { ...p.context, tripId: randomUUID() },
  });
  select.props.onPress();
  send.props.onPress();
  check.props.onPress();
  expect(p.onSelect).not.toHaveBeenCalled();
  expect(p.onSend).not.toHaveBeenCalled();
  expect(p.onCheckOriginal).not.toHaveBeenCalled();
});
it("closes current handlers on unmount", () => {
  const p = props(),
    tree = nodes(
      DirectedInviteRecipientsContent({
        ...p,
        selectedAccountId: p.recipients.recipients[0].accountId,
      }),
    );
  scope.cleanup?.();
  tree.find((n) => n.props.label === p.copy.send).props.onPress();
  expect(p.onSend).not.toHaveBeenCalled();
});

it("shows a real localized empty state without offering global Account search", () => {
  const p = props(),
    tree = nodes(
      DirectedInviteRecipientsContent({
        ...p,
        recipients: { ...p.recipients, recipients: [] },
      }),
    );
  expect(tree.some((n) => n.props.children === p.copy.empty)).toBe(true);
  expect(tree.find((n) => n.props.label === p.copy.send).props.disabled).toBe(true);
});

it("an uncertain original shows only its explicit selected recipient", () => {
  const p = props(),
    original = p.recipients.recipients[1];
  const tree = nodes(
    DirectedInviteRecipientsContent({
      ...p,
      state: "UNKNOWN",
      selectedAccountId: original.accountId,
    }),
  );
  const rows = tree.filter((n) => n.type === "Text" && n.key !== null);
  expect(rows).toHaveLength(1);
  expect(rows[0].key).toBe(original.accountId);
});
