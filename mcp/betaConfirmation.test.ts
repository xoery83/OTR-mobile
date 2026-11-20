import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createBetaConfirmationCodec } from "./betaConfirmation";
it("integrity-protects exact downstream approval identity and expiry without putting approval in tool arguments", () => {
  const codec = createBetaConfirmationCodec();
  const approval = {
    accountId: randomUUID(),
    clientId: "consumer",
    resource: "https://synthetic.invalid/mcp",
    digest: "a".repeat(64),
    operationIds: [randomUUID()],
    summary: "Exact preview",
  };
  const raw = codec.mint(approval, Date.now() + 60000);
  expect(codec.verify(raw)).toMatchObject({
    accountId: approval.accountId,
    digest: approval.digest,
    operationIds: approval.operationIds,
  });
  expect(() => codec.verify("x" + raw)).toThrow();
  expect(() => createBetaConfirmationCodec().verify(raw)).toThrow();
  expect(() => codec.verify(codec.mint(approval, Date.now() - 1))).toThrow(
    "EXPIRED_CONFIRMATION_STATE",
  );
  expect(() => createBetaConfirmationCodec(new Uint8Array(1))).toThrow();
});
