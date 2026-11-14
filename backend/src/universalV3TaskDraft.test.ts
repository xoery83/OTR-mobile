import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { universalV3Manifest } from "../../src/data/api/universalV3Contracts";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import { createIntelligenceWakeQueue } from "../../src/data/sync/syncOperationRepository";
import { readExactTaskWake } from "./universalMixedBTaskReservation";
import { runUniversalV3Wake } from "./universalV3Wake";
import { initializeUniversalTaskDatabase } from "./universalTaskBootstrap";
import { createUniversalV3Intake } from "./universalV3Intake";
import { prepareUniversalV3Materials } from "./universalV3Materials";
import { buildUniversalV3TaskDraft } from "./universalV3TaskDraft";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

it.each(["completed", "unknown"] as const)(
  "binds mixed materials to one existing Wake and does not resend when %s",
  async (outcome) => {
    const root = await mkdtemp(join(tmpdir(), "otr-v3-task-"));
    const sql = new DatabaseSync(join(root, "tasks.db"));
    try {
      const db = initializeUniversalTaskDatabase(sql);
      const intake = createUniversalV3Intake(db, join(root, "spool"));
      const scope = {
        accountId: randomUUID(),
        tripId: randomUUID(),
        analysisId: randomUUID(),
      };
      const originals = [
        { mediaType: "text/plain", data: Buffer.from("Train arrival at 15:30") },
        { mediaType: "application/pdf", data: Buffer.from("%PDF-synthetic") },
        { mediaType: "image/png", data: Buffer.from("png synthetic") },
        { mediaType: "image/jpeg", data: Buffer.from("jpeg synthetic") },
      ];
      const manifest = universalV3Manifest.parse({
        version: "otr.import.local-first/1",
        tripId: scope.tripId,
        mode: "UNIVERSAL",
        files: originals.map(({ mediaType, data }) => ({
          fileId: randomUUID(),
          documentId: randomUUID(),
          mediaType,
          length: data.length,
          sha256: sha(data),
        })),
      });
      await intake.start(scope, manifest);
      for (const [i, file] of manifest.files.entries()) {
        const request = new Request("http://localhost", {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            "content-length": String(file.length),
          },
          body: new Uint8Array(originals[i].data),
        });
        expect(await intake.receive(scope, file.fileId, request)).toBe(204);
      }
      const retained = await intake.load(scope);
      if (!retained) throw Error("FIXTURE_INTAKE_MISSING");
      const validateImage = vi.fn(async (mime: string, bytes: Buffer) => ({
        mediaType: mime === "image/png" ? "image/png" as const : "image/jpeg" as const,
        bytes,
      }));
      const pdfText = "Page one: hotel\fPage two: late check-in";
      const extractPdf = vi.fn(async () => ({ text: pdfText }));
      const materials = await prepareUniversalV3Materials(
        retained.manifest,
        retained.readFile,
        validateImage,
        extractPdf as unknown as NonNullable<
          Parameters<typeof prepareUniversalV3Materials>[3]
        >,
      );
      expect(validateImage.mock.calls).toHaveLength(2);
      expect(extractPdf).toHaveBeenCalledTimes(1);
      expect(materials[1].bytes.toString()).toBe(pdfText);
      const draft = await buildUniversalV3TaskDraft(
        scope,
        manifest,
        materials,
        {
          integrationId: "fixture",
          configVersion: 2,
          configurationSha256: "a".repeat(64),
          providerConfigId: randomUUID(),
          priceScheduleId: null,
          providerId: "DeepSeek",
          modelId: "deepseek-flash",
          modelVersion: "DeepSeek-V4.1-Flash",
          adapterVersion: "fixture",
          region: "fixture",
          route: "fixture",
          maxCostNanos: "500000000",
          taskLifetimeMs: 60_000,
        },
        retained.acceptedAt,
      );
      expect(draft.task.run_id).toBeNull();
      if (!draft.binding) throw Error("FIXTURE_BINDING_MISSING");
      expect(draft.binding.request.input.sha256).toBe(sha(draft.marker));
      expect(draft.binding.profile.consumer_version).toBe(3);
      await intake.validateImportIntakePins(draft.task);
      await expect(
        intake.validateImportIntakePins({
          ...draft.task,
          manifest_sha256: "a".repeat(64),
        }),
      ).rejects.toThrow("UNIVERSAL_V3_TASK_SCOPE");
      const getAccountId = async () => scope.accountId;
      const context = await captureAccountRequestContext(scope.tripId, getAccountId);
      const deps = {
        getAccountId,
        now: () => new Date().toISOString(),
        sha256: async (bytes: Uint8Array) => sha(bytes),
        validateAdmission: async () => {},
        validateAttemptAdmission: async () => {},
        eligibleWait: async () => false,
        verifyRecovery: async () => {},
      };
      const defaultRepository = createIntelligenceContinuationRepository(db, deps);
      await expect(defaultRepository.create(context, draft.task)).rejects.toThrow(
        "INTELLIGENCE_IMPORT_INTAKE_CLOSED",
      );
      const repository = createIntelligenceContinuationRepository(db, {
        ...deps,
        validateImportIntakePins: intake.validateImportIntakePins,
      });
      await repository.create(context, draft.task);
      const wake = await repository.scheduleWake(context, draft.task.task_id);
      expect(wake).toBe(draft.wakeId);
      expect(await repository.scheduleWake(context, draft.task.task_id)).toBe(wake);
      expect(
        sql.prepare("SELECT count(*) AS count FROM sync_operations").get()?.count,
      ).toBe(1);

      const content = {
        items: [
          {
            kind: "P1",
            subtype: "ACTIVITY",
            fields: { "activity.name": "Rail museum" },
            inputs: [1, 3, 1],
          },
          {
            kind: "P1",
            subtype: "ACTIVITY",
            fields: { title: "wrong input" },
            inputs: [4],
          },
        ],
      };
      const send = vi.fn(async (input: { body: string }) => {
        expect(sha(Buffer.from(input.body))).toBe(draft.requestSha256);
        const parts = JSON.parse(input.body).messages[1].content;
        expect(
          parts.filter(({ type }: { type: string }) => type === "image_url"),
        ).toHaveLength(2);
        expect(parts[2].text).toContain("Page two");
        if (outcome === "unknown")
          throw Error("fixture transport disconnected after send");
        return {
          status: 200,
          redirected: false,
          body: (async function* () {
            yield Buffer.from(
              JSON.stringify({
                id: "fixture-provider",
                model: "deepseek-flash",
                choices: [
                  {
                    finish_reason: "stop",
                    message: { content: JSON.stringify(content) },
                  },
                ],
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 20,
                  total_tokens: 30,
                  prompt_cache_hit_tokens: 0,
                },
              }),
            );
          })(),
        };
      });
      const settle = vi.fn(async () => {});
      const actualWake = await readExactTaskWake(db, wake);
      if (!actualWake) throw Error("FIXTURE_WAKE_MISSING");
      const queue = createIntelligenceWakeQueue(db, deps);
      expect(await queue.claim(context, actualWake, "fixture-owner")).toBe(true);
      const retainPublication = vi.fn(
        async (_attempt: unknown, bytes: Buffer, digest: string) => {
          expect(sha(bytes)).toBe(digest);
        },
      );
      const start = vi.fn(async () => {});
      const execute = () =>
        runUniversalV3Wake({
          context,
          repository,
          wake: actualWake,
          manifest,
          draft,
          provider: {
            custody: {
              async acquire(input) {
                expect(input.taskId).toBe(draft.task.task_id);
                expect(input.requestSha256).toBe(draft.requestSha256);
                return { secret: "fixture-only", async assertCurrent() {} };
              },
              async retainResponse() {},
              settle,
            },
          },
          send,
          async assertCurrent() {},
          assertDurableStart: start,
          async assertCompletion(result) {
            expect(result.providerReceipt.outcome).toBe("SETTLED");
          },
          retainPublication,
        });
      const expected = outcome === "completed" ? "PUBLISHED" : "RECONCILE_ONLY";
      expect(await execute()).toBe(expected);
      expect(await execute()).toBe(expected);
      expect(send).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(1);
      if (outcome === "unknown") {
        expect(
          (await repository.snapshot(context, draft.task.task_id)).task.work_disposition,
        ).toBe("UNKNOWN");
        expect(settle).not.toHaveBeenCalled();
        expect(retainPublication).not.toHaveBeenCalled();
        await queue.settle(context, actualWake);
        return;
      }
      expect(settle).toHaveBeenCalledTimes(1);
      expect(retainPublication).toHaveBeenCalledTimes(1);
      expect(
        (await repository.snapshot(context, draft.task.task_id)).task.work_disposition,
      ).toBe("PUBLISHED");
      expect(
        JSON.parse(retainPublication.mock.calls[0][1].toString()).candidates,
      ).toEqual([
        {
          candidateId: expect.any(String),
          kind: "P1",
          subtype: "ACTIVITY",
          fields: { "activity.name": "Rail museum" },
          documentIds: [manifest.files[1].documentId, manifest.files[3].documentId],
        },
      ]);
      await queue.settle(context, actualWake);
    } finally {
      sql.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
