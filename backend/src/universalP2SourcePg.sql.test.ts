import { createCoreUniversalSourceRead } from "./universalCoreSourceRead";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { universalP2SourceFixture } from "./__fixtures__/universalP2Source";
import { session } from "./__fixtures__/tripCoreV2Sql";
import { createCoreSourcePgAuthority } from "./tripCoreV2SourcePgAuthority";
import { createCorePgStorage, type CorePgConnection } from "./tripCoreV2PgStorage";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import { prepareCoreSourcePlanV2 } from "./tripCoreV2Source";
import { projectUniversalP2SourceProposal } from "./universalP2SourceReview";

const container = process.env.OTR_UNIVERSAL_P2_OWNED_SQL_FIXTURE;
// Retained synthetic publication is an explicit fixture; Source/Core transactions are actual protected PG.
it.skipIf(!container)(
  "creates one Sparse P2 through owning Source and recovers the same accepted receipt after closure",
  async () => {
    const f = await universalP2SourceFixture(),
      actor = f.input.context.accountId,
      trip = f.input.context.tripId;
    const admin = session(container!),
      material = f.input.material,
      pin = material.pin,
      sourceId = pin.source_id;
    const request = {
      captureVersion: 2,
      family: "P2",
      sourceId,
      batchId: f.input.result.batchId,
      taskId: f.input.result.taskId,
      token: "i1",
      requestSha256: f.input.result.requestSha256,
      sourceReview: f.input.selection.sourceReview,
    };
    const packet = new URL(
      "../../docs/ops/universal-p2-formal-save-20261027/",
      import.meta.url,
    );
    const pinned = JSON.parse(
      readFileSync(new URL("P2_REVIEW_SCOPE.json", packet), "utf8"),
    );
    let phase = "";
    const phaseTimes: { phase: string; ms: number; queries: number }[] = [];
    const leaseQueries: number[] = [];
    const leaseTraces: string[][] = [];
    const connection: CorePgConnection = {
      withLease: async (work) => {
        const s = session(container!);
        let count = 0;
        const texts: string[] = [];
        const selected = phase;
        const started = Date.now();
        const delayed = !!selected && process.env.OTR_UNIVERSAL_P2_SQL_DELAYED === "1";
        if (delayed) await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          await s.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
          return await work({
            retire: () => s.lease.retire(),
            query: async (sql, args) => {
              if (delayed) {
                await new Promise((resolve) => setTimeout(resolve, 290));
                if (Date.now() - started >= 30000)
                  throw Error("OWNED_CORE_LEASE_DEADLINE");
              }
              count++;
              texts.push(sql.slice(0, 180));
              return s.lease.query(sql, args);
            },
          });
        } finally {
          if (selected)
            phaseTimes.push({
              phase: selected,
              ms: Date.now() - started,
              queries: count,
            });
          leaseQueries.push(count);
          leaseTraces.push(texts);
          s.close();
        }
      },
    };
    const readers = new WeakMap<
      import("./tripCoreV2PgStorage").CorePgLease,
      ReturnType<typeof createCoreUniversalSourceRead>
    >();
    const authority = createCoreSourcePgAuthority(connection, f.deps.hash, {
      readUniversalP1: async (scope, lease) => {
        if (
          !lease ||
          scope.actorAccountId !== actor ||
          scope.tripId !== trip ||
          scope.batchId !== request.batchId ||
          scope.taskId !== request.taskId
        )
          return null;
        let reader = readers.get(lease);
        if (!reader) {
          reader = createCoreUniversalSourceRead(lease, actor, trip);
          readers.set(lease, reader);
        }
        const binding = await reader.lookup(actor, trip, request.batchId);
        if (!binding || binding.taskId !== request.taskId)
          throw Error("UNIVERSAL_BINDING_SCOPE");
        await reader.readManifest({
          account_id: actor,
          trip_id: trip,
          import_id: request.batchId,
          task_id: request.taskId,
          run_id: binding.runId,
          manifest_sha256: binding.submissionSha256,
          input_pins: binding.inputs.map((p) => ({
            kind: "SOURCE",
            transform_sha256: null,
            input_id: p.id,
            source_id: p.source_id,
            representation_id: p.representation_id,
            material_revision: p.material_revision,
            payload_sha256: p.payload_sha256,
            byte_count: p.byte_count,
          })),
        });
        return {
          runId: f.input.runId,
          result: f.input.result as import("./universalImport").UniversalResult,
          resultSha256: f.input.resultSha256,
        };
      },
    });
    const control = async (sql: string, args?: unknown[]) => {
      await admin.lease.query("SET ROLE postgres");
      return admin.lease.query(sql, args);
    };
    async function protectedWrite(
      sql: string,
      args?: unknown[],
      selected: { operation?: string; slot?: string; target?: string } = {},
    ) {
      return connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        try {
          await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
          await lease.query(
            "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true),set_config('otr.core.family','P2',true),set_config('otr.core.command','CREATE_SPARSE_FLIGHT',true),set_config('otr.core.admission','REVIEWED_SOURCE',true),set_config('otr.core.target_item',$3,true),set_config('otr.core.operation',$4,true),set_config('otr.core.source_intent',$5,true)",
            [
              actor,
              trip,
              selected.target ?? pinned.targetId,
              selected.operation ?? pinned.operationId,
              selected.slot ?? pinned.slotId,
            ],
          );
          return await lease.query(sql, args);
        } finally {
          await lease.query("ROLLBACK");
        }
      });
    }
    try {
      await admin.lease.query("BEGIN");
      await admin.lease.query("SET CONSTRAINTS ALL DEFERRED");
      const tables = [
        "trip_sources",
        "trip_source_revisions",
        "trip_source_representations",
        "trip_source_runs",
        "trip_source_inputs",
      ];
      for (const t of tables)
        await admin.lease.query(`ALTER TABLE public.${t} DISABLE TRIGGER USER`);
      await admin.lease.query(
        "INSERT INTO public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision) VALUES($1::uuid,$2::uuid,$3::uuid,$1,$4,'TEXT','PASTE','UNKNOWN',clock_timestamp(),1,1)",
        [sourceId, trip, actor, pin.payload_sha256],
      );
      await admin.lease.query(
        "INSERT INTO public.trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) VALUES($1::uuid,1,clock_timestamp(),$2::uuid,$1,$4,ARRAY[$3::uuid],'AS_SUPPLIED','ACQUISITION')",
        [sourceId, actor, pin.representation_id, pin.payload_sha256],
      );
      await admin.lease.query(
        "INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,regenerability,created_at,remote_state) VALUES($1::uuid,1,$2::uuid,1,'ORIGINAL','TEXT','UTF-8',$3,$4,$5,'NOT_APPLICABLE',clock_timestamp(),'NOT_APPLICABLE')",
        [
          pin.representation_id,
          sourceId,
          pin.payload_sha256,
          pin.byte_count,
          material.text,
        ],
      );
      const inputHash = (
        await admin.lease.query(
          "SELECT public.trip_import_run_input_hash($1::jsonb) AS hash",
          [JSON.stringify([pin])],
        )
      ).rows[0].hash;
      await admin.lease.query(
        "INSERT INTO public.trip_source_runs(id,row_revision,trip_id,actor_account_id,operation_key,scope_source_ids,scope_sha256,generation,input_sha256,extractor_key,extractor_version,extractor_options_sha256,created_at,capture_batch_id,interpretation_task_id,capture_submission_sha256) VALUES($1::uuid,1,$2::uuid,$3::uuid,$1,ARRAY[$4::uuid],$8,1,$5,'otr-universal-interpretation-v1','1',repeat('b',64),clock_timestamp(),$6::uuid,$7::uuid,repeat('c',64))",
        [
          f.input.runId,
          trip,
          actor,
          sourceId,
          inputHash,
          request.batchId,
          request.taskId,
          await f.deps.hash(Buffer.from(sourceId)),
        ],
      );
      await admin.lease.query(
        "INSERT INTO public.trip_source_inputs(id,run_id,source_id,material_revision,representation_id,payload_sha256,byte_count,observed_source_row_revision,historical_selection) VALUES($1::uuid,$2::uuid,$3::uuid,1,$4::uuid,$5,$6,1,false)",
        [
          pin.id,
          f.input.runId,
          sourceId,
          pin.representation_id,
          pin.payload_sha256,
          pin.byte_count,
        ],
      );
      await admin.lease.query("SET CONSTRAINTS ALL IMMEDIATE");
      for (const t of tables)
        await admin.lease.query(`ALTER TABLE public.${t} ENABLE TRIGGER USER`);
      await admin.lease.query("COMMIT");
      f.input.inputCatalogSha256 = String(inputHash);
      const expected = await projectUniversalP2SourceProposal(f.input, f.deps);
      expect(expected.binding.proposedPlanSha256).toBe(pinned.proposedPlanSha256);
      await expect(authority.publishUniversalP1(actor, trip, request)).rejects.toThrow(
        "CORE_CAPABILITY_CLOSED",
      );
      // Execute the exact candidate Gate only in this disposable fixture.
      const activateTemplate = readFileSync(
        new URL("P2_REVIEW_QUALIFIED_ACTIVATE.sql", packet),
        "utf8",
      );
      const activation = activateTemplate.replace(
        "__P2_FIXED_WINDOW_DEADLINE__",
        new Date(Date.now() + 3300000).toISOString(),
      );
      async function packageSql(text: string) {
        const s = session(container!);
        try {
          await s.lease.query("SET ROLE postgres");
          return await s.lease.query(text);
        } finally {
          s.close();
        }
      }
      await expect(
        packageSql(
          activateTemplate.replace(
            "__P2_FIXED_WINDOW_DEADLINE__",
            new Date(Date.now() + 3700000).toISOString(),
          ),
        ),
      ).rejects.toThrow("P2_INVALID_DEADLINE");
      await packageSql(activation);
      await expect(packageSql(activation)).rejects.toThrow("P2_REQUIRES_CLOSED_POLICY");
      // Expiry alone must deny new business writes even if a closer process is unavailable.
      await packageSql(
        "UPDATE public.trip_sustained_dev_policy SET universal_p1_review_scope=jsonb_set(universal_p1_review_scope,'{expiresAt}',to_jsonb((clock_timestamp()-interval '1 second')::text)) WHERE actor_account_id='" +
          actor +
          "'::uuid",
      );
      await expect(authority.publishUniversalP1(actor, trip, request)).rejects.toThrow(
        "CORE_CAPABILITY_CLOSED",
      );
      await packageSql(
        "UPDATE public.trip_sustained_dev_policy SET universal_p1_review_scope=jsonb_set(universal_p1_review_scope,'{expiresAt}',to_jsonb((clock_timestamp()+interval '55 minutes')::text)) WHERE actor_account_id='" +
          actor +
          "'::uuid",
      );
      const publication = await authority.publishUniversalP1(actor, trip, request);
      expect(publication.status).toBe("CANDIDATE_SEALED");
      expect(publication.proposedPlan).toEqual(expected.plan);
      phase = "source-prepare";
      const prepared = await prepareCoreSourcePlanV2(
        authority.source,
        actor,
        trip,
        publication.proposedPlan,
        f.deps.hash,
      );
      phase = "";
      expect(prepared.readyCommands).toHaveLength(1);
      const command = prepared.readyCommands[0];
      expect(command.command).toBe("CREATE_SPARSE_FLIGHT");
      expect(command.target.id).toBe(pinned.targetId);
      const storage = createCorePgStorage(
        connection,
        f.deps.hash,
        {
          verify: authority.verifySourceIntent,
          canReadSourceReceipt: authority.canReadSourceReceipt,
          canReadAudit: authority.canReadAudit,
          audit: authority.audit,
          canReadOriginal: async () => false,
        },
        {
          sustainedDev: true,
          reviewedP1: true,
        },
      );
      phase = "core-create";
      const accepted = await executeCoreCommandV2(
        storage,
        actor,
        trip,
        command,
        f.deps.hash,
        () => new Date().toISOString(),
      );
      phase = "";
      expect(accepted.projection).toBe("FULL");
      if (accepted.projection !== "FULL") throw Error("FULL_RECEIPT_REQUIRED");
      expect(accepted.receipt.outcome).toBe("APPLIED");
      const rows = (
        await control(
          "SELECT e.id,e.title,e.start_local_date,e.start_local_time,e.start_zone_id,e.end_local_date,e.visibility,e.participation_mode,f.flight_number_literal,f.qualification FROM public.itinerary_events e JOIN public.trip_flight_intents f ON f.event_id=e.id AND f.trip_id=e.trip_id WHERE e.id=$1::uuid",
          [pinned.targetId],
        )
      ).rows;
      expect(rows).toEqual([
        expect.objectContaining({
          id: pinned.targetId,
          title: "NZ501",
          start_local_date: "2026-11-02",
          start_local_time: null,
          start_zone_id: null,
          end_local_date: null,
          visibility: "PRIVATE",
          participation_mode: "SELF",
          flight_number_literal: "NZ501",
          qualification: "SPARSE",
        }),
      ]);
      for (const selected of [
        { operation: "00000000-0000-4000-8000-000000000001" },
        { slot: "00000000-0000-4000-8000-000000000001" },
        { target: "00000000-0000-4000-8000-000000000001" },
      ]) {
        await expect(
          protectedWrite(
            "UPDATE public.trip_core_read_state SET revision=revision+1 WHERE trip_id=$1::uuid",
            [trip],
            selected,
          ),
        ).rejects.toThrow("CORE_V2_CAPABILITY_CLOSED");
      }
      const closeSql = readFileSync(new URL("P2_REVIEW_CLOSE.sql", packet), "utf8");
      await packageSql(closeSql);
      await packageSql(closeSql);
      await expect(
        packageSql(readFileSync(new URL("P2_REVIEW_DEV_ROLLBACK.sql", packet), "utf8")),
      ).rejects.toThrow("P2_ACCEPTED_SOURCE_RECOVERY_REQUIRED");
      await expect(
        protectedWrite(
          "UPDATE public.trip_source_core_v2_slots SET domain_receipt_id=$2::uuid WHERE output_slot_id=$1::uuid",
          [pinned.slotId, "00000000-0000-4000-8000-000000000001"],
        ),
      ).rejects.toThrow("P2_SOURCE_SLOT_MISMATCH");
      await expect(
        protectedWrite(
          "UPDATE public.trip_source_core_v2_slots SET state='COMPLETE',domain_receipt_id=$2::uuid WHERE output_slot_id=$1::uuid",
          [pinned.slotId, accepted.domainReceiptId],
        ),
      ).rejects.toThrow("P2_SOURCE_SLOT_MISMATCH");
      await expect(
        protectedWrite(
          "UPDATE public.trip_source_core_v2_intents SET prepared_json=jsonb_set(jsonb_set(prepared_json,'{slots,0,domainReceiptId}',to_jsonb($2::text)),'{slots,0,receipt}',$3::jsonb) WHERE plan_id=$1::uuid",
          [
            pinned.planId,
            accepted.domainReceiptId,
            JSON.stringify({ ...accepted.receipt, receiptSha256: "0".repeat(64) }),
          ],
        ),
      ).rejects.toThrow("P2_SOURCE_PLAN_MISMATCH");
      const finalize = {
        captureVersion: 2,
        slotId: pinned.slotId,
        operationId: command.operationId,
        intentSha256: accepted.receipt.intentSha256,
        domainReceiptId: accepted.domainReceiptId,
        receiptSha256: accepted.receipt.receiptSha256,
      };
      phase = "source-finalize";
      expect(
        (await authority.finalizeUniversalP1Operation(actor, trip, finalize)).state,
      ).toBe("COMPLETE");
      phase = "";
      expect(
        (await authority.finalizeUniversalP1Operation(actor, trip, finalize)).state,
      ).toBe("COMPLETE");
      await expect(
        protectedWrite(
          "UPDATE public.trip_source_core_v2_slots SET source_lineage_id=NULL WHERE output_slot_id=$1::uuid",
          [pinned.slotId],
        ),
      ).rejects.toThrow("P2_SOURCE_SLOT_MISMATCH");
      await expect(
        protectedWrite(
          "UPDATE public.trip_source_core_v2_slots SET domain_receipt_id=$2::uuid WHERE output_slot_id=$1::uuid",
          [pinned.slotId, "00000000-0000-4000-8000-000000000001"],
        ),
      ).rejects.toThrow("P2_SOURCE_SLOT_MISMATCH");
      const replay = await executeCoreCommandV2(
        storage,
        actor,
        trip,
        command,
        f.deps.hash,
        () => new Date().toISOString(),
      );
      expect(replay).toEqual(accepted);
      expect(
        (
          await control(
            "SELECT count(*)::int AS n FROM public.itinerary_events WHERE id=$1::uuid",
            [pinned.targetId],
          )
        ).rows,
      ).toEqual([{ n: 1 }]);
      // 90 round trips at observed 290ms plus setup remain inside the unchanged 30s lease.
      expect(Math.max(...leaseQueries)).toBeLessThanOrEqual(90);
      if (process.env.OTR_UNIVERSAL_P2_SQL_DELAYED === "1")
        expect(phaseTimes.every((p) => p.ms < 30000)).toBe(true);
    } finally {
      writeFileSync(
        process.env.OTR_UNIVERSAL_P2_SQL_DELAYED === "1"
          ? "/private/tmp/otr-p2-source-pg-delayed.json"
          : "/private/tmp/otr-p2-source-pg-fast.json",
        JSON.stringify({
          assertions: expect.getState().assertionCalls,
          counts: leaseQueries,
          traces: leaseTraces,
          phaseTimes,
        }),
      );
      admin.close();
    }
  },
  240000,
);
