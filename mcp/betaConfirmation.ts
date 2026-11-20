import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ApprovalRequest } from "./mutation";
const stateSchema = z.strictObject({
  accountId: z.uuid(),
  clientId: z.string().min(1),
  resource: z.url(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  operationIds: z.array(z.uuid()).min(1).max(12),
  expiresAt: z.number().int().positive(),
});
export function createBetaConfirmationCodec(key: Uint8Array = randomBytes(32)) {
  if (key.byteLength < 32) throw Error("CONFIRMATION_KEY_TOO_SHORT");
  const sign = (body: string) => createHmac("sha256", key).update(body).digest();
  return {
    mint(approval: ApprovalRequest, expiresAt: number) {
      const { summary: _summary, ...binding } = approval;
      const body = Buffer.from(
        JSON.stringify(stateSchema.parse({ ...binding, expiresAt })),
      ).toString("base64url");
      return body + "." + sign(body).toString("base64url");
    },
    verify(raw: string) {
      if (raw.length > 4096) throw Error("INVALID_CONFIRMATION_STATE");
      const [body, signature, extra] = raw.split(".");
      if (!body || !signature || extra !== undefined)
        throw Error("INVALID_CONFIRMATION_STATE");
      const expected = sign(body),
        supplied = Buffer.from(signature, "base64url");
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
        throw Error("INVALID_CONFIRMATION_STATE");
      const state = stateSchema.parse(
        JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
      );
      if (state.expiresAt <= Date.now()) throw Error("EXPIRED_CONFIRMATION_STATE");
      return state;
    },
  };
}
