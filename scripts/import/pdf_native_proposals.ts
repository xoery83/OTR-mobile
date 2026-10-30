// Local SQL interoperability helper. No network or durable state.
import { createHash } from "node:crypto";
import {
  createPendingPdfCommandProposals,
  createPdfDerivativeRequests,
} from "../../src/domain/trip/sourcePdfPreparationCommands";
let text = "";
for await (const part of process.stdin) text += part;
const input = JSON.parse(text),
  hash = async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const value = input.proposals
  ? await createPdfDerivativeRequests(input.proposals, input.verification, hash)
  : await createPendingPdfCommandProposals(
      input.scope,
      input.acquisition,
      input.receipt,
      hash,
    );
process.stdout.write(JSON.stringify(value));
