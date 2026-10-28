import { createSustainedDevTripPorts } from "./tripSustainedRuntime";
import { coreHttpBoundary } from "./tripCoreV2Http";
import { createCorePgReader } from "./tripCoreV2PgRead";
import { appendFileSync, readFileSync } from "node:fs";
import { createCoreUniversalSourceRead } from "./universalCoreSourceRead";
import { universalP1Identity } from "./universalP1Source";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
import { session } from "./__fixtures__/tripCoreV2Sql";
import { createCoreSourcePgAuthority } from "./tripCoreV2SourcePgAuthority";
import { createCorePgStorage, type CorePgConnection } from "./tripCoreV2PgStorage";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import { prepareCoreSourcePlanV2, finalizeCoreSourceSlotV2 } from "./tripCoreV2Source";
const container = process.env.OTR_UNIVERSAL_P1_OWNED_SQL_FIXTURE;
// Actual protected PG transactions; model publication and identities are explicit disposable fixtures.
it
  .skipIf(!container)
  .each<{ reviewed: boolean; family: "P1" | "P3" | "P4" | "P5" | "P6" }>(
    process.env.OTR_UNIVERSAL_P6_OWNED_SQL_FIXTURE
      ? [{ reviewed: true, family: "P6" as const }]
      : process.env.OTR_UNIVERSAL_P5_OWNED_SQL_FIXTURE
        ? [{ reviewed: true, family: "P5" as const }]
        : process.env.OTR_UNIVERSAL_P4_OWNED_SQL_FIXTURE
          ? [{ reviewed: true, family: "P4" as const }]
          : process.env.OTR_UNIVERSAL_P3_RETRY_OWNED_SQL_FIXTURE
            ? [{ reviewed: true, family: "P3" as const }]
            : process.env.OTR_UNIVERSAL_P3_OWNED_SQL_FIXTURE
              ? [
                  { reviewed: false, family: "P1" as const },
                  { reviewed: true, family: "P1" as const },
                  { reviewed: true, family: "P3" as const },
                ]
              : [
                  { reviewed: false, family: "P1" as const },
                  { reviewed: true, family: "P1" as const },
                ],
  )(
  "qualifies original Source bytes through existing Source Plan/Core/receipt and recovers once (explicit review: %s)",
  async ({ reviewed, family }) => {
    if (!/^otr-trip-sustained-[a-f0-9]{12}$/.test(container!))
      throw Error("OWNED_FIXTURE_REQUIRED");
    const actor = process.env.OTR_UNIVERSAL_P1_FIXTURE_ACTOR!,
      trip = process.env.OTR_UNIVERSAL_P1_FIXTURE_TRIP!,
      f = await universalP1SourceFixture(
        actor,
        trip,
        process.env.OTR_UNIVERSAL_FULL_MONTH_SQL_FIXTURE === container && family === "P6"
          ? "November 3, 2026"
          : family !== "P1"
            ? "2026-11-03"
            : reviewed
              ? "Nov 1, 2026"
              : "2026-11-03",
        family,
      ),
      admin = session(container!);
    if (reviewed) {
      f.input.result.quality!.decisions[0].tier = "REVIEWABLE";
    }
    const sourceReview = reviewed
      ? {
          version:
            family === "P3"
              ? "otr.universal.p3-source-review/1"
              : family === "P4"
                ? "otr.universal.p4-source-review/1"
                : family === "P5"
                  ? "otr.universal.p5-source-review/1"
                  : family === "P6"
                    ? "otr.universal.p6-source-review/1"
                    : "otr.universal.p1-source-review/1",
          decision: "NEW",
          sourceRevision: 1,
          title:
            family === "P5"
              ? "Coastal QA Train"
              : family === "P3"
                ? "海滨住宿"
                : family === "P4"
                  ? "海滨租车"
                  : family === "P6"
                    ? "Harbour QA Gallery Visit"
                    : "海滨散步",
          localDate: family !== "P1" ? "2026-11-03" : "2026-11-01",
          ...(["P3", "P4"].includes(family) ? { endLocalDate: "2026-11-05" } : {}),
          originalReviewed: true,
          tripReviewed: true,
        }
      : undefined;
    const material = f.input.snapshot.materials[0],
      pin = material.pin,
      sourceId = pin.source_id;
    let delayPhase = "";
    const phaseTimes: { phase: string; ms: number; queries: number }[] = [];
    let measuringPrepare = false,
      prepareQueries = 0;
    let corruptOnRead = 0,
      publicationReads = 0;
    const queryCounts: number[] = [];
    const queryTraces: string[][] = [];
    const connection: CorePgConnection = {
      withLease: async (work) => {
        const s = session(container!);
        let count = 0;
        const phase = delayPhase,
          started = Date.now();
        if (reviewed && phase) await new Promise((r) => setTimeout(r, 1000));
        const texts: string[] = [];
        try {
          await s.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
          return await work({
            retire: () => s.lease.retire(),
            query: async (sql, args) => {
              if (reviewed && phase) {
                await new Promise((r) => setTimeout(r, 290));
                if (Date.now() - started >= 30000)
                  throw Error("OWNED_CORE_LEASE_DEADLINE");
              }
              count++;
              texts.push(sql.slice(0, 140));
              if (measuringPrepare) prepareQueries++;
              return s.lease.query(sql, args);
            },
          });
        } finally {
          if (reviewed && phase)
            phaseTimes.push({ phase, ms: Date.now() - started, queries: count });
          queryCounts.push(count);
          queryTraces.push(texts);
          s.close();
        }
      },
    };
    const published = {
      result: f.input.result,
      resultSha256: f.input.resultSha256,
      runId: f.input.runId,
      owningLifecycleRelationships: reviewed
        ? undefined
        : f.input.owningLifecycleRelationships,
    };
    const readers = new WeakMap<
      import("./tripCoreV2PgStorage").CorePgLease,
      ReturnType<typeof createCoreUniversalSourceRead>
    >();
    const authority = createCoreSourcePgAuthority(connection, f.deps.hash, {
      readUniversalP1: async (scope, lease) => {
        let source = readers.get(lease);
        if (!source) {
          source = createCoreUniversalSourceRead(
            lease,
            scope.actorAccountId,
            scope.tripId,
          );
          readers.set(lease, source);
        }
        const firstBinding = await source.lookup(
          scope.actorAccountId,
          scope.tripId,
          scope.batchId,
        );
        if (firstBinding?.taskId !== scope.taskId) throw Error("UNIVERSAL_BINDING_SCOPE");
        const binding = await source.lookup(
          scope.actorAccountId,
          scope.tripId,
          scope.batchId,
        );
        if (!binding) throw Error("UNIVERSAL_SOURCE_RUN_UNAVAILABLE");
        await source.readManifest({
          account_id: scope.actorAccountId,
          trip_id: scope.tripId,
          import_id: scope.batchId,
          task_id: scope.taskId,
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
        publicationReads++;
        if (publicationReads === corruptOnRead)
          return { ...published, resultSha256: "0".repeat(64) };
        return scope.actorAccountId === actor &&
          scope.tripId === trip &&
          scope.batchId === published.result.batchId &&
          scope.taskId === published.result.taskId
          ? published
          : null;
      },
    });
    const request = {
      captureVersion: 2,
      ...(family !== "P1" ? { family } : {}),
      sourceId,
      batchId: published.result.batchId,
      taskId: published.result.taskId,
      token: "walk",
      requestSha256: published.result.requestSha256,
    };
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
      await admin.lease.query(
        "UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=false WHERE actor_account_id=$1::uuid",
        [actor],
      );
      await expect(authority.publishUniversalP1(actor, trip, request)).rejects.toThrow(
        family !== "P1" ? "OWNING_REVIEW_REQUIRED" : "CORE_CAPABILITY_CLOSED",
      );
      if (process.env.OTR_UNIVERSAL_CONTINUOUS_REVIEW_SQL_FIXTURE) {
        // New owning policy mode: no Source/Candidate/target/operation pins or per-Batch activation.
        await admin.lease.query(
          "UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=true,universal_p1_review_scope=$2::jsonb WHERE actor_account_id=$1::uuid",
          [
            actor,
            JSON.stringify({
              mode: "CONTINUOUS_MINIMUMS",
              version: 1,
              tripId: trip,
              families:
                process.env.OTR_UNIVERSAL_FULL_MONTH_SQL_FIXTURE === container
                  ? ["P1", "P2", "P3", "P4", "P5", "P6"]
                  : ["P1", "P3", "P4", "P5", "P6"],
              expiresAt: new Date(Date.now() + 900000).toISOString(),
            }),
          ],
        );
      } else if (family === "P5" || family === "P6") {
        const packet = new URL(
          family === "P6"
            ? "../../docs/ops/universal-p6-formal-save-20261028/"
            : "../../docs/ops/universal-p5-formal-save-20261028/",
          import.meta.url,
        );
        const fixed = JSON.parse(
          readFileSync(new URL(`${family}_REVIEW_SCOPE.json`, packet), "utf8"),
        );
        if (family === "P5") {
          expect(fixed.operatorLiteral).toBe("Coastal QA Rail");
          expect(fixed.serviceNumber).toBe("CQ101");
        } else {
          expect(fixed.title).toBe("Harbour QA Gallery Visit");
          expect(fixed.localDate).toBe("2026-11-03");
        }
        let activation = readFileSync(
          new URL(`${family}_REVIEW_ACTIVATE.sql`, packet),
          "utf8",
        );
        const identities: Record<string, string> = {
          sourceId,
          batchId: request.batchId,
          taskId: request.taskId,
          token: request.token,
          resultSha256: published.resultSha256,
          candidateId: universalP1Identity(request.taskId, request.token, "candidate"),
          targetId: universalP1Identity(request.taskId, request.token, "item"),
          operationId: universalP1Identity(request.taskId, request.token, "operation"),
          slotId: universalP1Identity(request.taskId, request.token, "slot"),
        };
        // Only disposable fixture identities differ; execute the fixed activation and field constraints.
        for (const [key, value] of Object.entries(identities))
          activation = activation.replaceAll(fixed[key], value);
        activation = activation
          .replaceAll(
            family === "P6"
              ? "c08faaf5-e019-824a-b9b2-eab5657cc8f6"
              : "5edc5aeb-e3a2-8649-9bb9-4fd9b3ac9ee5",
            f.input.runId,
          )
          .replace(
            `__${family}_FIXED_WINDOW_DEADLINE__`,
            new Date(Date.now() + 900000).toISOString(),
          );
        await admin.lease.query(
          "UPDATE public.trip_sustained_dev_policy SET universal_p1_review_scope=NULL WHERE actor_account_id=$1::uuid",
          [actor],
        );
        await admin.lease.query(activation);
      } else
        await admin.lease.query(
          "UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=true,universal_p1_review_scope=$2::jsonb WHERE actor_account_id=$1::uuid",
          [
            actor,
            JSON.stringify({
              tripId: trip,
              ...(family !== "P1"
                ? {
                    family,
                    title: family === "P3" ? "海滨住宿" : "海滨租车",
                    localDate: "2026-11-03",
                    endLocalDate: "2026-11-05",
                  }
                : {}),
              sourceId,
              batchId: request.batchId,
              taskId: request.taskId,
              token: request.token,
              resultSha256: published.resultSha256,
              candidateId: universalP1Identity(
                request.taskId,
                request.token,
                "candidate",
              ),
              targetId: universalP1Identity(request.taskId, request.token, "item"),
              operationId: universalP1Identity(
                request.taskId,
                request.token,
                "operation",
              ),
              slotId: universalP1Identity(request.taskId, request.token, "slot"),
              expiresAt: new Date(Date.now() + 900000).toISOString(),
            }),
          ],
        );
      const previewOnly = createCoreSourcePgAuthority(connection, f.deps.hash, {
        readUniversalP1: async () => ({
          result: published.result,
          resultSha256: published.resultSha256,
          runId: published.runId,
        }),
      });
      await expect(previewOnly.publishUniversalP1(actor, trip, request)).rejects.toThrow(
        reviewed ? "OWNING_REVIEW_REQUIRED" : "LIFECYCLE_QUALIFICATION_REQUIRED",
      );
      expect(
        (
          await admin.lease.query(
            "SELECT count(*) AS n FROM public.trip_source_core_v2_candidates WHERE source_id=$1::uuid",
            [sourceId],
          )
        ).rows[0].n,
      ).toBe(0);
      for (const bad of [
        { ...request, requestSha256: "f".repeat(64) },
        { ...request, taskId: randomUUID() },
        { ...request, token: "unconfirmed" },
      ])
        await expect(authority.publishUniversalP1(actor, trip, bad)).rejects.toThrow();
      await expect(
        authority.publishUniversalP1(randomUUID(), trip, request),
      ).rejects.toThrow();
      Object.assign(request, reviewed ? { sourceReview } : {});
      const publication = await authority.publishUniversalP1(actor, trip, request);
      if (reviewed)
        await expect(
          authority.publishUniversalP1(actor, trip, {
            ...request,
            sourceReview: { ...sourceReview, localDate: "2026-11-02" },
          }),
        ).rejects.toThrow("SOURCE_REVIEW_REPLAY_CONFLICT");
      expect(publication.grantsAdmission).toBe(false);
      const savedScope = (
        await admin.lease.query(
          "SELECT universal_p1_review_scope AS scope FROM public.trip_sustained_dev_policy WHERE actor_account_id=$1::uuid",
          [actor],
        )
      ).rows[0].scope;
      if (family === "P3" && process.env.OTR_UNIVERSAL_P3_RETRY_OWNED_SQL_FIXTURE) {
        const packet = new URL(
          "../../docs/ops/universal-p3-formal-save-20261026/",
          import.meta.url,
        );
        const fixed = JSON.parse(
          readFileSync(new URL("P3_REVIEW_SCOPE.json", packet), "utf8"),
        );
        const fixtureScope = { ...(savedScope as Record<string, unknown>) };
        delete fixtureScope.expiresAt;
        const scopeLiteral = "scope jsonb:='" + JSON.stringify(fixed) + "'::jsonb";
        const template = readFileSync(new URL("P3_RETRY_ACTIVATE.sql", packet), "utf8");
        expect(template).toContain(scopeLiteral);
        const retry = template
          .replace(
            scopeLiteral,
            "scope jsonb:='" +
              JSON.stringify(fixtureScope).replaceAll("'", "''") +
              "'::jsonb",
          )
          .replaceAll("f4b059c5-8241-4ffb-aa15-37fa25474543", actor)
          .replaceAll("5015f4ad-99bb-8878-8926-2561d19710c8", f.input.runId)
          .replaceAll(
            "75db2d2c1daefb75c437c159255dd9b97de502c6e7d48c449d2b3f819a3b3349",
            publication.candidateSha256,
          )
          .replaceAll(
            "__P3_FIXED_WINDOW_DEADLINE__",
            new Date(Date.now() + 800000).toISOString(),
          );
        const control = async (text: string) => {
          const session2 = session(container!);
          try {
            await session2.lease.query(text);
          } finally {
            session2.close();
          }
        };
        await admin.lease.query(
          "UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=false,universal_p1_review_scope=NULL WHERE actor_account_id=$1::uuid",
          [actor],
        );
        await expect(
          control(retry.replaceAll(publication.candidateSha256, "0".repeat(64))),
        ).rejects.toThrow("P3_SEALED_CANDIDATE_DRIFT");
        await control(retry);
        await expect(control(retry)).rejects.toThrow("P3_POLICY_DRIFT");
        expect(
          (
            await admin.lease.query(
              "SELECT count(*)::int AS n FROM public.trip_source_core_v2_candidates WHERE candidate_id=$1::uuid",
              [publication.proposedPlan.candidateIds[0]],
            )
          ).rows[0].n,
        ).toBe(1);
      }
      await admin.lease.query(
        "UPDATE public.trip_sustained_dev_policy SET universal_p1_review_scope=jsonb_set(universal_p1_review_scope,'{expiresAt}',to_jsonb((clock_timestamp()-interval '1 second')::text)) WHERE actor_account_id=$1::uuid",
        [actor],
      );
      await expect(authority.publishUniversalP1(actor, trip, request)).rejects.toThrow(
        "CORE_CAPABILITY_CLOSED",
      );
      await admin.lease.query(
        "UPDATE public.trip_sustained_dev_policy SET universal_p1_review_scope=$2::jsonb WHERE actor_account_id=$1::uuid",
        [actor, JSON.stringify(savedScope)],
      );
      publicationReads = 0;
      corruptOnRead = 3;
      await expect(
        prepareCoreSourcePlanV2(
          authority.source,
          actor,
          trip,
          publication.proposedPlan,
          f.deps.hash,
        ),
      ).rejects.toThrow("UNIVERSAL_SELECTION_STALE");
      corruptOnRead = 0;
      delayPhase = "prepare";
      measuringPrepare = true;
      const prepared = await prepareCoreSourcePlanV2(
        authority.source,
        actor,
        trip,
        publication.proposedPlan,
        f.deps.hash,
      );
      measuringPrepare = false;
      delayPhase = "";
      console.log(JSON.stringify({ prepareQueries, reviewed }));
      expect(prepareQueries).toBeLessThanOrEqual(70);
      expect(prepared.reviewSlots).toEqual([]);
      expect(prepared.readyCommands).toHaveLength(1);
      if (family === "P3" && process.env.OTR_UNIVERSAL_P3_READY_OWNED_SQL_FIXTURE) {
        const packet = new URL(
          "../../docs/ops/universal-p3-formal-save-20261026/",
          import.meta.url,
        );
        const fixed = JSON.parse(
          readFileSync(new URL("P3_REVIEW_SCOPE.json", packet), "utf8"),
        );
        const fixtureScope = { ...(savedScope as Record<string, unknown>) };
        delete fixtureScope.expiresAt;
        const ready = (
          await admin.lease.query(
            "SELECT * FROM public.trip_source_core_v2_slots WHERE output_slot_id=$1::uuid",
            [publication.proposedPlan.slots[0].slotId],
          )
        ).rows[0];
        const template = readFileSync(new URL("P3_READY_ACTIVATE.sql", packet), "utf8"),
          scopeLiteral = "scope jsonb:='" + JSON.stringify(fixed) + "'::jsonb";
        expect(template).toContain(scopeLiteral);
        let activate = template
          .replace(
            scopeLiteral,
            "scope jsonb:='" +
              JSON.stringify(fixtureScope).replaceAll("'", "''") +
              "'::jsonb",
          )
          .replaceAll("f4b059c5-8241-4ffb-aa15-37fa25474543", actor)
          .replaceAll("5015f4ad-99bb-8878-8926-2561d19710c8", f.input.runId)
          .replaceAll(
            "75db2d2c1daefb75c437c159255dd9b97de502c6e7d48c449d2b3f819a3b3349",
            publication.candidateSha256,
          )
          .replaceAll(
            "54a5e914-d4e0-8581-9169-699a1fde9780",
            publication.proposedPlan.planId,
          )
          .replaceAll(
            "__P3_FIXED_WINDOW_DEADLINE__",
            new Date(Date.now() + 800000).toISOString(),
          );
        for (const [field, pin] of [
          [
            "identity_sha256",
            "f1e2daacb68536d7cecad18cf43ff88ff86bb287df7087879a568c8b212ba655",
          ],
          [
            "intent_sha256",
            "ab17d1ab6179c624ab4300974b473de7764b6b4ec54fd16ba7b50716df1650ae",
          ],
          [
            "purpose_sha256",
            "8bf58c9e5eb63cc9948cdf87521fb7c1367af1503abfc1d0170b62d574a80402",
          ],
        ])
          activate = activate.replaceAll(pin, String(ready[field]));
        const control = async (text: string) => {
          const session2 = session(container!);
          try {
            await session2.lease.query(text);
          } finally {
            session2.close();
          }
        };
        await admin.lease.query(
          "UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=false,universal_p1_review_scope=NULL WHERE actor_account_id=$1::uuid",
          [actor],
        );
        await expect(
          control(activate.replaceAll(String(ready.intent_sha256), "0".repeat(64))),
        ).rejects.toThrow("P3_READY_SLOT_DRIFT");
        await control(activate);
        await expect(control(activate)).rejects.toThrow("P3_POLICY_DRIFT");
        expect(
          (
            await admin.lease.query(
              "SELECT count(*)::int AS n FROM public.trip_source_core_v2_slots WHERE output_slot_id=$1::uuid",
              [ready.output_slot_id],
            )
          ).rows[0].n,
        ).toBe(1);
      }
      if (family === "P5") {
        const statement = async (
          overrides: Partial<
            Record<"actor" | "trip" | "command" | "family" | "admission", string | null>
          >,
          update = false,
        ) =>
          connection.withLease(async (lease) => {
            await lease.query("BEGIN");
            try {
              await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
              const context = {
                actor,
                trip,
                command: "CREATE_ITEM",
                family: "P5",
                admission: "REVIEWED_SOURCE",
                ...overrides,
              };
              for (const [key, value] of Object.entries(context))
                if (value !== null)
                  await lease.query("SELECT set_config($1,$2,true)", [
                    "otr.core." + key,
                    value,
                  ]);
              await lease.query(
                update
                  ? "UPDATE public.itinerary_transport_services SET service_literal=service_literal WHERE false"
                  : "INSERT INTO public.itinerary_transport_services(event_id,service_key,trip_id) SELECT NULL::uuid,NULL::text,NULL::uuid WHERE false",
              );
            } finally {
              await lease.query("ROLLBACK");
            }
          });
        await statement({});
        for (const denied of [
          { family: "P4" },
          { admission: "MANUAL" },
          { actor: randomUUID() },
          { trip: randomUUID() },
          { command: "SET_TRANSPORT_DETAILS" },
        ])
          await expect(statement(denied)).rejects.toThrow("CORE_V2_CAPABILITY_CLOSED");
        await expect(statement({}, true)).rejects.toThrow("CORE_V2_CAPABILITY_CLOSED");
        for (const key of ["actor", "trip", "command", "family", "admission"] as const)
          await expect(statement({ [key]: null })).rejects.toThrow(
            "CORE_V2_CAPABILITY_CLOSED",
          );
      }
      const command = prepared.readyCommands[0],
        commands = createCorePgStorage(
          connection,
          f.deps.hash,
          {
            verify: authority.verifySourceIntent,
            canReadSourceReceipt: authority.canReadSourceReceipt,
            canReadAudit: authority.canReadAudit,
            audit: authority.audit,
            canReadOriginal: async () => false,
          },
          { sustainedDev: true, reviewedP1: true },
        );
      if (process.env.OTR_UNIVERSAL_FULL_MONTH_SQL_FIXTURE === container) {
        const reader = createCorePgReader(connection, f.deps.hash, undefined, {
          sustainedDev: true,
          reviewedP1: true,
        });
        const runtime = createSustainedDevTripPorts(
          {
            create: {} as never,
            metadata: {} as never,
            core: { hash: f.deps.hash, read: reader } as never,
          },
          true,
        )!;
        const capabilities = runtime.coreConnection.read!.capabilities!;
        const response = await coreHttpBoundary(
          new Request(
            `http://owned/v2/trips/${trip}/core/capabilities?operationId=${command.operationId}`,
          ),
          actor,
          async () => true,
          runtime.coreConnection,
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          enabledFamilies: [family],
          sourceEvidenceAvailable: true,
        });
        expect((await capabilities(actor, trip)).sourceEvidenceAvailable).toBe(false);
        expect(await capabilities(actor, trip, command.operationId)).toMatchObject({
          enabledCommands: ["CREATE_ITEM"],
          enabledFamilies: [family],
          enabledAdmissionModes: ["REVIEWED_SOURCE"],
          sourceEvidenceAvailable: true,
        });
        expect(
          (await capabilities(actor, trip, randomUUID())).sourceEvidenceAvailable,
        ).toBe(false);
        expect(
          (await capabilities(randomUUID(), trip, command.operationId)).activationState,
        ).toBe("CLOSED");
        expect(
          (await capabilities(actor, randomUUID(), command.operationId)).activationState,
        ).toBe("CLOSED");
      }
      publicationReads = 0;
      corruptOnRead = 3;
      await expect(
        executeCoreCommandV2(commands, actor, trip, command, f.deps.hash),
      ).rejects.toThrow("UNIVERSAL_SELECTION_STALE");
      expect(
        (
          await admin.lease.query(
            "SELECT count(*)::int AS n FROM public.trip_core_command_receipts WHERE operation_id=$1::uuid",
            [command.operationId],
          )
        ).rows[0].n,
      ).toBe(0);
      corruptOnRead = 0;
      delayPhase = "core-create";
      const saved = await executeCoreCommandV2(
        commands,
        actor,
        trip,
        command,
        f.deps.hash,
      );
      appendFileSync(
        "/private/tmp/otr-p1-core-query-traces-20261026.jsonl",
        JSON.stringify({ reviewed, queries: queryTraces.at(-1) }) + "\n",
      );
      delayPhase = "";
      expect(queryCounts.at(-1)).toBeLessThanOrEqual(90);
      expect(saved.projection).toBe("FULL");
      if (saved.projection !== "FULL") throw Error("EXPECTED_FULL_RECEIPT");
      expect(saved.receipt.outcome).toBe("APPLIED");
      if (family === "P6") {
        const row = (
          await admin.lease.query(
            "SELECT title,experience_family,temporal_shape,start_local_date::text,start_local_time,start_zone_id,end_local_date,description,activity_category,reservation_id FROM public.itinerary_events WHERE id=$1::uuid AND trip_id=$2::uuid",
            [command.target.id, trip],
          )
        ).rows;
        expect(row).toEqual([
          {
            title: "Harbour QA Gallery Visit",
            experience_family: "P6",
            temporal_shape: "CALENDAR",
            start_local_date: "2026-11-03",
            start_local_time: null,
            start_zone_id: null,
            end_local_date: null,
            description: null,
            activity_category: null,
            reservation_id: null,
          },
        ]);
        expect(
          (
            await admin.lease.query(
              "SELECT session_label,admission_note FROM public.trip_activity_details WHERE event_id=$1::uuid",
              [command.target.id],
            )
          ).rows,
        ).toEqual([{ session_label: null, admission_note: null }]);
      }
      if (family === "P5") {
        const service = (
          await admin.lease.query(
            "SELECT to_jsonb(s) AS body FROM public.itinerary_transport_services s WHERE event_id=$1::uuid AND trip_id=$2::uuid",
            [command.target.id, trip],
          )
        ).rows;
        expect(service).toHaveLength(1);
        expect(service[0].body).toEqual({
          ...(command.payload as any).service,
          event_id: command.target.id,
          trip_id: trip,
          provenance_refs: {},
        });
        const endpoints = (
          await admin.lease.query(
            "SELECT role,local_date::text,local_time,zone_id,instant,accepted_place_id,candidate_place_id FROM public.itinerary_transport_endpoints WHERE event_id=$1::uuid AND trip_id=$2::uuid ORDER BY role",
            [command.target.id, trip],
          )
        ).rows;
        expect(endpoints).toEqual([
          {
            role: "DESTINATION",
            local_date: null,
            local_time: null,
            zone_id: null,
            instant: null,
            accepted_place_id: null,
            candidate_place_id: null,
          },
          {
            role: "ORIGIN",
            local_date: "2026-11-03",
            local_time: null,
            zone_id: null,
            instant: null,
            accepted_place_id: null,
            candidate_place_id: null,
          },
        ]);
      }
      if (family === "P4") {
        const rental = (
          await admin.lease.query(
            "SELECT to_jsonb(r) AS body FROM public.trip_rental_details r WHERE event_id=$1::uuid AND trip_id=$2::uuid",
            [command.target.id, trip],
          )
        ).rows;
        expect(rental).toHaveLength(1);
        expect(rental[0].body).toEqual({
          event_id: command.target.id,
          trip_id: trip,
          supplier: null,
          reserved_category: null,
          or_similar: null,
          actual_vehicle_model: null,
          verified_plate: null,
        });
      }
      if (["P4", "P5", "P6"].includes(family)) {
        await admin.lease.query(
          "UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=false,universal_p1_review_scope=NULL WHERE actor_account_id=$1::uuid",
          [actor],
        );
        const rollback = readFileSync(
            new URL(
              process.env.OTR_UNIVERSAL_FULL_MONTH_SQL_FIXTURE === container
                ? "../../docs/ops/universal-product-20261028/authority/FULL_MONTH_REVIEW_ROLLBACK_CANDIDATE.sql"
                : process.env.OTR_UNIVERSAL_CONTINUOUS_REVIEW_SQL_FIXTURE
                  ? "../../docs/ops/universal-product-20261028/authority/FIVE_FAMILY_ROLLBACK_CANDIDATE.sql"
                  : family === "P6"
                    ? "../../docs/ops/universal-p6-formal-save-20261028/P6_DEV_ROLLBACK.sql"
                    : family === "P5"
                      ? "../../docs/ops/universal-p5-formal-save-20261028/P5_DEV_ROLLBACK.sql"
                      : "../../docs/ops/universal-p456-formal-save-20261027/P4_DEV_ROLLBACK.sql",
              import.meta.url,
            ),
            "utf8",
          ),
          isolatedControl = session(container!);
        try {
          await expect(isolatedControl.lease.query(rollback)).rejects.toThrow(
            process.env.OTR_UNIVERSAL_CONTINUOUS_REVIEW_SQL_FIXTURE
              ? "CONTINUOUS_ACCEPTED_SOURCE_RECOVERY_REQUIRED"
              : family === "P6"
                ? "P6_ACCEPTED_SOURCE_RECOVERY_REQUIRED"
                : family === "P5"
                  ? "P5_ACCEPTED_SOURCE_RECOVERY_REQUIRED"
                  : "P4_ACCEPTED_SOURCE_RECOVERY_REQUIRED",
          );
        } finally {
          isolatedControl.close();
        }
        if (process.env.OTR_UNIVERSAL_CONTINUOUS_REVIEW_SQL_FIXTURE) {
          // A committed Item must finish its exact Source journal after the Create policy closes.
          expect(
            (
              await authority.finalizeUniversalP1Operation(actor, trip, {
                captureVersion: 2,
                slotId: publication.proposedPlan.slots[0].slotId,
                operationId: command.operationId,
                intentSha256: saved.receipt.intentSha256,
                domainReceiptId: saved.domainReceiptId,
                receiptSha256: saved.receipt.receiptSha256,
              })
            ).state,
          ).toBe("COMPLETE");
          await expect(
            authority.publishUniversalP1(actor, trip, request),
          ).rejects.toThrow("CORE_CAPABILITY_CLOSED");
        }
        await admin.lease.query(
          "UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=true,universal_p1_review_scope=$2::jsonb WHERE actor_account_id=$1::uuid",
          [actor, JSON.stringify(savedScope)],
        );
      }
      const changed = structuredClone(command);
      (changed.payload as { core: { title: string } }).core.title = "Forged";
      await expect(
        executeCoreCommandV2(commands, actor, trip, changed, f.deps.hash),
      ).rejects.toThrow();
      await expect(
        executeCoreCommandV2(
          commands,
          actor,
          trip,
          { ...command, operationId: randomUUID() },
          f.deps.hash,
        ),
      ).rejects.toThrow();
      const slot = publication.proposedPlan.slots[0],
        finalize = {
          captureVersion: 2,
          slotId: slot.slotId,
          operationId: slot.operationId,
          intentSha256: saved.receipt.intentSha256,
          domainReceiptId: saved.domainReceiptId,
          receiptSha256: saved.receipt.receiptSha256,
        };
      delayPhase = "finalize";
      expect(
        (
          await finalizeCoreSourceSlotV2(
            authority.source,
            actor,
            trip,
            publication.proposedPlan.planId,
            finalize,
            f.deps.hash,
          )
        ).state,
      ).toBe("COMPLETE");
      delayPhase = "";
      expect(
        (await authority.finalizeUniversalP1Operation(actor, trip, finalize)).state,
      ).toBe("COMPLETE");
      await expect(
        authority.finalizeUniversalP1Operation(actor, trip, {
          ...finalize,
          operationId: randomUUID(),
        }),
      ).rejects.toThrow();
      expect(await authority.publishUniversalP1(actor, trip, request)).toEqual(
        publication,
      );
      expect(
        (
          await prepareCoreSourcePlanV2(
            authority.source,
            actor,
            trip,
            publication.proposedPlan,
            f.deps.hash,
          )
        ).readyCommands,
      ).toEqual([]);
      expect(
        (
          await admin.lease.query(
            "SELECT count(*)::integer AS count FROM public.itinerary_events WHERE id=$1::uuid AND trip_id=$2::uuid",
            [slot.target.id, trip],
          )
        ).rows[0].count,
      ).toBe(1);
      expect(
        (
          await admin.lease.query(
            "SELECT state FROM public.trip_source_runs WHERE id=$1::uuid",
            [f.input.runId],
          )
        ).rows[0].state,
      ).toBe("PENDING");
      await admin.lease.query(
        "UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=false WHERE actor_account_id=$1::uuid",
        [actor],
      );
      await expect(authority.publishUniversalP1(actor, trip, request)).rejects.toThrow(
        "CORE_CAPABILITY_CLOSED",
      );
      if (["P4", "P5", "P6"].includes(family)) {
        await admin.lease.query(
          "UPDATE public.trip_sustained_dev_policy SET universal_p1_review_scope=NULL WHERE actor_account_id=$1::uuid",
          [actor],
        );
        await admin.lease.query(
          readFileSync(
            new URL(
              process.env.OTR_UNIVERSAL_FULL_MONTH_SQL_FIXTURE === container
                ? "../../docs/ops/universal-product-20261028/authority/FULL_MONTH_REVIEW_ROLLBACK_CANDIDATE.sql"
                : process.env.OTR_UNIVERSAL_CONTINUOUS_REVIEW_SQL_FIXTURE
                  ? "../../docs/ops/universal-product-20261028/authority/FIVE_FAMILY_ROLLBACK_CANDIDATE.sql"
                  : family === "P6"
                    ? "../../docs/ops/universal-p6-formal-save-20261028/P6_DEV_ROLLBACK.sql"
                    : family === "P5"
                      ? "../../docs/ops/universal-p5-formal-save-20261028/P5_DEV_ROLLBACK.sql"
                      : "../../docs/ops/universal-p456-formal-save-20261027/P4_DEV_ROLLBACK.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        expect(
          (
            await admin.lease.query(
              family === "P6"
                ? "SELECT count(*)::int AS n FROM public.trip_activity_details WHERE event_id=$1::uuid"
                : family === "P5"
                  ? "SELECT count(*)::int AS n FROM public.itinerary_transport_services WHERE event_id=$1::uuid"
                  : "SELECT count(*)::int AS n FROM public.trip_rental_details WHERE event_id=$1::uuid",
              [command.target.id],
            )
          ).rows[0].n,
        ).toBe(1);
      }
      if (reviewed) {
        expect(phaseTimes.map((p) => p.phase)).toEqual([
          "prepare",
          "core-create",
          "finalize",
        ]);
        expect(phaseTimes.every((p) => p.ms < 30000)).toBe(true);
      }
    } finally {
      appendFileSync(
        "/private/tmp/otr-p1-lease-budgets-20261026.jsonl",
        JSON.stringify({
          reviewed,
          leaseQueryCounts: queryCounts,
          maxQueries: Math.max(...queryCounts),
          phaseTimes,
          recordedAt: new Date().toISOString(),
        }) + "\n",
      );
      admin.close();
    }
  },
  90000,
);
