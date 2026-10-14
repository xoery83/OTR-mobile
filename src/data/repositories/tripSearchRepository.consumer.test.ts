// Portable network-none Reference-local synthetic producer, not real Auth/Hosted evidence.
import { expect, it, vi } from "vitest";
import { fixture, sha256 } from "./__fixtures__/captureBatchAssessment";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { createTripSearchRepository } from "./tripSearchRepository";
import { getAccountGeneration } from "../auth/accountGeneration";
import {
  referenceTripV1Full,
  seedReferenceTripV1Full,
  createReferenceTripV1LocalProducer,
} from "./__fixtures__/referenceTripV1";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));

it("normal accepted Reference collection supports P4–6 temporary detail while null zones need an explicit same-generation view", async () => {
  const f = fixture(true),
    account = f.getAccount;
  const core = createTripCoreV2Repository(f.db, account, sha256);
  const trips = createTripRepository(f.db, account, core);
  const saved = await seedReferenceTripV1Full(trips, core);
  const context = await core.captureContext(saved.id);
  const intents = await core.pending(context);
  expect(intents).toHaveLength(16);
  const producer = await createReferenceTripV1LocalProducer(
    await account(),
    sha256,
    true,
  );
  for (const intent of intents) {
    const result = await producer.execute(intent.command);
    expect(result.receipt.outcome).toBe("APPLIED");
    await core.applyReceipt(context, result.receipt);
  }
  const bundle = await producer.collection();
  await core.install(await core.beginRefresh(context, 1), bundle.manifest, bundle.pages);
  const reader = createTripSearchRepository(f.db, core, account);
  let page = await reader.page({
    query: "Reference",
    tripId: referenceTripV1Full.trip.tripId,
    category: "ITINERARY",
  });
  const view = {
    tripId: referenceTripV1Full.trip.tripId,
    zone: "Asia/Tokyo",
    generation: getAccountGeneration(),
  };
  for (const family of ["P4", "P5", "P6"]) {
    const result = page.results.find(
      (result) => result.family === family && result.date,
    )!;
    expect(result).toBeDefined();
    const resolved = await reader.resolve(result, page.proofs[0], view);
    expect(resolved?.kind).toBe("ITEM");
    if (resolved?.kind === "ITEM")
      expect(
        [
          ...resolved.projection.query(resolved.date, resolved.zone).timed,
          ...resolved.projection.query(resolved.date, resolved.zone).nonComparable,
        ].some((row) => row.event.id === result.id),
      ).toBe(true);
  }
  const booking = page.results.find(
    (result) => result.title === "Reference Booking-only activity",
  )!;
  expect(await reader.resolve(booking, page.proofs[0])).toBeNull();
  expect(
    await reader.resolve(booking, page.proofs[0], {
      ...view,
      generation: view.generation - 1,
    }),
  ).toBeNull();
  expect(
    await reader.resolve(booking, page.proofs[0], { ...view, tripId: "other" }),
  ).toBeNull();
  const opened = await reader.resolve(booking, page.proofs[0], view);
  expect(opened?.kind).toBe("ITEM");
  if (opened?.kind === "ITEM") {
    expect(opened.date).toBe("2027-02-07");
    expect(
      opened.projection.events.find((event) => event.id === booking.id)?.boundaries[0]
        .zone_id,
    ).toBeNull();
  }
  f.reopen();
  page = await reader.page({
    query: "Reference Booking-only activity",
    tripId: referenceTripV1Full.trip.tripId,
    category: "ITINERARY",
  });
  expect((await reader.resolve(page.results[0], page.proofs[0], view))?.kind).toBe(
    "ITEM",
  );
});
