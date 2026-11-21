import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { OrganizerClaimResolutionScreen } from "./OrganizerClaimResolutionScreen";
import { OrganizerClaimResolutionContent } from "./OrganizerClaimResolutionContent";
const store = vi.hoisted(() => ({ generation: 3, current: null as any }));
vi.mock("react", () => ({
  useSyncExternalStore: (_s: unknown, get: () => unknown) => get(),
}));
vi.mock("react-native", () => ({ ScrollView: "ScrollView" }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => store.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/ui/controls", () => ({
  UiButton: "Button",
  UiText: "Text",
  UiSection: "Section",
}));
vi.mock("@/ui/forms", () => ({ UiFormRow: "Row" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
const nodes = (v: any): any[] =>
  Array.isArray(v) ? v.flatMap(nodes) : v?.props ? [v, ...nodes(v.props.children)] : [];
function controller() {
  const context = { accountId: randomUUID(), tripId: randomUUID(), generation: 3 };
  const personId = randomUUID();
  store.current = {
    phase: "READY",
    view: {
      accountId: context.accountId,
      tripId: context.tripId,
      requestId: randomUUID(),
      canConsent: false,
      snapshot: {
        originalPersonId: personId,
        state: "PENDING_REVIEW",
        proposal: { kind: "EXISTING_PERSON", personId },
      },
    },
    people: [{ personId, displayName: "Traveler" }],
    eligibleActions: ["CONFIRM"],
    choice: "CONFIRM",
    selectedPersonId: null,
    newPersonName: "",
    operationId: null,
  };
  return {
    context,
    getSnapshot: () => store.current,
    subscribe: () => () => {},
    choose: vi.fn(),
    selectPerson: vi.fn(),
    changeName: vi.fn(),
    submit: vi.fn(),
    checkOriginal: vi.fn(),
    consent: vi.fn(),
    load: vi.fn(),
    dispose: vi.fn(),
  };
}
beforeEach(() => {
  store.generation = 3;
});
it("maps frozen Auth controlled fields/methods without a second state container or operation", () => {
  const c = controller();
  const tree = nodes(OrganizerClaimResolutionScreen({ controller: c as never }));
  const content = tree.find((n) => n.type === OrganizerClaimResolutionContent)!.props;
  expect(content.review.claimRequestId).toBe(store.current.view.requestId);
  expect(content.review.claimedPerson.personId).toBe(
    store.current.view.snapshot.originalPersonId,
  );
  expect(content.review.claimantName).toBe("people.claimResolution.requestingAccount");
  content.onChoose("REJECT");
  content.onSelectPerson("explicit-id");
  content.onChangeName("Draft");
  content.onSubmit();
  expect(c.choose).toHaveBeenCalledWith("REJECT");
  expect(c.submit).toHaveBeenCalledOnce();
  expect(c.load).not.toHaveBeenCalled();
  expect(c.dispose).not.toHaveBeenCalled();
});
it.each([
  ["LOADING", "BUSY"],
  ["NOT_VISIBLE", "UNAVAILABLE"],
  ["UNKNOWN", "UNKNOWN"],
])("maps %s to %s", (phase, expected) => {
  const c = controller();
  store.current.phase = phase;
  const content = nodes(OrganizerClaimResolutionScreen({ controller: c as never })).find(
    (n) => n.type === OrganizerClaimResolutionContent,
  )!.props;
  expect(content.state).toBe(expected);
});
it("a null formal view stays unavailable/loading instead of creating a request context", () => {
  const c = controller();
  store.current.view = null;
  const tree = nodes(OrganizerClaimResolutionScreen({ controller: c as never }));
  expect(tree.some((n) => n.type === OrganizerClaimResolutionContent)).toBe(false);
  expect(c.submit).not.toHaveBeenCalled();
});
it("fences stale proposal submissions and Account generation changes", () => {
  const c = controller();
  const content = nodes(OrganizerClaimResolutionScreen({ controller: c as never })).find(
    (n) => n.type === OrganizerClaimResolutionContent,
  )!.props;
  store.current = { ...store.current, phase: "BUSY" };
  content.onSubmit();
  expect(c.submit).not.toHaveBeenCalled();
  store.generation++;
  expect(OrganizerClaimResolutionScreen({ controller: c as never })).toBeNull();
});
it("claimant consent is separate, explicit and only uses the formal proposed name", () => {
  const c = controller();
  store.current.view.canConsent = true;
  store.current.view.snapshot.proposal = {
    kind: "NEW_PERSON",
    create: { displayName: "Proposed traveler" },
  };
  const tree = nodes(OrganizerClaimResolutionScreen({ controller: c as never }));
  const button = tree.find((n) => n.props.label === "people.claimResolution.consent");
  expect(c.consent).not.toHaveBeenCalled();
  expect(button.props.disabled).toBe(false);
  button.props.onPress();
  expect(c.consent).toHaveBeenCalledOnce();
  expect(c.submit).not.toHaveBeenCalled();
});
it("an existing-person proposal without an authorized label cannot borrow a full Member reader for consent", () => {
  const c = controller();
  store.current.view.canConsent = true;
  store.current.people = [];
  const tree = nodes(OrganizerClaimResolutionScreen({ controller: c as never }));
  const button = tree.find((n) => n.props.label === "people.claimResolution.consent");
  expect(button.props.disabled).toBe(true);
  button.props.onPress();
  expect(c.consent).not.toHaveBeenCalled();
});
it("consent UNKNOWN can only recover the original operation", () => {
  const c = controller();
  store.current.phase = "UNKNOWN";
  store.current.view.canConsent = true;
  store.current.view.snapshot.proposal = {
    kind: "NEW_PERSON",
    create: { displayName: "Proposed" },
  };
  const tree = nodes(OrganizerClaimResolutionScreen({ controller: c as never }));
  const consent = tree.find((n) => n.props.label === "people.claimResolution.consent");
  expect(consent.props.disabled).toBe(true);
  consent.props.onPress();
  expect(c.consent).not.toHaveBeenCalled();
  tree.find((n) => n.props.label === "people.claimResolution.check").props.onPress();
  expect(c.checkOriginal).toHaveBeenCalledOnce();
});

it("cold UNKNOWN with an original Operation can recover even when the formal view is unavailable", () => {
  const c = controller();
  store.current.view = null;
  store.current.phase = "UNKNOWN";
  store.current.operationId = randomUUID();
  const tree = nodes(OrganizerClaimResolutionScreen({ controller: c as never }));
  expect(tree.some((n) => n.type === OrganizerClaimResolutionContent)).toBe(false);
  tree.find((n) => n.props.label === "people.claimResolution.check").props.onPress();
  expect(c.checkOriginal).toHaveBeenCalledOnce();
  expect(c.submit).not.toHaveBeenCalled();
});

it.each([false, true])(
  "known receipt waiting for member proof does not show UNKNOWN or resolution actions (view=%s)",
  (hasView) => {
    const c = controller();
    store.current.phase = "UNAVAILABLE";
    store.current.needsMemberReadback = true;
    if (!hasView) store.current.view = null;
    const tree = nodes(OrganizerClaimResolutionScreen({ controller: c as never }));
    expect(tree.some((n) => n.type === OrganizerClaimResolutionContent)).toBe(false);
    expect(
      tree.some(
        (n) => n.props.children === "people.claimResolution.memberReadbackPending",
      ),
    ).toBe(true);
    const check = tree.find((n) => n.props.label === "people.claimResolution.check");
    check.props.onPress();
    expect(c.checkOriginal).toHaveBeenCalledOnce();
    expect(c.submit).not.toHaveBeenCalled();
    expect(c.consent).not.toHaveBeenCalled();
    store.generation++;
    check.props.onPress();
    expect(c.checkOriginal).toHaveBeenCalledOnce();
  },
);
it("member readback recovery cannot be dispatched while busy", () => {
  const c = controller();
  store.current.needsMemberReadback = true;
  store.current.phase = "BUSY";
  const check = nodes(OrganizerClaimResolutionScreen({ controller: c as never })).find(
    (n) => n.props.label === "people.claimResolution.check",
  );
  expect(check.props.disabled).toBe(true);
  check.props.onPress();
  expect(c.checkOriginal).not.toHaveBeenCalled();
});

it("existing-person consent uses only the authorized preview matching the proposal Person ID", () => {
  const c = controller();
  store.current.view.canConsent = true;
  const personId = store.current.view.snapshot.proposal.personId;
  store.current.view.proposalPreview = { personId, displayName: "Authorized name" };
  const tree = nodes(OrganizerClaimResolutionScreen({ controller: c as never }));
  expect(tree.some((n) => n.props.children === "Authorized name")).toBe(true);
  const button = tree.find((n) => n.props.label === "people.claimResolution.consent");
  expect(button.props.disabled).toBe(false);
  button.props.onPress();
  expect(c.consent).toHaveBeenCalledOnce();
  store.current = {
    ...store.current,
    view: {
      ...store.current.view,
      proposalPreview: { personId: "different", displayName: "Other name" },
    },
  };
  const mismatch = nodes(OrganizerClaimResolutionScreen({ controller: c as never })).find(
    (n) => n.props.label === "people.claimResolution.consent",
  );
  expect(mismatch.props.disabled).toBe(true);
  mismatch.props.onPress();
  expect(c.consent).toHaveBeenCalledOnce();
});
