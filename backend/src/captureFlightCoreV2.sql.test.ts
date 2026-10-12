import { seedAndSealPdf } from "./__fixtures__/sourcePdfAcceptance";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureFlightFixture } from "../../src/data/interpretation/__fixtures__/captureFlightCoreV2";
import {
  buildCaptureFlightSourcePlanV2,
  prepareCaptureFlightSetV2,
} from "../../src/data/interpretation/captureFlightCoreV2";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { publicationTestHash as hash } from "./__fixtures__/tripCoreV2CandidatePublication";
import { session, seedPublicationSource } from "./__fixtures__/tripCoreV2Sql";
import { createCoreV2Transport } from "../../src/data/api/tripCoreV2Transport";
import { coreHttpBoundary } from "./tripCoreV2Http";
import { createCorePgHttpConnection } from "./tripCoreV2PgHttpConnection";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import { prepareCoreSourcePlanV2, readCoreSourcePlanV2 } from "./tripCoreV2Source";
import { flightCommandLeaves } from "../../src/domain/trip/flightAdmission";
import { verifyJoinedFlightDay } from "./__fixtures__/flightCoreDayAcceptance";
vi.mock("../../src/data/auth/sessionAccessToken", () => ({
  sessionAccessToken: vi.fn(),
}));
vi.mock("../../src/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../../src/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("../../src/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("../../src/features/day-feed/useMinuteClock", () => ({
  useMinuteClock: () => ({ instant: "2026-01-01T00:00:00Z" }),
}));
vi.mock("@react-native-community/datetimepicker", () => ({ default: () => null }));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const primitive = (p: Record<string, any>) =>
    createElement(
      "div",
      { "data-testid": p.testID, "aria-label": p.accessibilityLabel },
      p.children,
    );
  return {
    View: primitive,
    Text: primitive,
    ScrollView: primitive,
    Pressable: primitive,
    Modal: (p: Record<string, any>) => (p.visible ? primitive(p) : null),
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 0.5 },
    useWindowDimensions: () => ({ width: 375, height: 812, fontScale: 1 }),
    useColorScheme: () => "light",
  };
});
const owned = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
it.skipIf(!owned)(
  "joined Capture → owning SQL/read2 → SQLite54 → Day with same-ID exact receipt recovery",
  async () => {
    if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(owned!))
      throw new Error("OWNED_FIXTURE_REQUIRED");
    const pdfMode = process.env.OTR_CORE_PDF_AUTHORITY === "1";
    const f = await captureFlightFixture(
        pdfMode
          ? "NZ1 AKL->CHC 2026-12-17 depInstant=2026-12-16T20:00:00.120000Z\nNZ2 CHC->AKL 2026-12-20 depInstant=2026-12-19T20:00:00.120000Z"
          : undefined,
      ),
      p = f.built.publication;
    const account = f.context.accountId,
      trip = f.context.tripId;
    const admin = session(owned!);
    const connect = {
      withLease: async <T>(work: (lease: CorePgLease) => Promise<T>) => {
        const s = session(owned!);
        try {
          await s.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
          return await work(s.lease);
        } finally {
          s.close();
        }
      },
    };
    const identities = p.candidates.map((c) => ({
      candidateId: c.candidateId,
      itemId: randomUUID(),
      createSlotId: randomUUID(),
      createOperationId: randomUUID(),
      qualifySlotId: randomUUID(),
      qualifyOperationId: randomUUID(),
    }));
    let plan = buildCaptureFlightSourcePlanV2(p, randomUUID(), identities);
    const recoveredOperations: string[] = [];
    let pdf: Awaited<ReturnType<typeof seedAndSealPdf>> | undefined;
    try {
      if (pdfMode) pdf = await seedAndSealPdf(admin, owned!, f);
      else
        await seedPublicationSource(
          admin,
          { materials: f.batch.request.materials, request: p },
          account,
          trip,
          f.built.sourcePublication,
        );
      if (pdfMode) plan = buildCaptureFlightSourcePlanV2(p, plan.planId, identities);
      await admin.lease.query(
        "DO $$DECLARE c record;BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND contype='c' LOOP EXECUTE format('ALTER TABLE public.trip_core_activation_gate DROP CONSTRAINT %I',c.conname);END LOOP;END$$",
      );
      await admin.lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=true,enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT','QUALIFY_FLIGHT','UPDATE_FLIGHT_FACTS','SET_ITEM_TEXT','SET_OBJECT_VISIBILITY'],enabled_families=ARRAY['P2'],enabled_admission_modes=ARRAY['REVIEWED_SOURCE','MANUAL']",
      );
      let core = createCorePgHttpConnection(connect, hash);
      let loseNextCommandResponse = false;
      const transport = createCoreV2Transport(
        f.getAccountId,
        hash,
        {
          baseUrl: "http://core.synthetic",
          fetchImplementation: async (input, init) => {
            const request = new Request(input, init);
            if (request.headers.get("Authorization") !== "Bearer synthetic-test-token")
              return new Response("", { status: 401 });
            const response = await coreHttpBoundary(
              request,
              account,
              async () => true,
              core,
            );
            if (
              request.method === "POST" &&
              new URL(request.url).pathname.endsWith("/commands") &&
              loseNextCommandResponse
            ) {
              loseNextCommandResponse = false;
              throw new TypeError("SYNTHETIC_RESPONSE_LOSS");
            }
            return response;
          },
        },
        async () => ({ token: "synthetic-test-token", userId: account }),
      );
      const initial = await prepareCaptureFlightSetV2(
        f.context,
        f.built,
        plan.planId,
        identities,
        transport,
      );
      const published = initial.publication;
      expect(published.candidates.map((c) => c.status)).toEqual([
        "QUALIFIED",
        "QUALIFIED",
      ]);
      expect(await core.publishSourceCandidates!(account, trip, p)).toEqual(published);
      let prepared = initial.preparation;
      expect(prepared.reviewSlots.map((s) => s.errorCode)).toEqual([
        "DEPENDENCY_PENDING",
        "DEPENDENCY_PENDING",
      ]);
      expect(prepared.readyCommands).toHaveLength(2);
      for (let phase = 0; phase < 2; phase++) {
        for (const command of prepared.readyCommands) {
          // The first response is discarded; restart recovers the immutable receipt without a new operation.
          loseNextCommandResponse = true;
          await expect(transport.submit(f.context, command)).rejects.toThrow();
          core = createCorePgHttpConnection(connect, hash);
          const recovered = await transport.receipt(f.context, command.operationId);
          expect(recovered?.projection).toBe("FULL");
          if (recovered?.projection !== "FULL") throw new Error("REDACTED_UNEXPECTED");
          expect(recovered.receipt.outcome).toBe("APPLIED");
          recoveredOperations.push(recovered.receipt.operationId);
          expect(await transport.submit(f.context, command)).toEqual(recovered);
          const slot = plan.slots.find((s) => s.operationId === command.operationId)!;
          const finalized = await transport.finalizeSourceSlot(f.context, plan.planId, {
            captureVersion: 2,
            slotId: slot.slotId,
            operationId: command.operationId,
            intentSha256: recovered.receipt.intentSha256,
            domainReceiptId: recovered.domainReceiptId,
            receiptSha256: recovered.receipt.receiptSha256,
          });
          expect(finalized.state).toBe("COMPLETE");
        }
        prepared = await transport.prepareSourcePlan(f.context, plan);
        expect(prepared.readyCommands).toHaveLength(phase === 0 ? 2 : 0);
      }
      expect(
        (await readCoreSourcePlanV2(core.source!, account, trip, plan.planId, hash))
          .status.status,
      ).toBe("COMPLETE");
      const repeat = await prepareCaptureFlightSetV2(
        f.context,
        f.built,
        plan.planId,
        identities,
        transport,
      );
      expect(repeat.publication).toEqual(published);
      expect(repeat.preparation.readyCommands).toEqual([]);
      const duplicateIds = identities.map((i) => ({
        ...i,
        itemId: randomUUID(),
        createSlotId: randomUUID(),
        createOperationId: randomUUID(),
        qualifySlotId: randomUUID(),
        qualifyOperationId: randomUUID(),
      }));
      const duplicate = await prepareCaptureFlightSetV2(
        f.context,
        f.built,
        randomUUID(),
        duplicateIds,
        transport,
      );
      expect(duplicate.preparation.readyCommands).toHaveLength(0);
      expect(
        duplicate.preparation.reviewSlots.some((s) => s.errorCode.includes("COLLISION")),
      ).toBe(true);
      const snapshot = await core.read!.collection(account, trip);
      expect(snapshot.manifest.rosters.find((r) => r.kind === "ITEM")?.count).toBe(2);
      for (const i of identities) {
        const item = await core.read!.item(account, trip, i.itemId);
        expect(item?.itemId).toBe(i.itemId);
        expect(item?.details).toMatchObject({ qualification: "QUALIFIED" });
      }
      const sqlPairs = (
        await admin.lease.query(
          "SELECT id::text AS item_id,semantic_revision::int AS semantic_revision FROM public.itinerary_events WHERE id IN($1::uuid,$2::uuid) ORDER BY id",
          identities.map((i) => i.itemId),
        )
      ).rows;
      expect(sqlPairs).toHaveLength(2);
      expect(sqlPairs.every((r) => r.semantic_revision === 2)).toBe(true);
      const joined = await verifyJoinedFlightDay({
        core: () => core,
        hash,
        accountId: account,
        otherAccountId: "00000000-0000-4000-8000-000000000002",
        tripId: trip,
        expected: identities.map((i) => ({
          itemId: i.itemId,
          semanticRevision: Number(
            sqlPairs.find((r) => r.item_id === i.itemId)!.semantic_revision,
          ),
          localDate: p.candidates.find((c) => c.candidateId === i.candidateId)!.facts
            .departureDate!,
        })),
        privateIds: [
          p.sourceId,
          p.runId,
          p.publicationId,
          ...p.candidates.map((c) => c.candidateId),
          f.batch.request.materials[0].pin.representation_id,
          ...(pdf
            ? [pdf.originalId, pdf.receipt.operationId, pdf.receipt.sealSha256]
            : []),
        ],
      });
      console.info(JSON.stringify(joined));
      expect(
        (
          await admin.lease.query(
            "SELECT count(*)::int AS n FROM public.trip_source_core_v2_associations WHERE source_id=$1::uuid",
            [p.sourceId],
          )
        ).rows[0].n,
      ).toBe(4);
      // Another Trip member receives no private Item or private Source proof.
      const other = "00000000-0000-4000-8000-000000000002";
      expect(
        (await core.read!.collection(other, trip)).manifest.rosters.find(
          (r) => r.kind === "ITEM",
        )?.count,
      ).toBe(0);
      await expect(core.publishSourceCandidates!(other, trip, p)).rejects.toThrow();
      const target = identities[0].itemId;
      const manual = {
        contractVersion: 2,
        intentVersion: 2,
        operationId: randomUUID(),
        tripId: trip,
        command: "SET_ITEM_TEXT",
        target: { kind: "ITEM", id: target },
        baseVector: [{ kind: "ITEM", id: target, revision: 2 }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: { title: "User title", description: null },
      };
      const set = await executeCoreCommandV2(core.commands!, account, trip, manual, hash);
      expect(set.projection === "FULL" && set.receipt.outcome).toBe("APPLIED");
      const c = p.candidates[0];
      const update = {
        ...plan,
        planId: randomUUID(),
        candidateIds: [c.candidateId],
        slots: [
          {
            ...plan.slots[0],
            slotId: randomUUID(),
            operationId: randomUUID(),
            slotKey: "update",
            command: "UPDATE_FLIGHT_FACTS",
            target: { kind: "ITEM", id: target },
            selectedFields: ["ROOT.title"],
            evidenceRefs: Object.fromEntries(
              [
                "ROOT.title",
                `SERVICE.${c.facts.services![0].service_key}.service_number`,
                "ORIGIN.local_date",
                "ORIGIN.authored_label",
                "DESTINATION.authored_label",
              ].map((k) => [k, c.fieldEvidence[k]]),
            ),
            baseVector: [{ kind: "ITEM", id: target, revision: 3 }],
            payload: {
              changes: { title: c.facts.core!.title },
              proofs: {
                "ROOT.title": { kind: "TRACK_C", ref: c.fieldEvidence["ROOT.title"][0] },
              },
            },
          },
        ],
      };
      const denied = await prepareCoreSourcePlanV2(
        core.source!,
        account,
        trip,
        update,
        hash,
      );
      expect(denied.readyCommands).toHaveLength(0);
      expect(denied.reviewSlots.map((s) => s.errorCode)).toContain("PROTECTED_FIELD");
      const protectedRead = await core.read!.item(account, trip, target);
      expect(protectedRead?.title).toBe("User title");
      const protectedRows = (
        await admin.lease.query(
          "SELECT title,description,field_state FROM public.itinerary_events WHERE id=$1::uuid",
          [target],
        )
      ).rows[0];
      expect(protectedRows.description).toBeNull();
      expect(protectedRows.field_state).toMatchObject({
        "itinerary_events.description": { state: "CLEARED", protected: true },
        "itinerary_events.title": { state: "KNOWN", protected: true },
      });
      const shared = await executeCoreCommandV2(
        core.commands!,
        account,
        trip,
        {
          ...manual,
          operationId: randomUUID(),
          command: "SET_OBJECT_VISIBILITY",
          baseVector: [{ kind: "ITEM", id: target, revision: 3 }],
          payload: { acl: coreDefaults("organizer").acl },
        },
        hash,
      );
      expect(shared.projection === "FULL" && shared.receipt.outcome).toBe("APPLIED");
      const sharedRead = JSON.stringify(await core.read!.collection(other, trip));
      expect(sharedRead).not.toContain("track-c/field-evidence");
      expect(sharedRead).not.toContain(p.sourceId);
      expect(sharedRead).not.toContain("source-publication/");
      for (const text of [
        "NZ3 AAA→CHC 2026-12-17 depInstant=2026-12-16T20:00:00Z\nNZ4 CHC→AAA 2026-12-20 depInstant=2026-12-19T20:00:00Z",
        "NZ3 AKL→CHC 2026-12-17 depInstant=2026-12-16T20:00:00Z\nNZ3 AKL→CHC 2026-12-17 depInstant=2026-12-16T21:00:00Z",
      ]) {
        const negative = await captureFlightFixture(text),
          request = negative.built.publication;
        await seedPublicationSource(
          admin,
          { materials: negative.batch.request.materials, request },
          account,
          trip,
          negative.built.sourcePublication,
        );
        const ids = request.candidates.map((c) => ({
          candidateId: c.candidateId,
          itemId: randomUUID(),
          createSlotId: randomUUID(),
          createOperationId: randomUUID(),
          qualifySlotId: randomUUID(),
          qualifyOperationId: randomUUID(),
        }));
        const review = await prepareCaptureFlightSetV2(
          negative.context,
          negative.built,
          randomUUID(),
          ids,
          transport,
        );
        expect(review.publication.candidates).toHaveLength(
          negative.set.candidates.length,
        );
        expect(review.publication.candidates.every((c) => c.status === "REVIEW")).toBe(
          true,
        );
        expect(review.preparation.readyCommands).toHaveLength(0);
      }
      expect(
        (await core.read!.collection(account, trip)).manifest.rosters.find(
          (r) => r.kind === "ITEM",
        )?.count,
      ).toBe(2);

      if (pdf) {
        // Revoked custody cannot authorize a new output; already accepted items are preserved.
        await pdf.alter(
          "UPDATE public.trip_source_representations SET remote_state='LOST',row_revision=2 WHERE id=$1::uuid",
          [pdf.originalId],
        );
        await expect(
          core.source!.withLockedSourcePlan(
            {
              actorAccountId: account,
              tripId: trip,
              sourceId: p.sourceId,
              planId: plan.planId,
              candidateIds: p.candidates.map((c) => c.candidateId),
            },
            (tx) => tx.readSealedCatalog(),
          ),
        ).rejects.toThrow("CONTRACT_UNSUPPORTED");
        const redacted = await transport.receipt(f.context, recoveredOperations[0]);
        expect(redacted?.projection).toBe("STATUS_ONLY");
        expect(
          (
            await admin.lease.query(
              "SELECT count(*)::int AS n FROM public.itinerary_events WHERE id IN($1::uuid,$2::uuid)",
              identities.map((i) => i.itemId),
            )
          ).rows[0].n,
        ).toBe(2);
        await pdf.alter(
          "UPDATE public.trip_source_representations SET remote_state='VERIFIED',row_revision=2 WHERE id=$1::uuid",
          [pdf.originalId],
        );
        await expect(
          core.source!.withLockedSourcePlan(
            {
              actorAccountId: account,
              tripId: trip,
              sourceId: p.sourceId,
              planId: plan.planId,
              candidateIds: p.candidates.map((c) => c.candidateId),
            },
            (tx) => tx.readSealedCatalog(),
          ),
        ).rejects.toThrow("CONTRACT_UNSUPPORTED");
        await pdf.alter(
          "UPDATE public.trip_source_representations SET remote_state='VERIFIED',row_revision=1 WHERE id=$1::uuid",
          [pdf.originalId],
        );
      }
      expect(Object.keys(flightCommandLeaves(c.facts))).not.toHaveLength(0);
      expect(new Set(recoveredOperations).size).toBe(4);
      console.info(
        JSON.stringify({
          classification: "CP_FLIGHT_E2E_A_ISOLATED_SYNTHETIC_SQL",
          sourceId: p.sourceId,
          runId: p.runId,
          inputCatalogSha256: p.inputCatalogSha256,
          candidateIds: p.candidates.map((c) => c.candidateId),
          itemIds: identities.map((i) => i.itemId),
          recoveredOperationIds: recoveredOperations,
          sourcePlanStatus: "COMPLETE",
          associations: 4,
          qualificationRevision: 2,
          negativeWrites: 0,
        }),
      );
    } finally {
      if (pdf) await pdf.close();
      await admin.lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=false,enabled_commands='{}',enabled_families='{}',enabled_admission_modes='{}'",
      );
      admin.close();
    }
  },
  30000,
);
