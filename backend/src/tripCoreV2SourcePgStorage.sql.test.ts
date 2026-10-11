import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createCoreSourcePgStorageV2 } from "./tripCoreV2SourcePgStorage";
import {
  prepareCoreSourcePlanV2,
  readCoreSourcePlanV2,
  finalizeCoreSourceSlotV2,
} from "./tripCoreV2Source";
import {
  createCorePgStorage,
  readCorePgOperation,
  lockCorePgActor,
  type CorePgLease,
} from "./tripCoreV2PgStorage";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import { createCoreSourcePgAuthority } from "./tripCoreV2SourcePgAuthority";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { flightCommandLeaves } from "../../src/domain/trip/flightAdmission";
import {
  publicationFixture,
  publicationTestHash,
} from "./__fixtures__/tripCoreV2CandidatePublication";
const owned = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
function session(fixture: string) {
  const proc = spawn(
    "/opt/homebrew/bin/docker",
    [
      "exec",
      "-i",
      fixture,
      "psql",
      "-XqAt",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { stdio: "pipe" },
  );
  let output = "",
    errors = "",
    pending:
      | {
          marker: string;
          resolve: (value: { rows: Record<string, unknown>[] }) => void;
          reject: (error: Error) => void;
        }
      | undefined;
  proc.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  proc.stdout.on("data", (chunk) => {
    output += chunk;
    if (pending && output.includes(pending.marker + "\n")) {
      const text = output.slice(0, output.indexOf(pending.marker)).trim();
      output = output.slice(output.indexOf(pending.marker) + pending.marker.length + 1);
      const request = pending;
      pending = undefined;
      try {
        request.resolve({ rows: text ? JSON.parse(text) : [] });
      } catch {
        request.reject(new Error(text));
      }
    }
  });
  proc.on("exit", () => pending?.reject(new Error(errors || "SQL_SESSION_LOST")));
  const literal = (value: unknown) =>
    value === null
      ? "NULL"
      : typeof value === "boolean"
        ? String(value)
        : "'" + String(value).replaceAll("'", "''") + "'";
  const lease: CorePgLease = {
    retire() {
      proc.kill();
    },
    query(sql, params = []) {
      if (pending) throw new Error("CONCURRENT_SQL_TEST_QUERY");
      const bound = sql.replace(/\$(\d+)/g, (_, n) => literal(params[Number(n) - 1]));
      const statement = /^SELECT\b/i.test(bound)
        ? `SELECT coalesce(jsonb_agg(q),'[]'::jsonb) FROM (${bound}) q;`
        : bound + ";";
      return new Promise((resolve, reject) => {
        const marker = randomUUID();
        pending = { marker, resolve, reject };
        proc.stdin.write(statement + "\n\\echo " + marker + "\n");
      });
    },
  };

  return {
    lease,
    close() {
      proc.stdin.end();
      proc.kill();
    },
  };
}
async function seedPublicationSource(
  admin: ReturnType<typeof session>,
  f: Awaited<ReturnType<typeof publicationFixture>>,
  account: string,
  trip: string,
) {
  const m = f.materials[0],
    pin = m.pin,
    source = f.request.sourceId,
    run = f.request.runId;
  await admin.lease.query("BEGIN");
  await admin.lease.query("SET CONSTRAINTS ALL DEFERRED");
  for (const t of [
    "trip_sources",
    "trip_source_revisions",
    "trip_source_representations",
  ])
    await admin.lease.query(`ALTER TABLE public.${t} DISABLE TRIGGER USER`);
  await admin.lease.query(
    "INSERT INTO public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision) VALUES($1::uuid,$2::uuid,$3::uuid,$1,repeat('0',64),'TEXT','PASTE','UNKNOWN',clock_timestamp(),1,1)",
    [source, trip, account],
  );
  await admin.lease.query(
    "INSERT INTO public.trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) VALUES($1::uuid,1,clock_timestamp(),$2::uuid,$1,repeat('0',64),ARRAY[$3::uuid],'AS_SUPPLIED','ACQUISITION')",
    [source, account, pin.representation_id],
  );
  await admin.lease.query(
    "INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,regenerability,created_at,remote_state) VALUES($1::uuid,1,$2::uuid,1,'ORIGINAL','TEXT','UTF-8',$3,$4,$5,'NOT_APPLICABLE',clock_timestamp(),'NOT_APPLICABLE')",
    [pin.representation_id, source, pin.payload_sha256, pin.byte_count, m.text],
  );
  await admin.lease.query("SET CONSTRAINTS ALL IMMEDIATE");
  for (const t of [
    "trip_sources",
    "trip_source_revisions",
    "trip_source_representations",
  ])
    await admin.lease.query(`ALTER TABLE public.${t} ENABLE TRIGGER USER`);
  await admin.lease.query("COMMIT");
  await admin.lease.query(
    "ALTER TABLE public.trip_import_admission_gate DROP CONSTRAINT IF EXISTS trip_import_admission_gate_flight_admission_enabled_check",
  );
  await admin.lease.query(
    "UPDATE public.trip_import_admission_gate SET flight_admission_enabled=true",
  );
  await admin.lease.query(
    "GRANT UPDATE ON public.trip_sources TO otr_trip_source_writer",
  );
  await admin.lease.query(
    "GRANT SELECT,UPDATE ON public.trips,public.trip_members,public.journey_members TO otr_trip_source_writer",
  );
  for (const t of ["trips", "trip_members", "journey_members"])
    await admin.lease.query(
      `DROP POLICY IF EXISTS source_sql_fixture_read ON public.${t}`,
    );
  for (const t of ["trips", "trip_members", "journey_members"])
    await admin.lease.query(
      `CREATE POLICY source_sql_fixture_read ON public.${t} TO otr_trip_source_writer USING(true)`,
    );
  await admin.lease.query("SET SESSION AUTHORIZATION otr_trip_source_command_gateway");
  const legacy = {
    id: run,
    operation_key: run,
    scope_source_ids: [source],
    extractor_key: "synthetic-flight-source",
    extractor_version: "1",
    extractor_options_sha256: "0".repeat(64),
    inputs: [pin],
    candidates: [
      {
        id: randomUUID(),
        candidate_key: "source-evidence",
        candidate_kind: "TRANSPORT",
        proposal_version: 1,
        proposal: {
          fields: { title: { proposed_value: "NZ1", input_ids: [pin.id] } },
        },
      },
    ],
    predecessors: [],
    lineage: [],
  };
  const row = (
    await admin.lease.query(
      "SELECT public.trip_source_publish_flight_run($1::uuid,$2::uuid,$3) AS run",
      [account, trip, JSON.stringify(legacy)],
    )
  ).rows[0].run as { input_sha256: string };
  f.request.inputCatalogSha256 = row.input_sha256;
  await admin.lease.query("RESET SESSION AUTHORIZATION");
  await admin.lease.query(
    "UPDATE public.trip_import_admission_gate SET flight_admission_enabled=false",
  );
  for (const code of ["AKL", "CHC"])
    await admin.lease.query(
      "INSERT INTO public.trip_core_airport_identities(namespace,issuer,airport_code,identity_id,valid_from,valid_until,registry_version,registry_sha256,enabled) VALUES('IATA_AIRPORT','IATA',$1,'IATA_AIRPORT:'||$1,'2020-01-01','2030-12-31','synthetic/1',repeat('d',64),true) ON CONFLICT DO NOTHING",
      [code],
    );
}
// This proves the SQL adapter in a UUID-owned, network-none clone, not the deployed Node pg driver.
it.skipIf(!owned)(
  "owns sealed legacy catalogs and durable REVIEW replay without promoting unverified identity",
  async () => {
    if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(owned!))
      throw new Error("OWNED_FIXTURE_REQUIRED");
    const admin = session(owned!);
    const account = "00000000-0000-4000-8000-000000000002",
      other = "00000000-0000-4000-8000-000000000003",
      trip = "10000000-0000-4000-8000-000000000001";
    const source = randomUUID(),
      rep = randomUUID(),
      run = randomUUID(),
      pin = randomUUID(),
      planId = randomUUID(),
      candidates = [randomUUID(), randomUUID()];
    const text = "Synthetic NZ1 AKL CHC 2026-12-17; NZ2 CHC AKL 2026-12-20.";
    const digest = createHash("sha256").update(text).digest("hex"),
      hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    const publication = {
      id: run,
      operation_key: run,
      scope_source_ids: [source],
      extractor_key: "synthetic-flight-source",
      extractor_version: "1",
      extractor_options_sha256: "0".repeat(64),
      inputs: [
        {
          id: pin,
          source_id: source,
          material_revision: 1,
          representation_id: rep,
          payload_sha256: digest,
          byte_count: Buffer.byteLength(text),
          observed_source_row_revision: 1,
          historical_selection: false,
        },
      ],
      candidates: candidates.map((id, i) => ({
        id,
        candidate_key: `flight${i}`,
        candidate_kind: "TRANSPORT",
        proposal_version: 1,
        proposal: {
          fields: {
            title: {
              proposed_value: `NZ${i + 1}`,
              input_ids: [pin],
              locators: [
                {
                  kind: "WHOLE",
                  input_id: pin,
                  page: null,
                  region: null,
                  start: null,
                  end: null,
                },
              ],
            },
          },
        },
      })),
      predecessors: [],
      lineage: [],
    };
    const request = {
      captureVersion: 2,
      planId,
      sourceId: source,
      sourceRevision: 1,
      mode: "REVIEWED_SOURCE",
      policyVersion: null,
      candidateIds: candidates,
      slots: candidates.map((candidateId, i) => {
        const target = randomUUID();
        return {
          slotId: randomUUID(),
          slotKey: "flight",
          candidateId,
          targetKind: "ITEM",
          target: { kind: "ITEM", id: target },
          command: "CREATE_SPARSE_FLIGHT",
          operationId: randomUUID(),
          dependsOn: [],
          selectedFields: ["flightNumberLiteral", "departureDate"],
          evidenceRefs: { service: [`track-c/field-evidence/${candidateId}/service`] },
          baseVector: [{ kind: "ITEM", id: target, revision: null }],
          payload: {
            flightNumberLiteral: `NZ${i + 1}`,
            departureDate: i === 0 ? "2026-12-17" : "2026-12-20",
          },
        };
      }),
    };
    const businessSql =
      "SELECT jsonb_build_object(" +
      [
        "itinerary_events",
        "itinerary_reservations",
        "trip_entitlements",
        "trip_operational_documents",
        "trip_core_command_receipts",
        "expenses",
        "trip_members",
        "journey_members",
        "receipt_assets",
      ]
        .map(
          (table) =>
            `'${table}',(SELECT encode(digest(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]'),'sha256'),'hex') FROM public.${table} r)`,
        )
        .join(",") +
      ") AS hashes";
    const connect = (principal = "otr_trip_core_v2_gateway") => ({
      withLease: async <T>(work: (lease: CorePgLease) => Promise<T>) => {
        const s = session(owned!);
        try {
          await s.lease.query("SET SESSION AUTHORIZATION " + principal);
          return await work(s.lease);
        } finally {
          s.close();
        }
      },
    });
    try {
      const businessBefore = (await admin.lease.query(businessSql)).rows[0];
      const before = (
        await admin.lease.query(
          "SELECT (SELECT count(*)::int FROM public.itinerary_events) items,(SELECT count(*)::int FROM public.itinerary_reservations) bookings,(SELECT count(*)::int FROM public.trip_entitlements) tickets,(SELECT count(*)::int FROM public.trip_operational_documents) documents,(SELECT count(*)::int FROM public.trip_core_command_receipts) receipts",
        )
      ).rows[0];
      await admin.lease.query("BEGIN");
      await admin.lease.query("SET CONSTRAINTS ALL DEFERRED");
      for (const t of [
        "trip_sources",
        "trip_source_revisions",
        "trip_source_representations",
      ])
        await admin.lease.query(`ALTER TABLE public.${t} DISABLE TRIGGER USER`);
      await admin.lease.query(
        "INSERT INTO public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision) VALUES($1::uuid,$2::uuid,$3::uuid,$1,repeat('0',64),'TEXT','PASTE','UNKNOWN',clock_timestamp(),1,1)",
        [source, trip, account],
      );
      await admin.lease.query(
        "INSERT INTO public.trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) VALUES($1::uuid,1,clock_timestamp(),$2::uuid,$1,repeat('0',64),ARRAY[$3::uuid],'AS_SUPPLIED','ACQUISITION')",
        [source, account, rep],
      );
      await admin.lease.query(
        "INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,regenerability,created_at,remote_state) VALUES($1::uuid,1,$2::uuid,1,'ORIGINAL','TEXT','UTF-8',$3,$4,$5,'NOT_APPLICABLE',clock_timestamp(),'NOT_APPLICABLE')",
        [rep, source, digest, Buffer.byteLength(text), text],
      );
      await admin.lease.query("SET CONSTRAINTS ALL IMMEDIATE");
      for (const t of [
        "trip_sources",
        "trip_source_revisions",
        "trip_source_representations",
      ])
        await admin.lease.query(`ALTER TABLE public.${t} ENABLE TRIGGER USER`);
      await admin.lease.query("COMMIT");
      // Only this disposable clone opens legacy publication to create the actual sealed fixture.
      await admin.lease.query(
        "ALTER TABLE public.trip_import_admission_gate DROP CONSTRAINT trip_import_admission_gate_flight_admission_enabled_check",
      );
      await admin.lease.query(
        "UPDATE public.trip_import_admission_gate SET flight_admission_enabled=true",
      );
      await admin.lease.query(
        "GRANT UPDATE ON public.trip_sources TO otr_trip_source_writer",
      );
      await admin.lease.query(
        "GRANT SELECT,UPDATE ON public.trips,public.trip_members,public.journey_members TO otr_trip_source_writer",
      );
      for (const t of ["trips", "trip_members", "journey_members"])
        await admin.lease.query(
          `CREATE POLICY source_sql_fixture_read ON public.${t} TO otr_trip_source_writer USING(true)`,
        );
      await admin.lease.query(
        "SET SESSION AUTHORIZATION otr_trip_source_command_gateway",
      );
      const published = (
        await admin.lease.query(
          "SELECT public.trip_source_publish_flight_run($1::uuid,$2::uuid,$3) AS run",
          [account, trip, JSON.stringify(publication)],
        )
      ).rows[0].run;
      expect(published).toMatchObject({ id: run, state: "READY", generation: 1 });
      expect(
        (
          await admin.lease.query(
            "SELECT public.trip_source_publish_flight_run($1::uuid,$2::uuid,$3) AS run",
            [account, trip, JSON.stringify(publication)],
          )
        ).rows[0].run,
      ).toEqual(published);
      await admin.lease.query("RESET SESSION AUTHORIZATION");
      await admin.lease.query(
        "UPDATE public.trip_import_admission_gate SET flight_admission_enabled=false",
      );
      const storage = createCoreSourcePgStorageV2(connect());
      await storage.withLockedSourcePlan(
        { actorAccountId: account, tripId: trip, planId, sourceId: source },
        async (tx) => {
          const catalog = await tx.readSealedCatalog();
          expect(catalog.candidates).toHaveLength(2);
          expect(catalog.inputs[0]).toMatchObject({ id: pin, payload_sha256: digest });
          expect(catalog.candidates.every((c) => c.identityFacts === null)).toBe(true);
        },
      );
      // REVIEW persistence still honors the default CLOSED Core write gate.
      await expect(
        prepareCoreSourcePlanV2(storage, account, trip, request, hash),
      ).rejects.toThrow("CORE_V2_CAPABILITY_CLOSED");
      await admin.lease.query(
        "DO $$DECLARE c record;BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND contype='c' LOOP EXECUTE format('ALTER TABLE public.trip_core_activation_gate DROP CONSTRAINT %I',c.conname);END LOOP;END$$",
      );
      await admin.lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=true",
      );
      const prepared = await prepareCoreSourcePlanV2(
        storage,
        account,
        trip,
        request,
        hash,
      );
      expect(prepared.readyCommands).toEqual([]);
      expect(prepared.reviewSlots).toHaveLength(2);
      expect(
        prepared.reviewSlots.every((s) => s.errorCode === "UNRESOLVED_IDENTITY"),
      ).toBe(true);
      expect(
        await prepareCoreSourcePlanV2(
          createCoreSourcePgStorageV2(connect()),
          account,
          trip,
          request,
          hash,
        ),
      ).toEqual(prepared);
      const read = await readCoreSourcePlanV2(
        createCoreSourcePgStorageV2(connect()),
        account,
        trip,
        planId,
        hash,
      );
      expect(read.plan.slots).toEqual([]);
      await expect(
        prepareCoreSourcePlanV2(storage, other, trip, request, hash),
      ).rejects.toThrow("NOT_VISIBLE");
      await expect(
        prepareCoreSourcePlanV2(storage, account, randomUUID(), request, hash),
      ).rejects.toThrow("NOT_VISIBLE");
      await expect(
        prepareCoreSourcePlanV2(
          storage,
          account,
          trip,
          {
            ...request,
            slots: request.slots.map((slot, i) =>
              i === 0
                ? { ...slot, payload: { ...slot.payload, flightNumberLiteral: "NZ999" } }
                : slot,
            ),
          },
          hash,
        ),
      ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
      await expect(
        prepareCoreSourcePlanV2(
          createCoreSourcePgStorageV2(connect("service_role")),
          account,
          trip,
          request,
          hash,
        ),
      ).rejects.toThrow("CORE_PRINCIPAL_UNAVAILABLE");
      const privilege = (
        await admin.lease.query(
          "SELECT has_table_privilege('otr_trip_core_v2_gateway','public.trip_sources','SELECT') raw_gateway,has_table_privilege('otr_trip_core_v2_writer','public.trip_sources','UPDATE') legacy_update,(SELECT count(*)::int FROM public.trip_source_core_v2_intents WHERE plan_id=$1::uuid) plans,(SELECT count(*)::int FROM public.trip_source_core_v2_slots WHERE plan_id=$1::uuid) slots",
          [planId],
        )
      ).rows[0];
      expect(privilege).toEqual({
        raw_gateway: false,
        legacy_update: false,
        plans: 1,
        slots: 0,
      });
      await admin.lease.query("ALTER TABLE public.trip_sources DISABLE TRIGGER USER");
      await admin.lease.query(
        "UPDATE public.trip_sources SET row_revision=row_revision+1 WHERE id=$1::uuid",
        [source],
      );
      await admin.lease.query("ALTER TABLE public.trip_sources ENABLE TRIGGER USER");
      await expect(
        prepareCoreSourcePlanV2(
          storage,
          account,
          trip,
          { ...request, planId: randomUUID() },
          hash,
        ),
      ).rejects.toThrow("INPUT_STALE");
      const after = (
        await admin.lease.query(
          "SELECT (SELECT count(*)::int FROM public.itinerary_events) items,(SELECT count(*)::int FROM public.itinerary_reservations) bookings,(SELECT count(*)::int FROM public.trip_entitlements) tickets,(SELECT count(*)::int FROM public.trip_operational_documents) documents,(SELECT count(*)::int FROM public.trip_core_command_receipts) receipts",
        )
      ).rows[0];
      expect(after).toEqual(before);
      expect((await admin.lease.query(businessSql)).rows[0]).toEqual(businessBefore);
      await admin.lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=false",
      );
    } finally {
      admin.close();
    }
  },
  30000,
);

