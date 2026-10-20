import { readFile } from "node:fs/promises";
import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { validateCoreReadCollection } from "../../src/domain/trip/tripCoreV2Read";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { captureFlightFixture } from "../../src/data/interpretation/__fixtures__/captureFlightCoreV2";
import {
  buildCaptureFlightSourcePlanV2,
  prepareCaptureFlightSetV2,
} from "../../src/data/interpretation/captureFlightCoreV2";
import { createCoreV2Transport } from "../../src/data/api/tripCoreV2Transport";
import { importDigest } from "../../src/domain/trip/flightImportReview";
import { publicationTestHash as hash } from "./__fixtures__/tripCoreV2CandidatePublication";
import { session } from "./__fixtures__/tripCoreV2Sql";
import {
  createCorePgConnection,
  createSourcePgConnection,
} from "./tripCoreV2PgConnection";
vi.mock("../../src/data/auth/sessionAccessToken", () => ({
  sessionAccessToken: vi.fn(),
}));
vi.mock("../../src/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../../src/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
const owned = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
it.skipIf(!owned || !process.env.OTR_FLIGHT_TEXT_PORT)(
  "CLOSED real HTTP → verified TLS Node pg → TEXT custody → two Flights / exact recovery",
  async () => {
    if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(owned!))
      throw new Error("OWNED_FIXTURE_REQUIRED");
    const f = await captureFlightFixture(),
      p = f.built.publication,
      actor = f.context.accountId,
      trip = f.context.tripId;
    const ca = await readFile(process.env.OTR_FLIGHT_TEXT_CA!, "utf8");
    const base = {
      host: "localhost",
      port: Number(process.env.OTR_FLIGHT_TEXT_PORT),
      database: "postgres",
      ca,
    };
    const configs = {
      core: { ...base, password: "synthetic-core-text" },
      source: { ...base, password: "synthetic-source-text" },
    };
    let child: ChildProcess | undefined;
    let port = 0;
    const restart = async () => {
      if (child) {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
      child = fork("backend/src/__fixtures__/flightTextDevHost.ts", [], {
        execArgv: ["--import", "tsx"],
        stdio: ["ignore", "ignore", "inherit", "ipc"],
      });
      const ready = new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          child?.kill("SIGKILL");
          reject(new Error("FIXTURE_START_TIMEOUT"));
        }, 5000);
        child!.once("message", (m: { port: number }) => {
          clearTimeout(timer);
          resolve(m.port);
        });
        child!.once("exit", () => {
          clearTimeout(timer);
          reject(new Error("FIXTURE_START_FAILED"));
        });
      });
      child.send({ actor, trip, port });
      port = await ready;
    };
    await restart();
    const origin = `http://127.0.0.1:${port}`;
    const request = (path: string, input?: unknown, token = "synthetic-owner") =>
      fetch(origin + `/v2/trips/${trip}/` + path, {
        method: input === undefined ? "GET" : "POST",
        headers: { Authorization: "Bearer " + token },
        body: input === undefined ? undefined : JSON.stringify(input),
      });
    const admin = session(owned!);
    try {
      // Local fixture authorization only: retain all function bodies and integrity triggers.
      await admin.lease.query(
        "ALTER TABLE public.trip_source_command_gate DROP CONSTRAINT trip_source_gate_closed",
      );
      await admin.lease.query("UPDATE public.trip_source_command_gate SET enabled=true");
      await admin.lease.query(
        "ALTER TABLE public.trip_import_admission_gate DROP CONSTRAINT trip_import_admission_gate_flight_admission_enabled_check",
      );
      await admin.lease.query(
        "UPDATE public.trip_import_admission_gate SET flight_admission_enabled=true",
      );
      for (const t of [
        "trip_sources",
        "trip_source_revisions",
        "trip_source_representations",
        "trip_source_actions",
      ]) {
        await admin.lease.query(
          `ALTER TABLE public.${t} DISABLE TRIGGER trip_source_mutation_guard`,
        );
        await admin.lease.query(
          `ALTER TABLE public.${t} DISABLE TRIGGER trip_source_statement_guard`,
        );
        await admin.lease.query(
          `GRANT SELECT,INSERT,UPDATE ON public.${t} TO otr_trip_source_writer`,
        );
        await admin.lease.query(
          `CREATE POLICY text_runtime_fixture ON public.${t} TO otr_trip_source_writer USING(true) WITH CHECK(true)`,
        );
      }
      await admin.lease.query(
        "GRANT SELECT,INSERT,UPDATE ON public.trip_source_operations TO otr_trip_source_writer",
      );
      await admin.lease.query(
        "CREATE POLICY text_runtime_fixture ON public.trip_source_operations TO otr_trip_source_writer USING(true) WITH CHECK(true)",
      );
      for (const t of ["trips", "trip_members", "journey_members"]) {
        await admin.lease.query(
          `GRANT SELECT,UPDATE ON public.${t} TO otr_trip_source_writer`,
        );
        await admin.lease.query(
          `CREATE POLICY text_runtime_fixture ON public.${t} TO otr_trip_source_writer USING(true)`,
        );
      }
      await admin.lease.query(
        "DO $$DECLARE c record;BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND contype='c' LOOP EXECUTE format('ALTER TABLE public.trip_core_activation_gate DROP CONSTRAINT %I',c.conname);END LOOP;END$$",
      );
      await admin.lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=true,enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT','QUALIFY_FLIGHT'],enabled_families=ARRAY['P2'],enabled_admission_modes=ARRAY['REVIEWED_SOURCE']",
      );
      for (const code of ["AKL", "CHC"])
        await admin.lease.query(
          "INSERT INTO public.trip_core_airport_identities(namespace,issuer,airport_code,identity_id,valid_from,valid_until,registry_version,registry_sha256,enabled) VALUES('IATA_AIRPORT','IATA',$1,'IATA_AIRPORT:'||$1,'2020-01-01','2030-12-31','synthetic/1',repeat('d',64),true)",
          [code],
        );
      const m = f.batch.request.materials[0],
        pin = m.pin;
      const d = {
        id: pin.representation_id,
        material_kind: "TEXT",
        original_filename: null,
        part_key: null,
        mime_type: null,
        encoding: "UTF-8",
        payload_sha256: pin.payload_sha256,
        byte_count: pin.byte_count,
        text_content: m.text,
        locator_uri: null,
      };
      const descriptor = Object.values(d);
      const key = randomUUID(),
        op = randomUUID();
      const captureHash = await importDigest(
        "otr-source-capture-v1",
        [1, p.sourceId, 1, null, [d.id], "AS_SUPPLIED", "ACQUISITION", null, null],
        hash,
      );
      const acquisitionHash = await importDigest(
        "otr-source-acquisition-v1",
        [
          1,
          trip,
          actor,
          p.sourceId,
          key,
          "TEXT",
          "PASTE",
          null,
          "UNKNOWN",
          captureHash,
          descriptor,
        ],
        hash,
      );
      const input = {
        contract_version: 1,
        command: "ACQUIRE_SOURCE",
        operation_id: op,
        operation_key: key,
        actor_account_id: actor,
        trip_id: trip,
        source_id: p.sourceId,
        operation_sha256: await importDigest(
          "otr-source-command-v1",
          [
            1,
            "ACQUIRE_SOURCE",
            op,
            key,
            actor,
            trip,
            p.sourceId,
            [
              key,
              acquisitionHash,
              ["TEXT", "PASTE", null, "UNKNOWN"],
              ["AS_SUPPLIED", captureHash],
              descriptor,
            ],
          ],
          hash,
        ),
        payload: {
          acquisition_key: key,
          acquisition_sha256: acquisitionHash,
          source_input: {
            source_kind: "TEXT",
            acquisition_channel: "PASTE",
            captured_at: null,
            capture_time_basis: "UNKNOWN",
          },
          capture: { completeness: "AS_SUPPLIED", capture_sha256: captureHash },
          original: d,
        },
      };
      const first = await request("sources/acquire", input);
      expect(first.status).toBe(200);
      const receipt = await first.json();
      expect(receipt.result_material_revision).toBe(1);
      // Discard the acquisition response and kill the backend process; exact replay recovers it.
      await restart();
      expect(await (await request("sources/acquire", input)).json()).toEqual(receipt);
      expect((await request("sources/acquire", input, "invalid")).status).toBe(401);
      expect((await request("sources/acquire", input, "synthetic-other")).status).toBe(
        403,
      );
      expect(
        (
          await request("sources/acquire", {
            ...input,
            payload: {
              ...input.payload,
              original: { ...d, text_content: d.text_content + "changed" },
            },
          })
        ).status,
      ).toBe(422);
      const runResponse = await request(
        "sources/runs/publish",
        f.built.sourcePublication,
      );
      expect(runResponse.status).toBe(200);
      const run = await runResponse.json();
      expect(run.input_sha256).toBe(p.inputCatalogSha256);
      expect(
        await (await request("sources/runs/publish", f.built.sourcePublication)).json(),
      ).toEqual(run);
      expect(
        (
          await request(
            "sources/runs/publish",
            {
              ...f.built.sourcePublication,
              id: randomUUID(),
              operation_key: randomUUID(),
            },
            "synthetic-other",
          )
        ).status,
      ).toBe(409);
      const drift = { ...input, operation_id: randomUUID() };
      drift.operation_sha256 = await importDigest(
        "otr-source-command-v1",
        [
          1,
          "ACQUIRE_SOURCE",
          drift.operation_id,
          key,
          actor,
          trip,
          p.sourceId,
          [
            key,
            acquisitionHash,
            ["TEXT", "PASTE", null, "UNKNOWN"],
            ["AS_SUPPLIED", captureHash],
            descriptor,
          ],
        ],
        hash,
      );
      expect((await request("sources/acquire", drift)).status).toBe(409);
      const identities = p.candidates.map((c) => ({
        candidateId: c.candidateId,
        itemId: randomUUID(),
        createSlotId: randomUUID(),
        createOperationId: randomUUID(),
        qualifySlotId: randomUUID(),
        qualifyOperationId: randomUUID(),
      }));
      const plan = buildCaptureFlightSourcePlanV2(p, randomUUID(), identities);
      let lost = false;
      const transport = createCoreV2Transport(
        f.getAccountId,
        hash,
        {
          baseUrl: origin,
          fetchImplementation: async (url, init) => {
            const r = await fetch(url, init);
            if (lost && init?.method === "POST") {
              lost = false;
              throw new TypeError("SYNTHETIC_RESPONSE_LOSS");
            }
            return r;
          },
        },
        async () => ({ token: "synthetic-owner", userId: actor }),
      );
      let prepared = (
        await prepareCaptureFlightSetV2(
          f.context,
          f.built,
          plan.planId,
          identities,
          transport,
        )
      ).preparation;
      const recovered: string[] = [];
      for (let phase = 0; phase < 2; phase++) {
        expect(prepared.readyCommands).toHaveLength(2);
        for (const cmd of prepared.readyCommands) {
          lost = true;
          await expect(transport.submit(f.context, cmd)).rejects.toThrow();
          await restart();
          const r = await transport.receipt(f.context, cmd.operationId);
          expect(r?.projection).toBe("FULL");
          if (r?.projection !== "FULL") throw new Error("MISSING_RECEIPT");
          recovered.push(cmd.operationId);
          expect(await transport.submit(f.context, cmd)).toEqual(r);
          const slot = plan.slots.find((s) => s.operationId === cmd.operationId)!;
          expect(
            (
              await transport.finalizeSourceSlot(f.context, plan.planId, {
                captureVersion: 2,
                slotId: slot.slotId,
                operationId: cmd.operationId,
                intentSha256: r.receipt.intentSha256,
                domainReceiptId: r.domainReceiptId,
                receiptSha256: r.receipt.receiptSha256,
              })
            ).state,
          ).toBe("COMPLETE");
        }
        prepared = await transport.prepareSourcePlan(f.context, plan);
      }
      expect(prepared.readyCommands).toHaveLength(0);
      const collection = await transport.collection(f.context);
      expect(collection.manifest.rosters.find((r) => r.kind === "ITEM")?.count).toBe(2);
      const checked = await validateCoreReadCollection(
        collection.manifest,
        collection.pages,
        actor,
        trip,
        hash,
      );
      for (const id of identities)
        expect(
          checked.graph.itinerary_events.find((item) => item.id === id.itemId)
            ?.semantic_revision,
        ).toBe(2);
      await createCorePgConnection(configs.core).withLease(async (lease) => {
        await lease.query("BEGIN");
        const ssl = (
          await lease.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()")
        ).rows;
        expect(ssl[0].ssl).toBe(true);
        await lease.query("COMMIT");
      });
      const privateRead = await request("core/collection", undefined, "synthetic-other");
      expect(privateRead.status).toBe(200);
      const redacted = JSON.stringify(await privateRead.json());
      expect(redacted).not.toContain(p.sourceId);
      expect(redacted).not.toContain("track-c/field-evidence");
      expect(
        (
          await fetch(origin + `/v2/trips/${randomUUID()}/core/collection`, {
            headers: { Authorization: "Bearer synthetic-owner" },
          })
        ).status,
      ).toBe(404);
      const rows = (
        await admin.lease.query(
          "SELECT payload_sha256,byte_count,text_content FROM public.trip_source_representations WHERE id=$1::uuid",
          [d.id],
        )
      ).rows;
      expect(rows[0]).toMatchObject({
        payload_sha256: d.payload_sha256,
        text_content: d.text_content,
      });
      for (const config of [
        { ...configs.core, ca: undefined },
        { ...configs.core, host: "127.0.0.1" },
        { ...configs.core, password: "incorrect" },
      ])
        await expect(
          createCorePgConnection(config).withLease(async () => undefined),
        ).rejects.toThrow();
      await createSourcePgConnection(configs.source).withLease(async (lease) => {
        await lease.query("BEGIN");
        await expect(
          lease.query("SELECT * FROM public.itinerary_events"),
        ).rejects.toThrow();
        await lease.query("ROLLBACK");
      });
      await createCorePgConnection(configs.core).withLease(async (lease) => {
        await lease.query("BEGIN");
        await expect(
          lease.query("SELECT text_content FROM public.trip_source_representations"),
        ).rejects.toThrow();
        await lease.query("ROLLBACK");
      });
      console.info(
        JSON.stringify({
          classification: "CP_FLIGHT_DEV_02_LOCAL_HTTP_NODE_PG_TLS",
          sourceId: p.sourceId,
          exactTextSha256: d.payload_sha256,
          itemIds: identities.map((i) => i.itemId),
          recoveredOperationIds: recovered,
          originalCopies: rows.length,
          privateSourceLeakage: false,
          backendProcessRestarts: 5,
          tlsVerified: true,
          hostnameAndCaAndCredentialNegatives: true,
          hosted: false,
        }),
      );
    } finally {
      try {
        await admin.lease.query(
          "UPDATE public.trip_core_activation_gate SET runtime_enabled=false,enabled_commands='{}',enabled_families='{}',enabled_admission_modes='{}'",
        );
        await admin.lease.query(
          "UPDATE public.trip_source_command_gate SET enabled=false",
        );
        await admin.lease.query(
          "UPDATE public.trip_import_admission_gate SET flight_admission_enabled=false",
        );
      } finally {
        admin.close();
        if (child) {
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
        }
      }
    }
  },
  60000,
);
