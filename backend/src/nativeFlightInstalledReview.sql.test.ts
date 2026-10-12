import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { session, seedPublicationSource } from "./__fixtures__/tripCoreV2Sql";
import { publicationTestHash as hash } from "./__fixtures__/tripCoreV2CandidatePublication";
import { createCorePgHttpConnection } from "./tripCoreV2PgHttpConnection";
import { prepareCoreSourcePlanV2 } from "./tripCoreV2Source";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import type { FlightInterpretationBatch } from "../../src/data/interpretation/flightInterpretation";
import type {
  buildCaptureFlightPublicationV2,
  buildCaptureFlightSourcePlanV2,
} from "../../src/data/interpretation/captureFlightCoreV2";

const owned = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
it.skipIf(!owned)(
  "exact installed-simulator publication stays owning REVIEW without rebuilding or qualifying PDF candidates",
  async () => {
    if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(owned!))
      throw new Error("OWNED_FIXTURE_REQUIRED");
    if (!process.env.OTR_NATIVE03_PACKET) throw new Error("INSTALLED_PACKET_REQUIRED");
    const input = JSON.parse(readFileSync(process.env.OTR_NATIVE03_PACKET, "utf8")) as {
      adapter: {
        built: Awaited<ReturnType<typeof buildCaptureFlightPublicationV2>>;
        plan: ReturnType<typeof buildCaptureFlightSourcePlanV2>;
      };
      batch: FlightInterpretationBatch;
      originalRepresentationId: string;
      originalSha256: string;
      originalByteCount: number;
    };
    const p = input.adapter.built.publication,
      account = p.candidates[0].accountId,
      trip = p.candidates[0].tripId;
    const admin = session(owned!);
    try {
      // The existing test-only Source bootstrap supplies synthetic owning rows; no derivative seal implementation.
      await seedPublicationSource(
        admin,
        { materials: input.batch.request.materials, request: p },
        account,
        trip,
        input.adapter.built.sourcePublication,
        {
          representationId: input.originalRepresentationId,
          sha256: input.originalSha256,
          byteCount: input.originalByteCount,
        },
      );
      await admin.lease.query(
        "DO $$DECLARE c record;BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND contype='c' LOOP EXECUTE format('ALTER TABLE public.trip_core_activation_gate DROP CONSTRAINT %I',c.conname);END LOOP;END$$",
      );
      await admin.lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=true,enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT','QUALIFY_FLIGHT'],enabled_families=ARRAY['P2'],enabled_admission_modes=ARRAY['REVIEWED_SOURCE']",
      );
      const core = createCorePgHttpConnection(
        {
          async withLease<T>(work: (lease: CorePgLease) => Promise<T>) {
            const s = session(owned!);
            try {
              await s.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
              return await work(s.lease);
            } finally {
              s.close();
            }
          },
        },
        hash,
      );
      const publication = await core.publishSourceCandidates!(account, trip, p);
      expect(publication.candidates.map((c) => c.candidateId)).toEqual(
        p.candidates.map((c) => c.candidateId),
      );
      expect(
        publication.candidates.every(
          (c) => c.status === "REVIEW" && c.errorCode === "CONTRACT_UNSUPPORTED",
        ),
      ).toBe(true);
      const preparation = await prepareCoreSourcePlanV2(
        core.source!,
        account,
        trip,
        input.adapter.plan,
        hash,
      );
      expect(preparation.readyCommands).toHaveLength(0);
      expect(preparation.reviewSlots.length).toBeGreaterThan(0);
      expect(await core.publishSourceCandidates!(account, trip, p)).toEqual(publication);
      console.log(
        JSON.stringify({
          classification: "CP_FLIGHT_NATIVE_03_INSTALLED_PACKET_OWNING_REVIEW",
          publicationId: p.publicationId,
          runId: p.runId,
          candidateIds: p.candidates.map((c) => c.candidateId),
          review: publication.candidates.map((c) => c.errorCode),
          readyCommands: 0,
          originalSha256: input.originalSha256,
          rebuiltCandidates: false,
          sourceSealImplemented: false,
          hosted: false,
        }),
      );
    } finally {
      admin.close();
    }
  },
);