it.skipIf(!owned)(
  "publishes two qualified Flights, prepares both and reconciles exact same-writer receipts on their original IDs",
  async () => {
    if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(owned!))
      throw new Error("OWNED_FIXTURE_REQUIRED");
    const admin = session(owned!),
      f = await publicationFixture(true),
      account = "00000000-0000-4000-8000-000000000002",
      trip = "10000000-0000-4000-8000-000000000001",
      hash = publicationTestHash;
    f.request.candidates.forEach((c) => {
      c.accountId = account;
      c.tripId = trip;
    });
    const m = f.materials[0],
      pin = m.pin,
      source = f.request.sourceId;
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
    const authority = createCoreSourcePgAuthority(connect, hash);
    const commands = createCorePgStorage(connect, hash, {
      verify: authority.verifySourceIntent,
      canReadSourceReceipt: authority.canReadSourceReceipt,
      canReadAudit: authority.canReadAudit,
      audit: authority.audit,
      canReadOriginal: async () => false,
    });
    const unrelated =
      "SELECT jsonb_build_object(" +
      [
        "itinerary_reservations",
        "trip_entitlements",
        "trip_operational_documents",
        "expenses",
        "trip_members",
        "journey_members",
        "receipt_assets",
      ]
        .map(
          (t) =>
            `'${t}',(SELECT encode(digest(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]'),'sha256'),'hex') FROM public.${t} r)`,
        )
        .join(",") +
      ") AS hashes";
    try {
      const before = (await admin.lease.query(unrelated)).rows[0];
      await seedPublicationSource(admin, f, account, trip);
      await admin.lease.query(
        "DO $$DECLARE c record;BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND contype='c' LOOP EXECUTE format('ALTER TABLE public.trip_core_activation_gate DROP CONSTRAINT %I',c.conname);END LOOP;END$$",
      );
      await admin.lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=true,enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT','QUALIFY_FLIGHT','UPDATE_FLIGHT_FACTS'],enabled_families=ARRAY['P2'],enabled_admission_modes=ARRAY['REVIEWED_SOURCE']",
      );
      const published = await authority.publish(account, trip, f.request);
      expect(published.candidates.map((c) => c.status)).toEqual([
        "QUALIFIED",
        "QUALIFIED",
      ]);
      expect(
        await createCoreSourcePgAuthority(connect, hash).publish(
          account,
          trip,
          f.request,
        ),
      ).toEqual(published);
      await expect(
        authority.publish(account, trip, {
          ...f.request,
          candidates: f.request.candidates.map((c, i) =>
            i === 0 ? { ...c, facts: { ...c.facts, flightNumberLiteral: "NZ999" } } : c,
          ),
        }),
      ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
      const planId = randomUUID(),
        slots = f.request.candidates.flatMap((c) => {
          const target = randomUUID(),
            createId = randomUUID(),
            qualifyId = randomUUID(),
            service = c.facts.services![0],
            identityKeys = [
              `SERVICE.${service.service_key}.service_number`,
              "ORIGIN.local_date",
              "ORIGIN.authored_label",
              "DESTINATION.authored_label",
            ],
            keys = ["flightNumberLiteral", "departureDate", ...identityKeys];
          const refs = Object.fromEntries(keys.map((k) => [k, c.fieldEvidence[k]])),
            full = {
              origin: c.facts.origin!,
              destination: c.facts.destination!,
              services: c.facts.services!,
            },
            proofs = Object.fromEntries(
              Object.keys(flightCommandLeaves(full)).map((k) => [
                k,
                { kind: "TRACK_C", ref: c.fieldEvidence[k][0] },
              ]),
            );
          return [
            {
              slotId: createId,
              slotKey: "create",
              candidateId: c.candidateId,
              targetKind: "ITEM",
              target: { kind: "ITEM", id: target },
              command: "CREATE_SPARSE_FLIGHT",
              operationId: randomUUID(),
              dependsOn: [],
              selectedFields: ["flightNumberLiteral", "departureDate"],
              evidenceRefs: refs,
              baseVector: [{ kind: "ITEM", id: target, revision: null }],
              payload: {
                flightNumberLiteral: c.facts.flightNumberLiteral,
                departureDate: c.facts.departureDate,
                ...coreDefaults("member"),
              },
            },
            {
              slotId: qualifyId,
              slotKey: "qualify",
              candidateId: c.candidateId,
              targetKind: "ITEM",
              target: { kind: "ITEM", id: target },
              command: "QUALIFY_FLIGHT",
              operationId: randomUUID(),
              dependsOn: [createId],
              selectedFields: Object.keys(flightCommandLeaves(full)),
              evidenceRefs: Object.fromEntries(
                Object.keys(proofs).map((k) => [k, c.fieldEvidence[k]]),
              ),
              baseVector: null,
              payload: { ...full, proofs },
            },
          ];
        });
      const request = {
        captureVersion: 2,
        planId,
        sourceId: source,
        sourceRevision: 1,
        mode: "REVIEWED_SOURCE",
        policyVersion: null,
        candidateIds: f.request.candidates.map((c) => c.candidateId),
        slots,
      };
      let prepared = await prepareCoreSourcePlanV2(
        authority.source,
        account,
        trip,
        request,
        hash,
      );
      expect(prepared.reviewSlots.map((s) => s.errorCode)).toEqual([
        "DEPENDENCY_PENDING",
        "DEPENDENCY_PENDING",
      ]);
      expect(prepared.readyCommands).toHaveLength(2);
      expect(
        await prepareCoreSourcePlanV2(
          createCoreSourcePgAuthority(connect, hash).source,
          account,
          trip,
          request,
          hash,
        ),
      ).toEqual(prepared);
      // Exercise the actual owning writer admission boundary before any dispatch.
      const firstReady = prepared.readyCommands[0],
        firstIntent = await coreHashValue("otr-trip-core-intent-v2", firstReady, hash);
      await admin.lease.query(
        "UPDATE public.trip_core_airport_identities SET enabled=false WHERE airport_code='AKL'",
      );
      await commands.withLockedCommand(
        {
          actorAccountId: account,
          tripId: trip,
          operationId: firstReady.operationId,
          baseVector: firstReady.baseVector,
        },
        async (tx) => {
          const graph = await tx.readLockedGraph(firstReady);
          await expect(
            tx.verifyAdmission(firstReady, firstIntent, graph),
          ).rejects.toThrow("INVALID_PROVENANCE");
        },
      );
      expect(await authority.publish(account, trip, f.request)).toEqual(published);
      await admin.lease.query(
        "UPDATE public.trip_core_airport_identities SET enabled=true WHERE airport_code='AKL'",
      );
      const receipts = new Map<
        string,
        Awaited<ReturnType<typeof executeCoreCommandV2>>
      >();
      for (const [index, command] of prepared.readyCommands.entries()) {
        const receipt = await executeCoreCommandV2(
          commands,
          account,
          trip,
          command,
          hash,
        );
        expect(receipt.projection).toBe("FULL");
        if (receipt.projection !== "FULL") throw new Error("UNEXPECTED_REDACTION");
        expect(receipt.receipt.outcome).toBe("APPLIED");
        expect(receipt.receipt.audit.evidenceRefs.length).toBeGreaterThan(0);
        receipts.set(command.operationId, receipt);
        expect(
          await executeCoreCommandV2(commands, account, trip, command, hash),
        ).toEqual(receipt);
        if (index === 0) {
          const partial = await readCoreSourcePlanV2(
            createCoreSourcePgAuthority(connect, hash).source,
            account,
            trip,
            planId,
            hash,
          );
          expect(partial.status.status).toBe("PARTIAL");
        }
      }
      prepared = await prepareCoreSourcePlanV2(
        createCoreSourcePgAuthority(connect, hash).source,
        account,
        trip,
        request,
        hash,
      );
      expect(
        prepared.readyCommands.filter((c) => c.command === "QUALIFY_FLIGHT"),
      ).toHaveLength(2);
      for (const command of prepared.readyCommands.filter(
        (c) => c.command === "QUALIFY_FLIGHT",
      )) {
        expect(command.baseVector).toEqual([
          { kind: "ITEM", id: command.target.id, revision: 1 },
        ]);
        const receipt = await executeCoreCommandV2(
          commands,
          account,
          trip,
          command,
          hash,
        );
        expect(receipt.projection).toBe("FULL");
        if (receipt.projection !== "FULL") throw new Error("UNEXPECTED_REDACTION");
        expect(receipt.receipt.outcome).toBe("APPLIED");
        expect(receipt.receipt.targetVector[0].committedRevision).toBe(2);
        expect(
          await executeCoreCommandV2(commands, account, trip, command, hash),
        ).toEqual(receipt);
        receipts.set(command.operationId, receipt);
      }
      const first = receipts.get(slots[0].operationId)!,
        wrong = receipts.get(slots[2].operationId)!;
      if (first.projection !== "FULL" || wrong.projection !== "FULL")
        throw new Error("UNEXPECTED_REDACTION");
      await expect(
        finalizeCoreSourceSlotV2(
          authority.source,
          account,
          trip,
          planId,
          {
            captureVersion: 2,
            slotId: slots[0].slotId,
            operationId: first.receipt.operationId,
            intentSha256: first.receipt.intentSha256,
            domainReceiptId: wrong.domainReceiptId,
            receiptSha256: wrong.receipt.receiptSha256,
          },
          hash,
        ),
      ).rejects.toThrow("INVALID_DOMAIN_RECEIPT");
      // Direct additive-trigger acceptance only; old mutation guards are disabled in this owned fixture.
      const legacyConfirmation = randomUUID(),
        legacyPin = randomUUID(),
        recoverySlot = randomUUID(),
        revokedSlot = randomUUID();
      await admin.lease.query("BEGIN");
      await admin.lease.query("SET CONSTRAINTS ALL DEFERRED");
      for (const table of [
        "trip_source_confirmations",
        "trip_source_inputs",
        "trip_source_output_slots",
      ])
        await admin.lease.query(`ALTER TABLE public.${table} DISABLE TRIGGER USER`);
      await admin.lease.query(
        "INSERT INTO public.trip_source_confirmations(id,trip_id,actor_account_id,confirmation_key,intent_version,intent_sha256,created_at,row_revision) VALUES($1::uuid,$2::uuid,$3::uuid,$1,1,repeat('f',64),clock_timestamp(),1)",
        [legacyConfirmation, trip, account],
      );
      await admin.lease.query(
        "INSERT INTO public.trip_source_inputs(id,confirmation_id,source_id,material_revision,representation_id,payload_sha256,byte_count,observed_source_row_revision,historical_selection) VALUES($1::uuid,$2::uuid,$3::uuid,1,$4::uuid,$5,$6,1,false)",
        [
          legacyPin,
          legacyConfirmation,
          source,
          pin.representation_id,
          pin.payload_sha256,
          pin.byte_count,
        ],
      );
      for (const [slot, key, state, active, basis] of [
        [recoverySlot, "recovery", "PREPARED", true, null],
        [revokedSlot, "revoked", "CANCELED", false, "UNDISPATCHED_REVOKED"],
      ] as const)
        await admin.lease.query(
          "INSERT INTO public.trip_source_output_slots(confirmation_id,slot_id,slot_key,disposition,intended_target_kind,intended_target_id,adapter_key,adapter_version,domain_operation_key,domain_intent_sha256,reviewed_payload,support_payload,support_version,state,create_claim_active,no_commit_basis,no_commit_at) VALUES($1::uuid,$2::uuid,$3,'CREATE','ITINERARY_EVENT',$4::uuid,'itinerary-event-v1',1,$5,repeat('f',64),'{}','{}',1,$6,$7,$8,CASE WHEN $8 IS NULL THEN NULL ELSE clock_timestamp() END)",
          [
            legacyConfirmation,
            slot,
            key,
            randomUUID(),
            randomUUID(),
            state,
            active,
            basis,
          ],
        );
      await admin.lease.query("SET CONSTRAINTS ALL IMMEDIATE");
      for (const table of ["trip_source_confirmations", "trip_source_inputs"])
        await admin.lease.query(`ALTER TABLE public.${table} ENABLE TRIGGER USER`);
      await admin.lease.query(
        "ALTER TABLE public.trip_source_output_slots ENABLE TRIGGER core_v2_retained_claim_fence",
      );
      await admin.lease.query("COMMIT");
      await admin.lease.query(
        "SELECT set_config('otr.core.actor',$1,false),set_config('otr.core.trip',$2,false)",
        [account, trip],
      );
      await admin.lease.query(
        "DO $$BEGIN BEGIN INSERT INTO public.trip_source_output_slots(confirmation_id,slot_id,slot_key,disposition,state,support_version,support_payload) VALUES('" +
          legacyConfirmation +
          "',gen_random_uuid(),'fresh','CREATE','PREPARED',1,'{}');RAISE EXCEPTION 'FENCE_NOT_ENFORCED';EXCEPTION WHEN check_violation THEN IF SQLERRM<>'CORE_V2_SOURCE_CLAIM_PRESENT' THEN RAISE;END IF;END;END$$",
      );
      await admin.lease.query(
        "UPDATE public.trip_source_output_slots SET state='OUTCOME_UNKNOWN',dispatched_at=clock_timestamp() WHERE slot_id=$1::uuid",
        [recoverySlot],
      );
      expect(
        (
          await admin.lease.query(
            "SELECT state FROM public.trip_source_output_slots WHERE slot_id=$1::uuid",
            [recoverySlot],
          )
        ).rows[0].state,
      ).toBe("OUTCOME_UNKNOWN");
      await admin.lease.query(
        "DO $$BEGIN BEGIN UPDATE public.trip_source_output_slots SET state='PREPARED',create_claim_active=true,no_commit_basis=NULL,no_commit_at=NULL WHERE slot_id='" +
          revokedSlot +
          "';RAISE EXCEPTION 'REOPEN_NOT_FENCED';EXCEPTION WHEN check_violation THEN IF SQLERRM<>'CORE_V2_SOURCE_CLAIM_PRESENT' THEN RAISE;END IF;END;END$$",
      );
      // Even certified slots marked REVIEW retain their known or uncertain physical claim.
      await admin.lease.query(
        "ALTER TABLE public.trip_source_core_v2_slots DISABLE TRIGGER USER",
      );
      await admin.lease.query(
        "UPDATE public.trip_source_core_v2_slots SET state='REVIEW' WHERE source_id=$1::uuid",
        [source],
      );
      await admin.lease.query(
        "DO $$BEGIN BEGIN INSERT INTO public.trip_source_output_slots(confirmation_id,slot_id,slot_key,disposition,state,support_version,support_payload) VALUES('" +
          legacyConfirmation +
          "',gen_random_uuid(),'retained-review','CREATE','PREPARED',1,'{}');RAISE EXCEPTION 'REVIEW_RELEASED_CLAIM';EXCEPTION WHEN check_violation THEN IF SQLERRM<>'CORE_V2_SOURCE_CLAIM_PRESENT' THEN RAISE;END IF;END;END$$",
      );
      await admin.lease.query(
        "UPDATE public.trip_source_core_v2_slots SET state='READY' WHERE source_id=$1::uuid",
        [source],
      );
      await admin.lease.query(
        "ALTER TABLE public.trip_source_core_v2_slots ENABLE TRIGGER USER",
      );
      await admin.lease.query(
        "ALTER TABLE public.trip_source_output_slots ENABLE TRIGGER USER",
      );
      const nextRep = randomUUID(),
        nextText = m.text + "\nReplacement material",
        nextHash = await hash(new TextEncoder().encode(nextText));
      await admin.lease.query("BEGIN");
      await admin.lease.query("SET CONSTRAINTS ALL DEFERRED");
      for (const table of [
        "trip_sources",
        "trip_source_revisions",
        "trip_source_representations",
      ])
        await admin.lease.query(`ALTER TABLE public.${table} DISABLE TRIGGER USER`);
      await admin.lease.query(
        "INSERT INTO public.trip_source_revisions(source_id,material_revision,previous_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) VALUES($1::uuid,2,1,clock_timestamp(),$2::uuid,$3,$4,ARRAY[$5::uuid],'AS_SUPPLIED','REPLACEMENT')",
        [source, account, randomUUID(), nextHash, nextRep],
      );
      await admin.lease.query(
        "INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,regenerability,created_at,remote_state) VALUES($1::uuid,1,$2::uuid,2,'ORIGINAL','TEXT','UTF-8',$3,$4,$5,'NOT_APPLICABLE',clock_timestamp(),'NOT_APPLICABLE')",
        [nextRep, source, nextHash, new TextEncoder().encode(nextText).length, nextText],
      );
      await admin.lease.query(
        "UPDATE public.trip_sources SET current_material_revision=2,row_revision=row_revision+1 WHERE id=$1::uuid",
        [source],
      );
      await admin.lease.query("SET CONSTRAINTS ALL IMMEDIATE");
      for (const table of [
        "trip_sources",
        "trip_source_revisions",
        "trip_source_representations",
      ])
        await admin.lease.query(`ALTER TABLE public.${table} ENABLE TRIGGER USER`);
      await admin.lease.query("COMMIT");
      await expect(
        prepareCoreSourcePlanV2(
          authority.source,
          account,
          trip,
          { ...request, planId: randomUUID() },
          hash,
        ),
      ).rejects.toThrow("INPUT_STALE");
      for (const slot of slots) {
        const result = receipts.get(slot.operationId)!;
        if (result.projection !== "FULL") throw new Error("UNEXPECTED_REDACTION");
        const input = {
            captureVersion: 2,
            slotId: slot.slotId,
            operationId: slot.operationId,
            intentSha256: result.receipt.intentSha256,
            domainReceiptId: result.domainReceiptId,
            receiptSha256: result.receipt.receiptSha256,
          },
          finalized = await finalizeCoreSourceSlotV2(
            authority.source,
            account,
            trip,
            planId,
            input,
            hash,
          );
        expect(finalized.state).toBe("COMPLETE");
        expect(
          await finalizeCoreSourceSlotV2(
            createCoreSourcePgAuthority(connect, hash).source,
            account,
            trip,
            planId,
            input,
            hash,
          ),
        ).toEqual(finalized);
        expect(
          await readCorePgOperation(commands, account, trip, slot.operationId, hash),
        ).toEqual(result);
      }
      const complete = await readCoreSourcePlanV2(
        authority.source,
        account,
        trip,
        planId,
        hash,
      );
      expect(complete.status.status).toBe("COMPLETE");
      const ids = slots
          .filter((s) => s.command === "CREATE_SPARSE_FLIGHT")
          .map((s) => s.target.id),
        counts = (
          await admin.lease.query(
            "SELECT (SELECT count(*)::int FROM public.itinerary_events WHERE id IN(SELECT v::uuid FROM jsonb_array_elements_text($1::jsonb) v)) roots,(SELECT count(*)::int FROM public.trip_source_core_v2_associations WHERE source_id=$2::uuid) associations,(SELECT count(*)::int FROM public.trip_source_core_v2_slots WHERE source_id=$2::uuid) slots",
            [JSON.stringify(ids), source],
          )
        ).rows[0];
      expect(counts).toEqual({ roots: 2, associations: 4, slots: 4 });
      const endpoints = (
        await admin.lease.query(
          "SELECT source_instant_precision,source_instant FROM public.itinerary_transport_endpoints WHERE event_id=$1::uuid AND role='ORIGIN'",
          [ids[0]],
        )
      ).rows[0];
      expect(endpoints.source_instant_precision).toBe(6);
      expect((await admin.lease.query(unrelated)).rows[0]).toEqual(before);
      await admin.lease.query("ALTER TABLE public.trip_sources DISABLE TRIGGER USER");
      await admin.lease.query(
        "UPDATE public.trip_sources SET lifecycle='DELETED',deleted_at=clock_timestamp(),deleted_by=$2::uuid WHERE id=$1::uuid",
        [source, account],
      );
      await admin.lease.query("ALTER TABLE public.trip_sources ENABLE TRIGGER USER");
      await expect(
        readCoreSourcePlanV2(authority.source, account, trip, planId, hash),
      ).rejects.toThrow("NOT_VISIBLE");
      await expect(
        finalizeCoreSourceSlotV2(
          authority.source,
          account,
          trip,
          planId,
          {
            captureVersion: 2,
            slotId: slots[0].slotId,
            operationId: first.receipt.operationId,
            intentSha256: first.receipt.intentSha256,
            domainReceiptId: first.domainReceiptId,
            receiptSha256: first.receipt.receiptSha256,
          },
          hash,
        ),
      ).rejects.toThrow("NOT_VISIBLE");
      await admin.lease.query("ALTER TABLE public.trip_sources DISABLE TRIGGER USER");
      await admin.lease.query(
        "UPDATE public.trip_sources SET lifecycle='ACTIVE',deleted_at=NULL,deleted_by=NULL WHERE id=$1::uuid",
        [source],
      );
      await admin.lease.query("ALTER TABLE public.trip_sources ENABLE TRIGGER USER");
      await admin.lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=false",
      );
      expect(await authority.publish(account, trip, f.request)).toEqual(published);
      expect(
        await readCorePgOperation(commands, account, trip, slots[0].operationId, hash),
      ).toEqual(first);
    } finally {
      admin.close();
    }
  },
  60000,
);

