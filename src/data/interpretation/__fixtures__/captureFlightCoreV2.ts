import { randomUUID } from "node:crypto";
import { admittedFlightBatch, bindFlightBatch } from "./flightInterpretation";
import { interpretFlightBatch } from "../flightInterpretation";
import { captureAccountRequestContext } from "../../auth/accountRequestContext";
import { buildCaptureFlightPublicationV2 } from "../captureFlightCoreV2";
import { publicationTestHash as hash } from "../../../../backend/src/__fixtures__/tripCoreV2CandidatePublication";
export async function captureFlightFixture(
  text = "NZ1 AKL→CHC 2026-12-17 depInstant=2026-12-16T20:00:00.120000Z\nNZ2 CHC→AKL 2026-12-20 depInstant=2026-12-19T20:00:00.120000Z",
) {
  const batch = await admittedFlightBatch([text]);
  const sourceId = randomUUID(),
    representationId = randomUUID();
  Object.assign(batch.catalog.trip_sources[0], { id: sourceId });
  Object.assign(batch.catalog.trip_source_revisions[0], {
    source_id: sourceId,
    original_representation_ids: [representationId],
  });
  Object.assign(batch.catalog.trip_source_representations[0], {
    id: representationId,
    source_id: sourceId,
  });
  Object.assign(batch.request.materials[0].pin, {
    id: randomUUID(),
    source_id: sourceId,
    representation_id: representationId,
  });
  batch.resolved_airports.forEach((a) => {
    a.input_id = batch.request.materials[0].pin.id;
  });
  batch.request.binding.run_id = randomUUID();
  batch.request.binding.request_id = batch.request.binding.idempotency_key = randomUUID();
  await bindFlightBatch(batch);
  const getAccountId = async () => batch.request.binding.account_id;
  const context = await captureAccountRequestContext(
    batch.request.binding.trip_id,
    getAccountId,
  );
  const set = await interpretFlightBatch(batch, {
    sha256: hash,
    getAccountId,
    now: () => "2026-10-06T00:00:00Z",
  });
  const built = await buildCaptureFlightPublicationV2(
    context,
    set,
    batch.request.materials,
    randomUUID(),
    hash,
    getAccountId,
  );
  return { batch, set, built, context, getAccountId };
}
