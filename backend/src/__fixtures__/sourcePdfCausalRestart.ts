// Disposable owned fixture process only; no server route or real credential loading.
import { readFile } from "node:fs/promises";
import {
  createSourcePdfCausalAuthority,
  type PdfCausalOwner,
} from "../sourcePdfCausalAuthority";
import {
  createSourcePdfBackendPreparation,
  type PdfReservedContext,
} from "../sourcePdfBackendPreparation";
import {
  createSourcePdfStorageProducer,
  type PdfStorageConfig,
} from "../sourcePdfStorageProducer";
import { createSourcePdfPrivateStage } from "../sourcePdfPrivateStage";
import type { CorePgConnection } from "../tripCoreV2PgStorage";
import type { DevBackendGateway } from "../app";
import { session } from "./tripCoreV2Sql";
const input = JSON.parse(await readFile(process.argv[2], "utf8")) as {
  fixture: string;
  root: string;
  owner: Omit<PdfCausalOwner, "accountGeneration">;
  context: PdfReservedContext;
  config: PdfStorageConfig;
  raw: string;
  hasAck: boolean;
};
const connection: CorePgConnection = {
  async withLease(work) {
    const s = session(input.fixture);
    try {
      await s.lease.query("SET SESSION AUTHORIZATION otr_trip_source_command_gateway");
      return await work(s.lease);
    } finally {
      s.close();
    }
  },
};
const authority = createSourcePdfCausalAuthority(connection, {
  ...input.owner,
  accountGeneration: async () => 1,
});
const current = await authority.claim(input.context);
const stage = createSourcePdfPrivateStage(input.root);
await stage.reopen(current.binding);
const provider = createSourcePdfStorageProducer(input.config);
const gateway = {
  validateAccessToken: async () => ({ id: current.binding.actorAccountId }),
  canReadTrip: async () => true,
} as unknown as DevBackendGateway;
const adapter = createSourcePdfBackendPreparation(gateway, authority, stage, provider);
const identity = {
  tripId: current.binding.tripId,
  sourceId: current.binding.sourceId,
  representationId: current.binding.representationId,
  operationId: current.binding.operationId,
  accountGeneration: 1,
};
const request = () =>
  new Request("http://127.0.0.1/internal-unregistered", {
    headers: { Authorization: "Bearer synthetic-only" },
  });
let writeDenied = false;
try {
  await adapter.upload(request(), identity);
} catch (error) {
  if (!(error instanceof Error) || error.message !== "PDF_DUPLICATE_DISPATCH")
    throw error;
  writeDenied = true;
}
let read: string,
  receipt: unknown = null;
if (input.hasAck) {
  read = (await adapter.observeRetained(request(), identity)).kind;
  receipt = await authority.finish(current, input.raw);
} else {
  try {
    await adapter.observeRetained(request(), identity);
    throw new Error("MISSING_ACK_READ_GRANTED");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("PDF_CAUSAL_ACK_REQUIRED"))
      throw error;
    read = "ACK_REQUIRED";
  }
}
process.stdout.write(
  JSON.stringify({
    pid: process.pid,
    ownerFence: current.ownerFence,
    writeDenied,
    read,
    receipt,
  }) + "\n",
);
