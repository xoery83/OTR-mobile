import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import {
  OrganizerClaimResolutionContent,
  type OrganizerClaimChoice,
  type OrganizerClaimResolutionCopy,
} from "./OrganizerClaimResolutionContent";
const lifecycle = vi.hoisted(() => ({
  generation: 3,
  ref: null as { current: unknown } | null,
  cleanup: undefined as (() => void) | undefined,
}));
beforeEach(() => {
  lifecycle.generation = 3;
  lifecycle.ref = null;
  lifecycle.cleanup = undefined;
});
vi.mock("react", () => ({
  useSyncExternalStore: (_s: unknown, get: () => unknown) => get(),
  useRef: (value: unknown) => (lifecycle.ref ??= { current: value }),
  useLayoutEffect: (effect: () => () => void) => {
    lifecycle.cleanup?.();
    lifecycle.cleanup = effect();
  },
}));
vi.mock("react-native", () => ({
  ScrollView: "ScrollView",
  View: "View",
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => lifecycle.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/ui/controls", () => ({
  UiButton: "Button",
  UiText: "Text",
  UiSection: "Section",
}));
vi.mock("@/ui/forms", () => ({ UiChoiceChip: "Chip", UiTextInput: "Input" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
const actions = ["CONFIRM", "CHOOSE_ANOTHER", "CREATE_NEW", "REJECT"] as const;
const nodes = (v: any): any[] =>
  Array.isArray(v) ? v.flatMap(nodes) : v?.props ? [v, ...nodes(v.props.children)] : [];
function props() {
  const context = { accountId: randomUUID(), tripId: randomUUID(), generation: 3 };
  return {
    context,
    review: {
      context,
      claimRequestId: randomUUID(),
      claimantName: "Synthetic claimant",
      claimedPerson: { personId: randomUUID(), displayName: "Original person" },
      people: [
        { personId: randomUUID(), displayName: "同名" },
        { personId: randomUUID(), displayName: "同名" },
      ],
    },
    state: "READY" as "READY" | "BUSY" | "UNKNOWN" | "OFFLINE" | "UNAVAILABLE",
    eligibleActions: actions as readonly OrganizerClaimChoice[],
    choice: null as OrganizerClaimChoice | null,
    selectedPersonId: null as string | null,
    newPersonName: "",
    copy: {
      title: "catalog.title",
      choices: Object.fromEntries(actions.map((a) => [a, `catalog.${a}`])),
      newPersonName: "catalog.name",
      emptyPeople: "catalog.emptyPeople",
      submit: "catalog.submit",
      confirmReject: "catalog.confirmReject",
      rejectHint: "catalog.rejectHint",
      checkOriginal: "catalog.check",
      busy: "catalog.busy",
      unknown: "catalog.unknown",
      offline: "catalog.offline",
      unavailable: "catalog.unavailable",
    } as OrganizerClaimResolutionCopy,
    onChoose: vi.fn(),
    onSelectPerson: vi.fn(),
    onChangeName: vi.fn(),
    onSubmit: vi.fn(),
    onCheckOriginal: vi.fn(),
  };
}
const button = (tree: any[], label: string) => tree.find((n) => n.props.label === label)!;
it("requires an explicit organizer choice before confirmation and never resolves on render", () => {
  const p = props();
  const tree = nodes(OrganizerClaimResolutionContent(p));
  expect(tree.find((n) => n.type === "ScrollView").props.keyboardShouldPersistTaps).toBe(
    "handled",
  );
  expect(button(tree, p.copy.submit).props.disabled).toBe(true);
  button(tree, p.copy.choices.CONFIRM).props.onPress();
  expect(p.onChoose).toHaveBeenCalledWith("CONFIRM");
  expect(p.onSubmit).not.toHaveBeenCalled();
  const chosen = nodes(OrganizerClaimResolutionContent({ ...p, choice: "CONFIRM" }));
  button(chosen, p.copy.submit).props.onPress();
  expect(p.onSubmit).toHaveBeenCalledOnce();
});
it("Choose another selects by stable Person ID, never by equal name or the original claim", () => {
  const p = props();
  p.choice = "CHOOSE_ANOTHER";
  p.review.people.push(p.review.claimedPerson);
  const tree = nodes(OrganizerClaimResolutionContent(p));
  expect(tree.some((n) => n.props.label === p.review.claimedPerson.displayName)).toBe(
    false,
  );
  const candidates = tree.filter((n) => n.type === "Chip" && n.props.label === "同名");
  candidates[1].props.onPress();
  expect(p.onSelectPerson).toHaveBeenCalledWith(p.review.people[1].personId);
  expect(button(tree, p.copy.submit).props.disabled).toBe(true);
  const selected = nodes(
    OrganizerClaimResolutionContent({
      ...p,
      selectedPersonId: p.review.people[1].personId,
    }),
  );
  button(selected, p.copy.submit).props.onPress();
  expect(p.onSubmit).toHaveBeenCalledOnce();
  const stale = nodes(
    OrganizerClaimResolutionContent({ ...p, selectedPersonId: randomUUID() }),
  );
  expect(button(stale, p.copy.submit).props.disabled).toBe(true);
});
it("Create new only edits the caller draft until explicit confirmation and rejects blank names", () => {
  const p = props();
  p.choice = "CREATE_NEW";
  p.newPersonName = "   ";
  const tree = nodes(OrganizerClaimResolutionContent(p));
  expect(button(tree, p.copy.submit).props.disabled).toBe(true);
  tree.find((n) => n.type === "Input").props.onChangeText("新旅行成员");
  expect(p.onChangeName).toHaveBeenCalledWith("新旅行成员");
  expect(p.onSubmit).not.toHaveBeenCalled();
  const named = nodes(
    OrganizerClaimResolutionContent({ ...p, newPersonName: "新旅行成员" }),
  );
  button(named, p.copy.submit).props.onPress();
  expect(p.onSubmit).toHaveBeenCalledOnce();
});
it("Reject remains a selection followed by a separate destructive confirmation", () => {
  const p = props();
  const tree = nodes(OrganizerClaimResolutionContent(p));
  button(tree, p.copy.choices.REJECT).props.onPress();
  expect(p.onChoose).toHaveBeenCalledWith("REJECT");
  expect(p.onSubmit).not.toHaveBeenCalled();
  const selected = nodes(OrganizerClaimResolutionContent({ ...p, choice: "REJECT" }));
  const confirm = button(selected, p.copy.confirmReject);
  expect(confirm.props.variant).toBe("destructive");
  confirm.props.onPress();
  expect(p.onSubmit).toHaveBeenCalledOnce();
});
it.each(["BUSY", "UNKNOWN", "OFFLINE", "UNAVAILABLE"] as const)(
  "does not mutate or resubmit in %s",
  (state) => {
    const p = props();
    p.choice = "CONFIRM";
    p.state = state;
    const tree = nodes(OrganizerClaimResolutionContent(p));
    for (const n of tree.filter((n) => n.type === "Chip")) {
      expect(n.props.disabled).toBe(true);
      n.props.onPress();
    }
    button(tree, p.copy.submit).props.onPress();
    expect(p.onChoose).not.toHaveBeenCalled();
    expect(p.onSubmit).not.toHaveBeenCalled();
    if (state === "UNKNOWN") {
      button(tree, p.copy.checkOriginal).props.onPress();
      expect(p.onCheckOriginal).toHaveBeenCalledOnce();
    }
  },
);
it("fails closed without Reader qualification and respects per-action eligibility", () => {
  const p = props();
  p.choice = "CONFIRM";
  const tree = nodes(
    OrganizerClaimResolutionContent({ ...p, eligibleActions: undefined }),
  );
  expect(button(tree, p.copy.submit).props.disabled).toBe(true);
  button(tree, p.copy.submit).props.onPress();
  expect(p.onSubmit).not.toHaveBeenCalled();
  const rejectOnly = nodes(
    OrganizerClaimResolutionContent({ ...p, eligibleActions: ["REJECT"] }),
  );
  expect(button(rejectOnly, p.copy.choices.CONFIRM).props.disabled).toBe(true);
});
it("hides foreign Account/Trip Reader state and fences old handlers after generation changes", () => {
  const p = props();
  p.choice = "CONFIRM";
  const old = button(nodes(OrganizerClaimResolutionContent(p)), p.copy.submit);
  lifecycle.generation++;
  old.props.onPress();
  expect(p.onSubmit).not.toHaveBeenCalled();
  expect(OrganizerClaimResolutionContent(p)).toBeNull();
  lifecycle.generation = 3;
  for (const key of ["accountId", "tripId"] as const)
    expect(
      OrganizerClaimResolutionContent({
        ...p,
        review: { ...p.review, context: { ...p.context, [key]: randomUUID() } },
      }),
    ).toBeNull();
});
it("old claim handlers cannot submit after another claim renders or after unmount", () => {
  const p = props();
  p.choice = "CONFIRM";
  const old = button(nodes(OrganizerClaimResolutionContent(p)), p.copy.submit);
  OrganizerClaimResolutionContent({
    ...p,
    review: { ...p.review, claimRequestId: randomUUID() },
  });
  old.props.onPress();
  expect(p.onSubmit).not.toHaveBeenCalled();
  const current = button(nodes(OrganizerClaimResolutionContent(p)), p.copy.submit);
  lifecycle.cleanup?.();
  current.props.onPress();
  expect(p.onSubmit).not.toHaveBeenCalled();
});

it("empty alternatives explain the unavailable selection without creating a Person", () => {
  const p = props();
  p.choice = "CHOOSE_ANOTHER";
  p.review.people = [];
  const tree = nodes(OrganizerClaimResolutionContent(p));
  expect(tree.some((n) => n.props.children === p.copy.emptyPeople)).toBe(true);
  expect(button(tree, p.copy.submit).props.disabled).toBe(true);
  expect(p.onSelectPerson).not.toHaveBeenCalled();
  expect(p.onSubmit).not.toHaveBeenCalled();
});
it("Confirm is disabled when the owning Reader has no claimed Person", () => {
  const p = props();
  p.choice = "CONFIRM";
  const tree = nodes(
    OrganizerClaimResolutionContent({
      ...p,
      review: { ...p.review, claimedPerson: null },
    }),
  );
  expect(button(tree, p.copy.submit).props.disabled).toBe(true);
  button(tree, p.copy.submit).props.onPress();
  expect(p.onSubmit).not.toHaveBeenCalled();
});
