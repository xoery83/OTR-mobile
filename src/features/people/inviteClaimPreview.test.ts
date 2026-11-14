import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import {
  createInviteClaimPreview,
  type ClaimPreviewInvitation,
  type ClaimPreviewCommand,
} from "./inviteClaimPreview";
import { InviteClaimPreviewScreen } from "./InviteClaimPreviewScreen";
const current = vi.hoisted(() => ({ generation: 3 }));
vi.mock("@/data/auth/accountRequestContext", () => ({
  assertAccountRequestGeneration: (scope: { generation: number }) => {
    if (scope.generation !== current.generation) throw Error("ACCOUNT_CHANGED");
  },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => current.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/domain/localId", async () => ({
  createUuid: (await import("node:crypto")).randomUUID,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
}));
vi.mock("react-native", () => ({
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("@/ui/controls", () => ({
  UiButton: "Button",
  UiSection: "Section",
  UiText: "Text",
}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("./AddTravelerSheet", () => ({ AddTravelerSheet: "AddTraveler" }));
beforeEach(() => {
  current.generation = 3;
});
const invitation = (): ClaimPreviewInvitation => {
  const personId = randomUUID();
  return {
    evidence: "SYNTHETIC",
    context: {
      accountId: randomUUID(),
      tripId: randomUUID(),
      generation: current.generation,
    },
    invitationId: randomUUID(),
    status: "PENDING",
    suggestedPersonId: personId,
    people: [
      { personId, displayName: "同名 traveler" },
      { personId: randomUUID(), displayName: "同名 traveler" },
    ],
  };
};
const respond = vi.fn(async (command: ClaimPreviewCommand) => ({
  ...command,
  outcome: "SIMULATED" as const,
}));
const nodes = (value: any): any[] =>
  Array.isArray(value)
    ? value.flatMap(nodes)
    : value?.props
      ? [value, ...nodes(value.props.children)]
      : [];
it("confirms only an explicit Person ID and labels the result as synthetic", async () => {
  const value = invitation();
  const preview = createInviteClaimPreview(value, respond);
  await preview.submit("CONFIRM");
  expect(respond.mock.lastCall?.[0].personId).toBe(value.suggestedPersonId);
  expect(preview.getSnapshot().outcome).toBe("SIMULATED");
  const tree = nodes(InviteClaimPreviewScreen({ preview }));
  expect(tree.some((node) => node.props.children === "claimPreview.synthetic")).toBe(
    true,
  );
  expect(
    tree.some((node) => node.props.children === "claimPreview.status.SIMULATED"),
  ).toBe(true);
  expect(
    tree.filter((node) => node.type === "Button").every((node) => node.props.disabled),
  ).toBe(true);
});
it("choose another preserves same-name identities and blocks foreign Person IDs", () => {
  const value = invitation();
  const preview = createInviteClaimPreview(value, respond);
  preview.chooseAnother();
  preview.selectPerson(randomUUID());
  expect(preview.getSnapshot().stage).toBe("CHOOSE_ANOTHER");
  preview.selectPerson(value.people[1].personId);
  expect(preview.getSnapshot().selectedPersonId).toBe(value.people[1].personId);
  expect(preview.getSnapshot().stage).toBe("REVIEW");
});
it("Create New delegates the existing AddTravelerSheet and does not create a connection", async () => {
  const preview = createInviteClaimPreview(invitation(), respond);
  preview.createNew();
  const sheet = nodes(InviteClaimPreviewScreen({ preview })).find(
    (node) => node.type === "AddTraveler",
  );
  expect(sheet.props.visible).toBe(true);
  const personId = randomUUID();
  await sheet.props.onSave({
    operationId: randomUUID(),
    personId,
    displayName: "合成新人",
  });
  expect(preview.getSnapshot().selectedPersonId).toBe(personId);
  expect(preview.getSnapshot().outcome).toBe("IDLE");
});
it("Reject never supplies a Person connection and ignores terminal duplicate submits", async () => {
  const reply = vi.fn(async (command: ClaimPreviewCommand) => ({
    ...command,
    outcome: "SIMULATED" as const,
  }));
  const preview = createInviteClaimPreview(invitation(), reply);
  await preview.submit("REJECT");
  await preview.submit("REJECT");
  expect(reply).toHaveBeenCalledTimes(1);
  expect(reply.mock.calls[0][0].personId).toBeNull();
});
it("retains one operation for UNKNOWN, blocks concurrent/changed actions and retries explicitly", async () => {
  let finish!: (value: unknown) => void;
  const reply = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementation(async (command) => ({ ...command, outcome: "SIMULATED" }));
  const preview = createInviteClaimPreview(invitation(), reply);
  const first = preview.submit("CONFIRM");
  await preview.submit("CONFIRM");
  finish({ ...reply.mock.calls[0][0], outcome: "UNKNOWN" });
  await first;
  preview.chooseAnother();
  expect(preview.getSnapshot().stage).toBe("REVIEW");
  await preview.submit("REJECT");
  expect(reply).toHaveBeenCalledTimes(1);
  await preview.submit("CONFIRM");
  expect(reply.mock.calls[1][0]).toEqual(reply.mock.calls[0][0]);
});
it.each(["EXPIRED", "REVOKED"] as const)(
  "does not submit a %s fixture or infer expiry from the device clock",
  async (status) => {
    const reply = vi.fn();
    const preview = createInviteClaimPreview({ ...invitation(), status }, reply);
    await preview.submit("CONFIRM");
    expect(reply).not.toHaveBeenCalled();
    expect(preview.getSnapshot().outcome).toBe(status);
  },
);
it("isolates both Accounts, rejects a mismatched response and masks stale views", async () => {
  const a = invitation();
  const foreign = { ...a.context, accountId: randomUUID() };
  const preview = createInviteClaimPreview(a, async (command) => ({
    ...command,
    context: foreign,
    outcome: "SIMULATED",
  }));
  await preview.submit("CONFIRM");
  expect(preview.getSnapshot().outcome).toBe("UNKNOWN");
  current.generation++;
  expect(InviteClaimPreviewScreen({ preview })).toBeNull();
  const b = createInviteClaimPreview(invitation(), respond);
  expect(b.getSnapshot().outcome).toBe("IDLE");
  expect(b.getSnapshot().invitation.context.accountId).not.toBe(a.context.accountId);
});
it("ignores late responses after Account change or close", async () => {
  let finish!: (value: unknown) => void;
  const reply = vi.fn(
    (command: ClaimPreviewCommand) =>
      new Promise<any>((resolve) => {
        finish = resolve;
      }),
  );
  const preview = createInviteClaimPreview(invitation(), reply);
  const pending = preview.submit("CONFIRM");
  preview.dispose();
  current.generation++;
  finish({ ...reply.mock.calls[0][0], outcome: "SIMULATED" });
  await pending;
  expect(preview.getSnapshot().outcome).toBe("PENDING");
});
it("rejects non-synthetic fixtures and invalid identity structures", () => {
  expect(() =>
    createInviteClaimPreview({ ...invitation(), evidence: "REAL" } as never, respond),
  ).toThrow();
  const value = invitation();
  expect(() =>
    createInviteClaimPreview({ ...value, suggestedPersonId: randomUUID() }, respond),
  ).toThrow();
});

it("responder mutation cannot change the pinned attempt or the exposed context", async () => {
  const reply = vi.fn(async (command: ClaimPreviewCommand) => {
    command.personId = randomUUID();
    command.action = "REJECT";
    command.operationId = randomUUID();
    command.context.accountId = randomUUID();
    return { ...command, outcome: "SIMULATED" as const };
  });
  const value = invitation();
  const preview = createInviteClaimPreview(value, reply);
  expect(() => {
    preview.getSnapshot().invitation.context.accountId = randomUUID();
  }).toThrow();
  await preview.submit("CONFIRM");
  expect(preview.getSnapshot().outcome).toBe("UNKNOWN");
  reply.mockImplementationOnce(async (command) => {
    expect(command.action).toBe("CONFIRM");
    expect(command.personId).toBe(value.suggestedPersonId);
    expect(command.context.accountId).toBe(value.context.accountId);
    expect(command.operationId).not.toBe(reply.mock.calls[0][0].operationId);
    return { ...command, outcome: "SIMULATED" };
  });
  await preview.submit("CONFIRM");
  expect(preview.getSnapshot().outcome).toBe("SIMULATED");
});
