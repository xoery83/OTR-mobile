import { createHash, randomUUID } from "node:crypto";
import type { universalTaskDatabase } from "./universalTaskBootstrap";
import type {
  UniversalBatchPrepared,
  UniversalWaitingMaterials,
} from "../../src/data/api/universalImportContracts";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
import {
  OriginalBytesRequired,
  universalRetainedOriginalPrepareSchema,
} from "./universalRetainedOriginalPreparation";

type IntakeRow = {
  trip_id: string;
  manifest_sha256: string;
  state: "PREPARING" | "NEEDS_BYTES" | "RESUME_REQUIRED" | "READY";
  input_id: string | null;
  owner_run: string;
};

export function createUniversalMaterialIntake(db: ReturnType<typeof universalTaskDatabase>) {
  const read = `SELECT trip_id,manifest_sha256,state,input_id,owner_run
    FROM universal_material_intake WHERE account_id=? AND batch_id=? AND v3_manifest_json IS NULL`;
  const insert = `INSERT INTO universal_material_intake
    (account_id,trip_id,batch_id,manifest_sha256,state,input_id,owner_run)
    VALUES(?,?,?,?,'PREPARING',NULL,?) ON CONFLICT DO NOTHING`;
  const claim = `UPDATE universal_material_intake
    SET state='PREPARING',input_id=NULL,owner_run=?
    WHERE account_id=? AND batch_id=? AND owner_run=? AND state=?`;
  const settle = `UPDATE universal_material_intake SET state=?,input_id=?
    WHERE account_id=? AND batch_id=? AND owner_run=? AND state='PREPARING'`;
  const running = new Set<string>();
  const key = (account: string, batch: string) => `${account}/${batch}`;
  const row = (account: string, batch: string) =>
    db.getFirstAsync<IntakeRow>(read, account, batch);
  const waiting = (
    accountId: string, tripId: string, batchId: string,
    material: UniversalWaitingMaterials["material"],
  ): UniversalWaitingMaterials => ({ status: "WAITING_MATERIALS", accountId, tripId, batchId, material });
  return {
    async read(account: string, trip: string, batch: string) {
      const result: { row?: IntakeRow | null } = {};
      await db.withTransactionAsync(async () => { result.row = await row(account, batch); });
      const observed = result.row;
      if (!observed || observed.trip_id !== trip) return null;
      if (observed.state === "READY") return "READY" as const;
      return waiting(account, trip, batch,
        observed.state === "NEEDS_BYTES" && observed.input_id
          ? { state: "NEEDS_BYTES", inputId: observed.input_id }
          : running.has(key(account, batch))
            ? { state: "PREPARING" }
            : { state: "RESUME_REQUIRED" },
      );
    },
    async start(
      account: string,
      trip: string,
      raw: unknown,
      continueWork: (
        input: Omit<ReturnType<typeof universalRetainedOriginalPrepareSchema.parse>, "deferMaterials">,
        onStaged: () => void,
      ) => Promise<UniversalBatchPrepared>,
    ) {
      const { deferMaterials, originalUpload, ...manifest } =
        universalRetainedOriginalPrepareSchema.parse(raw);
      const { batchId: batch } = manifest;
      if (!deferMaterials || manifest.tripId !== trip ||
        manifest.retainedOriginals.some(({ acquisition }) =>
          acquisition.actor_account_id !== account || acquisition.trip_id !== trip))
        throw Error("UNIVERSAL_MATERIAL_INTAKE_SCOPE");
      const digest = createHash("sha256").update(canonicalEventJson(manifest as Json)).digest("hex");
      const id = key(account, batch);
      const owner = randomUUID();
      let response: UniversalWaitingMaterials | undefined;
      let claimed = false;
      try {
        await db.withImmediateTransactionAsync(async () => {
          if (!originalUpload) await db.runAsync(insert, account, trip, batch, digest, owner);
          const found = await row(account, batch);
          if (!found || found.trip_id !== trip || found.manifest_sha256 !== digest)
            throw Error("UNIVERSAL_MATERIAL_INTAKE_SCOPE");
          if (running.has(id)) {
            response = waiting(account, trip, batch, { state: "PREPARING" });
          } else if (found.state === "NEEDS_BYTES" && !originalUpload) {
            response = waiting(account, trip, batch, { state: "NEEDS_BYTES", inputId: found.input_id! });
          } else if (originalUpload && found.state !== "NEEDS_BYTES") {
            // First recover the owning Source state after an unknown or completed upload.
            response = waiting(account, trip, batch, { state: "RESUME_REQUIRED" });
          } else {
            if (originalUpload && found.input_id !== originalUpload.inputId)
              throw Error("UNIVERSAL_MATERIAL_INTAKE_SCOPE");
            const result = await db.runAsync(claim, owner, account, batch, found.owner_run, found.state) as { changes: number | bigint };
            claimed = Number(result.changes) === 1;
            if (claimed) running.add(id);
          }
        });
      } catch (error) {
        if (claimed) running.delete(id);
        throw error;
      }
      if (response) return response;
      if (!claimed) return waiting(account, trip, batch, { state: "RESUME_REQUIRED" });
      const finish = (state: IntakeRow["state"], inputId: string | null) =>
        db.withImmediateTransactionAsync(async () => {
          await db.runAsync(settle, state, inputId, account, batch, owner);
        });
      const staged = Promise.withResolvers<UniversalWaitingMaterials>();
      const work = new Promise<void>((resolve) => setImmediate(resolve)).then(async () => {
        try {
          const prepared = await continueWork(
            { ...manifest, ...(originalUpload ? { originalUpload } : {}) },
            () => staged.resolve(waiting(account, trip, batch, { state: "PREPARING" })),
          );
          await finish("READY", null);
          return prepared;
        } catch (error) {
          if (error instanceof OriginalBytesRequired)
            await finish("NEEDS_BYTES", error.inputId);
          else
            await finish("RESUME_REQUIRED", null);
          throw error;
        } finally {
          running.delete(id);
        }
      });
      if (!originalUpload) {
        void work.catch(() => {});
        return waiting(account, trip, batch, { state: "PREPARING" });
      }
      try {
        // A byte supplement is acknowledged only after the existing owner seals its stage.
        return await Promise.race([work, staged.promise]);
      } catch (error) {
        if (!(error instanceof OriginalBytesRequired)) throw error;
        return waiting(account, trip, batch, { state: "NEEDS_BYTES", inputId: error.inputId });
      }
    },
  };
}
