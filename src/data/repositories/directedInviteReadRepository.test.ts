import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { createDirectedInviteReadRepository } from "./directedInviteReadRepository";

async function fixture() {
  let id = randomUUID();
  const account = async () => id;
  const context = await captureAccountRequestContext(randomUUID(), account);
  const inviteId = randomUUID();
  const invitation = {
    version: 1 as const,
    accountId: id,
    invitation: {
      inviteId,
      tripId: context.tripId,
      personId: randomUUID(),
      tripName: "Synthetic trip",
      personName: "同名",
      status: "PENDING" as const,
      expiresAt: "2026-11-15T00:00:00Z",
    },
  };
  const recipients = {
    version: 1 as const,
    accountId: id,
    tripId: context.tripId,
    recipients: [
      { accountId: randomUUID(), displayName: "同名" },
      { accountId: randomUUID(), displayName: "同名" },
    ],
  };
  const wire = vi.fn<typeof fetch>(async () => Response.json(invitation));
  const repo = createDirectedInviteReadRepository(
    account,
    { baseUrl: "https://api.example.test", fetchImplementation: wire },
    async () => ({ userId: id, token: "unit-synthetic-token" }),
  );
  return {
    context,
    invitation,
    recipients,
    inviteId,
    wire,
    repo,
    switch() {
      id = randomUUID();
      advanceAccountGeneration();
    },
  };
}

it("reads only a specific own invitation with normal Auth; pending never becomes membership", async () => {
  const f = await fixture();
  expect(await f.repo.invitation(f.context, f.inviteId)).toEqual(f.invitation);
  expect(f.wire).toHaveBeenCalledExactlyOnceWith(
    `https://api.example.test/v1/account/directed-invitations/${f.inviteId}`,
    expect.objectContaining({
      method: "GET",
      redirect: "error",
      body: undefined,
      headers: expect.objectContaining({ Authorization: "Bearer unit-synthetic-token" }),
    }),
  );
});

it("same-name recipients remain separate explicit Account IDs", async () => {
  const f = await fixture();
  f.wire.mockResolvedValueOnce(Response.json(f.recipients));
  const result = await f.repo.recipients(f.context);
  expect(result.recipients).toHaveLength(2);
  const headers = new Headers(f.wire.mock.calls[0][1]?.headers);
  expect(
    [...headers.keys()].every((key) =>
      ["authorization", "content-type", "accept"].includes(key),
    ),
  ).toBe(true);
  expect(result.recipients[0].accountId).not.toBe(result.recipients[1].accountId);
});

it.each(["account", "invitation"] as const)(
  "rejects foreign %s invitation response",
  async (field) => {
    const f = await fixture();
    f.wire.mockResolvedValueOnce(
      Response.json({
        ...f.invitation,
        ...(field === "account"
          ? { accountId: randomUUID() }
          : { invitation: { ...f.invitation.invitation, inviteId: randomUUID() } }),
      }),
    );
    await expect(f.repo.invitation(f.context, f.inviteId)).rejects.toThrow(
      "SCOPE_MISMATCH",
    );
  },
);

it.each(["before", "response"] as const)(
  "isolates account switch at %s",
  async (stage) => {
    const f = await fixture();
    if (stage === "before") f.switch();
    else
      f.wire.mockImplementationOnce(async () => {
        f.switch();
        return Response.json(f.invitation);
      });
    await expect(f.repo.invitation(f.context, f.inviteId)).rejects.toThrow();
    expect(f.wire).toHaveBeenCalledTimes(stage === "before" ? 0 : 1);
  },
);

it("rejects private profile fields and duplicate recipient IDs", async () => {
  const f = await fixture();
  f.wire.mockResolvedValueOnce(
    Response.json({
      ...f.invitation,
      invitation: { ...f.invitation.invitation, email: "synthetic@example.test" },
    }),
  );
  await expect(f.repo.invitation(f.context, f.inviteId)).rejects.toMatchObject({
    kind: "validation",
  });
  f.wire.mockResolvedValueOnce(
    Response.json({
      ...f.recipients,
      recipients: [f.recipients.recipients[0], f.recipients.recipients[0]],
    }),
  );
  await expect(f.repo.recipients(f.context)).rejects.toMatchObject({
    kind: "validation",
  });
});

it("closed readers propagate errors without fabricated empty lists or commands", async () => {
  const f = await fixture();
  f.wire.mockResolvedValueOnce(
    Response.json({ error: { code: "BACKEND_UNAVAILABLE" } }, { status: 503 }),
  );
  await expect(f.repo.recipients(f.context)).rejects.toMatchObject({ status: 503 });
  expect(f.wire).toHaveBeenCalledOnce();
});

it.each(["😀", "\u0001"])(
  "accepts the full legal Unicode response within its bounded transport (%s)",
  async (character) => {
    const f = await fixture();
    const payload = {
      ...f.recipients,
      recipients: Array.from({ length: 100 }, () => ({
        accountId: randomUUID(),
        displayName: character.repeat(256),
      })),
    };
    f.wire.mockResolvedValueOnce(Response.json(payload));
    expect((await f.repo.recipients(f.context)).recipients).toEqual(payload.recipients);
  },
);

it("incoming uses current Account Auth and keeps references distinct from acceptance", async () => {
  const f = await fixture();
  const response = {
    version: 1,
    accountId: f.context.accountId,
    invitations: [{ tripId: f.context.tripId, inviteId: f.inviteId }],
  };
  f.wire.mockResolvedValueOnce(Response.json(response));
  expect(await f.repo.incoming(f.context)).toEqual(response);
  expect(f.wire.mock.calls[0][0]).toBe(
    "https://api.example.test/v1/account/directed-invitations",
  );
});
it.each(["foreign", "switch", "duplicate", "private", "overflow"] as const)(
  "incoming rejects %s responses",
  async (kind) => {
    const f = await fixture(),
      reference = { tripId: f.context.tripId, inviteId: f.inviteId };
    f.wire.mockImplementationOnce(async () => {
      if (kind === "switch") f.switch();
      return Response.json({
        version: 1,
        accountId: kind === "foreign" ? randomUUID() : f.context.accountId,
        invitations:
          kind === "overflow"
            ? Array.from({ length: 101 }, () => ({
                ...reference,
                inviteId: randomUUID(),
              }))
            : kind === "duplicate"
              ? [reference, reference]
              : [reference],
        ...(kind === "private" ? { email: "private@example.test" } : {}),
      });
    });
    await expect(f.repo.incoming(f.context)).rejects.toThrow();
  },
);