it.skipIf(!owned)(
  "retains Source qualification claims for a manual sparse Flight and protects edited fields and CAS",
  async () => {
    if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(owned!))
      throw new Error("OWNED_FIXTURE_REQUIRED");
    const admin = session(owned!),
      f = await publicationFixture(true),
      account = "00000000-0000-4000-8000-000000000002",
      trip = "10000000-0000-4000-8000-000000000001",
      hash = publicationTestHash;
    const source = randomUUID(),
      run = randomUUID(),
      rep = randomUUID(),
      pin = randomUUID(),
      candidates = f.request.candidates.map(() => randomUUID()),
      oldIds = f.request.candidates.map((c) => c.candidateId);
    f.request.sourceId = source;
    f.request.runId = run;
    f.request.publicationId = randomUUID();
    f.materials[0].pin.source_id = source;
    f.materials[0].pin.representation_id = rep;
    f.materials[0].pin.id = pin;
    f.materials[0].text = f.materials[0].text
      .replaceAll("2026-12-17", "2026-12-21")
      .replaceAll("2026-12-20", "2026-12-22")
      .replaceAll("2026-12-16", "2026-12-20")
      .replaceAll("2026-12-19", "2026-12-21");
    f.materials[0].pin.payload_sha256 = await hash(
      new TextEncoder().encode(f.materials[0].text),
    );
    f.request.candidates.forEach((c, i) => {
      c.candidateId = candidates[i];
      c.accountId = account;
      c.tripId = trip;
      c.sourceId = source;
      c.runId = run;
      c.inputRepresentationIds = [rep];
      c.facts.departureDate = `2026-12-${21 + i}`;
      c.facts.origin!.time.local_date = c.facts.departureDate;
      c.facts.origin!.time.source_instant = `2026-12-${20 + i}T20:00:00.120000Z`;
      for (const key of Object.keys(c.fieldEvidence))
        c.fieldEvidence[key] = c.fieldEvidence[key].map((ref) =>
          ref.replace(oldIds[i], c.candidateId),
        );
    });
    f.request.evidence.forEach((e) => {
      e.candidateId = candidates[oldIds.indexOf(e.candidateId)];
      e.inputId = pin;
      e.locator.input_id = pin;
    });
    const candidate = f.request.candidates[0];
    candidate.facts.core = { title: candidate.facts.flightNumberLiteral! };
    candidate.fieldKnowledge["ROOT.title"] = "PRESENT";
    candidate.fieldEvidence["ROOT.title"] = [
      `track-c/field-evidence/${candidate.candidateId}/ROOT.title`,
    ];
    f.request.evidence.push({
      ...f.request.evidence.find(
        (e) =>
          e.candidateId === candidate.candidateId && e.fieldKey === "flightNumberLiteral",
      )!,
      fieldKey: "ROOT.title",
    });
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
      },
      authority = createCoreSourcePgAuthority(connect, hash),
      commands = createCorePgStorage(connect, hash, {
        verify: authority.verifySourceIntent,
        canReadSourceReceipt: authority.canReadSourceReceipt,
        canReadAudit: authority.canReadAudit,
        audit: authority.audit,
        canReadOriginal: async () => false,
      });
    try {
      await seedPublicationSource(admin, f, account, trip);
      await admin.lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=true,enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT','QUALIFY_FLIGHT','UPDATE_FLIGHT_FACTS','SET_ITEM_TEXT'],enabled_families=ARRAY['P2'],enabled_admission_modes=ARRAY['MANUAL','REVIEWED_SOURCE']",
      );
      expect(
        (await authority.publish(account, trip, f.request)).candidates.map(
          (c) => c.status,
        ),
      ).toEqual(["QUALIFIED", "QUALIFIED"]);
      const target = randomUUID(),
        manual = {
          contractVersion: 2,
          intentVersion: 2,
          operationId: randomUUID(),
          tripId: trip,
          command: "CREATE_SPARSE_FLIGHT",
          target: { kind: "ITEM", id: target },
          baseVector: [{ kind: "ITEM", id: target, revision: null }],
          admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
          payload: {
            flightNumberLiteral: candidate.facts.flightNumberLiteral,
            departureDate: candidate.facts.departureDate,
            ...coreDefaults("member"),
          },
        };
      const savedManual = await executeCoreCommandV2(
        commands,
        account,
        trip,
        manual,
        hash,
      );
      if (savedManual.projection !== "FULL") throw new Error("REDACTED");
      expect(savedManual.receipt.outcome).toBe("APPLIED");
      const full = {
          origin: candidate.facts.origin!,
          destination: candidate.facts.destination!,
          services: candidate.facts.services!,
        },
        keys = Object.keys(flightCommandLeaves(full)),
        qSlot = {
          slotId: randomUUID(),
          slotKey: "qualify",
          candidateId: candidate.candidateId,
          targetKind: "ITEM",
          target: { kind: "ITEM", id: target },
          command: "QUALIFY_FLIGHT",
          operationId: randomUUID(),
          dependsOn: [],
          selectedFields: keys,
          evidenceRefs: Object.fromEntries(
            keys.map((k) => [k, candidate.fieldEvidence[k]]),
          ),
          baseVector: [{ kind: "ITEM", id: target, revision: 1 }],
          payload: {
            ...full,
            proofs: Object.fromEntries(
              keys.map((k) => [
                k,
                { kind: "TRACK_C", ref: candidate.fieldEvidence[k][0] },
              ]),
            ),
          },
        },
        qPlan = {
          captureVersion: 2,
          planId: randomUUID(),
          sourceId: source,
          sourceRevision: 1,
          mode: "REVIEWED_SOURCE",
          policyVersion: null,
          candidateIds: [candidate.candidateId],
          slots: [qSlot],
        };
      const prepared = await prepareCoreSourcePlanV2(
        authority.source,
        account,
        trip,
        qPlan,
        hash,
      );
      expect(prepared.readyCommands).toHaveLength(1);
      const qualified = await executeCoreCommandV2(
        commands,
        account,
        trip,
        prepared.readyCommands[0],
        hash,
      );
      expect(qualified.projection).toBe("FULL");
      if (qualified.projection !== "FULL") throw new Error("REDACTED");
      expect(qualified.receipt.outcome).toBe("APPLIED");
      await connect.withLease(async (lease) => {
        await lease.query("BEGIN");
        await lease.query(
          "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
          [account, trip],
        );
        const actor = await lockCorePgActor(lease, account, trip);
        expect(await authority.canReadAudit(lease, actor, qualified.receipt)).toBe(true);
        const privateBefore = {
          ...qualified.receipt,
          audit: {
            ...qualified.receipt.audit,
            before: qualified.receipt.audit.after.map((snapshot) => ({
              ...snapshot,
              facts: {
                ...(snapshot.facts as object),
                field_state: {
                  secret: {
                    evidence_ref: `track-c/field-evidence/${randomUUID()}/ORIGIN.local_date`,
                  },
                },
              },
            })),
          },
        };
        expect(
          await authority.canReadSourceReceipt(lease, actor, qSlot.operationId),
        ).toBe(true);
        expect(await authority.canReadAudit(lease, actor, privateBefore)).toBe(false);
        await lease.query("ROLLBACK");
      });
      const createKeys = [
          "flightNumberLiteral",
          "departureDate",
          `SERVICE.${candidate.facts.services![0].service_key}.service_number`,
          "ORIGIN.local_date",
          "ORIGIN.authored_label",
          "DESTINATION.authored_label",
        ],
        duplicate = {
          ...qPlan,
          planId: randomUUID(),
          slots: [
            {
              slotId: randomUUID(),
              slotKey: "create",
              candidateId: candidate.candidateId,
              targetKind: "ITEM",
              target: { kind: "ITEM", id: randomUUID() },
              command: "CREATE_SPARSE_FLIGHT",
              operationId: randomUUID(),
              dependsOn: [],
              selectedFields: ["flightNumberLiteral", "departureDate"],
              evidenceRefs: Object.fromEntries(
                createKeys.map((k) => [k, candidate.fieldEvidence[k]]),
              ),
              baseVector: null,
              payload: {
                flightNumberLiteral: candidate.facts.flightNumberLiteral,
                departureDate: candidate.facts.departureDate,
                ...coreDefaults("member"),
              },
            },
          ],
        };
      duplicate.slots[0].baseVector = [
        { kind: "ITEM", id: duplicate.slots[0].target.id, revision: null },
      ] as any;
      const collision = await prepareCoreSourcePlanV2(
        authority.source,
        account,
        trip,
        duplicate,
        hash,
      );
      expect(collision.readyCommands).toEqual([]);
      expect(collision.reviewSlots[0].errorCode).toBe("OUTPUT_PURPOSE_COLLISION");
      const updateSlot = {
          ...qSlot,
          slotId: randomUUID(),
          slotKey: "title",
          command: "UPDATE_FLIGHT_FACTS",
          operationId: randomUUID(),
          selectedFields: ["ROOT.title"],
          evidenceRefs: Object.fromEntries(
            [
              "ROOT.title",
              `SERVICE.${candidate.facts.services![0].service_key}.service_number`,
              "ORIGIN.local_date",
              "ORIGIN.authored_label",
              "DESTINATION.authored_label",
            ].map((k) => [k, candidate.fieldEvidence[k]]),
          ),
          payload: {
            changes: { title: candidate.facts.core.title },
            proofs: {
              "ROOT.title": {
                kind: "TRACK_C",
                ref: candidate.fieldEvidence["ROOT.title"][0],
              },
            },
          },
          baseVector: [{ kind: "ITEM", id: target, revision: 1 }],
        },
        stale = await prepareCoreSourcePlanV2(
          authority.source,
          account,
          trip,
          { ...qPlan, planId: randomUUID(), slots: [updateSlot] },
          hash,
        );
      expect(stale.reviewSlots[0].errorCode).toBe("REVISION_CONFLICT");
      const edit = {
        ...manual,
        operationId: randomUUID(),
        command: "SET_ITEM_TEXT",
        baseVector: [{ kind: "ITEM", id: target, revision: 2 }],
        payload: { title: "My protected title" },
      };
      const edited = await executeCoreCommandV2(commands, account, trip, edit, hash);
      if (edited.projection !== "FULL") throw new Error("REDACTED");
      expect(edited.receipt.outcome).toBe("APPLIED");
      const protectedResult = await prepareCoreSourcePlanV2(
        authority.source,
        account,
        trip,
        {
          ...qPlan,
          planId: randomUUID(),
          slots: [
            {
              ...updateSlot,
              slotId: randomUUID(),
              operationId: randomUUID(),
              baseVector: [{ kind: "ITEM", id: target, revision: 3 }],
            },
          ],
        },
        hash,
      );
      expect(protectedResult.readyCommands).toEqual([]);
      expect(protectedResult.reviewSlots[0].errorCode).toBe("PROTECTED_FIELD");
      expect(
        (
          await admin.lease.query(
            "SELECT title,semantic_revision FROM public.itinerary_events WHERE id=$1::uuid",
            [target],
          )
        ).rows[0],
      ).toEqual({ title: "My protected title", semantic_revision: 3 });
      const finalize = {
        captureVersion: 2,
        slotId: qSlot.slotId,
        operationId: qSlot.operationId,
        intentSha256: qualified.receipt.intentSha256,
        domainReceiptId: qualified.domainReceiptId,
        receiptSha256: qualified.receipt.receiptSha256,
      };
      // A committed domain result does not authorize a new association after old evidence is redacted.
      await admin.lease.query(
        "ALTER TABLE public.trip_source_revisions DISABLE TRIGGER USER",
      );
      await admin.lease.query(
        "UPDATE public.trip_source_revisions SET retention_state='IDENTITY_ONLY',capture_sha256=NULL WHERE source_id=$1::uuid AND material_revision=1",
        [source],
      );
      await admin.lease.query(
        "ALTER TABLE public.trip_source_revisions ENABLE TRIGGER USER",
      );
      expect(
        (
          await finalizeCoreSourceSlotV2(
            authority.source,
            account,
            trip,
            qPlan.planId,
            finalize,
            hash,
          )
        ).state,
      ).toBe("EVIDENCE_PENDING");
      expect(
        (
          await admin.lease.query(
            "SELECT count(*)::int AS creates FROM public.trip_source_core_v2_slots WHERE source_id=$1::uuid AND command='CREATE_SPARSE_FLIGHT'",
            [source],
          )
        ).rows[0].creates,
      ).toBe(0);
      await admin.lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=false",
      );
    } finally {
      admin.close();
    }
  },
  60000,
);
