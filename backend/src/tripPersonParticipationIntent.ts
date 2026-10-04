import { createHash } from "node:crypto";
import { parseEventJson } from "./tripEventIntent";
import {
  participationCommandSchema,
  participationIntentBytes,
} from "../../src/domain/trip/personParticipationCommand";

// Typed foundation only: no route, runtime connector, credentials or dispatch.
export function participationIntentCodec(raw: string) {
  const command = participationCommandSchema.parse(parseEventJson(raw));
  const bytes = participationIntentBytes(command);
  const digest = createHash("sha256").update(bytes, "utf8").digest("hex");
  if (command.intentDigest !== digest) throw new Error("INVALID_PARTICIPATION_COMMAND");
  return { command, bytes, digest };
}
