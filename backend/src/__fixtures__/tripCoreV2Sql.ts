import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { CorePgLease } from "../tripCoreV2PgStorage";
import type { publicationFixture } from "./tripCoreV2CandidatePublication";
export function session(fixture: string) {
  if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(fixture))
    throw new Error("OWNED_FIXTURE_REQUIRED");
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
  let exited = false;
  proc.on("exit", () => {
    exited = true;
    const request = pending;
    pending = undefined;
    request?.reject(new Error(errors || "SQL_SESSION_LOST"));
  });
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
      if (exited) return Promise.reject(new Error(errors || "SQL_SESSION_LOST"));
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
export async function seedPublicationSource(
  admin: ReturnType<typeof session>,
  f: Awaited<ReturnType<typeof publicationFixture>>,
  account: string,
  trip: string,
  suppliedPublication?: object,
  pdfOriginal?:
    | { id: string; sha256: string; byteCount: number; optionsSha256: string }
    | { representationId: string; sha256: string; byteCount: number },
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
    [
      source,
      account,
      pdfOriginal && "representationId" in pdfOriginal
        ? pdfOriginal.representationId
        : pin.representation_id,
    ],
  );
  await admin.lease.query(
    "INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,regenerability,created_at,remote_state) VALUES($1::uuid,1,$2::uuid,1,'ORIGINAL','TEXT','UTF-8',$3,$4,$5,'NOT_APPLICABLE',clock_timestamp(),'NOT_APPLICABLE')",
    [pin.representation_id, source, pin.payload_sha256, pin.byte_count, m.text],
  );
  if (pdfOriginal && "representationId" in pdfOriginal) {
    const nativeOriginal = pdfOriginal;
    await admin.lease.query(
      "INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,mime_type,payload_sha256,byte_count,parent_ids,regenerability,created_at,remote_state,verified_at,storage_provider,storage_bucket,object_key) VALUES($1::uuid,1,$2::uuid,1,'ORIGINAL','BINARY','application/pdf',$3,$4,'{}','NOT_APPLICABLE',clock_timestamp(),'VERIFIED',clock_timestamp(),'supabase_storage','trip-source-material',$1)",
      [
        nativeOriginal.representationId,
        source,
        nativeOriginal.sha256,
        nativeOriginal.byteCount,
      ],
    );
    await admin.lease.query(
      "UPDATE public.trip_source_representations SET role='DERIVED',parent_ids=ARRAY[$2::uuid],transform_key='apple-pdfkit',transform_version='1',transform_options_sha256=repeat('0',64),regenerability='POSSIBLE' WHERE id=$1::uuid",
      [pin.representation_id, nativeOriginal.representationId],
    );
    await admin.lease.query(
      "UPDATE public.trip_sources SET source_kind='FILE',acquisition_channel='FILES' WHERE id=$1::uuid",
      [source],
    );
  } else if (pdfOriginal) {
    await admin.lease.query(
      "UPDATE public.trip_sources SET source_kind='FILE',acquisition_channel='FILES' WHERE id=$1::uuid",
      [source],
    );
    await admin.lease.query(
      "UPDATE public.trip_source_revisions SET original_representation_ids=ARRAY[$2::uuid] WHERE source_id=$1::uuid",
      [source, pdfOriginal.id],
    );
    await admin.lease.query(
      "UPDATE public.trip_source_representations SET role='DERIVED',parent_ids=ARRAY[$2::uuid],transform_key='otr.pdf.literal-text',transform_version='1',transform_options_sha256=$3,regenerability='POSSIBLE' WHERE id=$1::uuid",
      [pin.representation_id, pdfOriginal.id, pdfOriginal.optionsSha256],
    );
    await admin.lease.query(
      "INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,mime_type,payload_sha256,byte_count,regenerability,created_at,storage_provider,storage_bucket,object_key,remote_state,verified_at) VALUES($1::uuid,1,$2::uuid,1,'ORIGINAL','BINARY','application/pdf',$3,$4,'NOT_APPLICABLE',clock_timestamp(),'supabase_storage','trip-source-material',$5,'VERIFIED',clock_timestamp())",
      [
        pdfOriginal.id,
        source,
        pdfOriginal.sha256,
        pdfOriginal.byteCount,
        `synthetic/${source}/${pdfOriginal.id}`,
      ],
    );
  }
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
  const legacy = suppliedPublication ?? {
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
  if (suppliedPublication && f.request.inputCatalogSha256 !== row.input_sha256)
    throw new Error("CAPTURE_RUN_INPUT_HASH_MISMATCH");
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
