import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  hashCaptureBytes,
  readCapturePayload,
  type CapturePayloadInput,
} from "@/data/files/capturePayloadReader";
import { LocalCaptureError, type LocalCapture } from "@/domain/capture/localCapture";
import {
  submissionRequestSchema,
  canonicalSubmission,
  boundedSubmissionJson,
  submissionId,
  inputFactsSchema,
  inputDeclarationSchema,
  safeIntakeFailureSchema,
  type SubmissionRequest,
  type InputDeclaration,
  type CaptureSubmissionInput,
  type CaptureJobReadModel,
  type SafeIntakeFailure,
} from "@/domain/capture/captureSubmission";
import {
  createLocalCaptureTransactionStore,
  type LocalCaptureDatabase,
  type LocalCaptureDependencies,
} from "./localCaptureInboxRepository";

type HeaderRow = {
  formatStorage: string;
  manifestStorage: string;
  batchId: string;
  jobId: string;
  submissionKey: string;
  contextId: string;
  formatVersion: number;
  manifestVersion: number;
  createdAt: string;
  contextJson: string;
  manifestJson: string;
  requestSha256: string;
  manifestSha256: string;
};
const headers = `SELECT typeof(format_version) AS formatStorage,typeof(manifest_version) AS manifestStorage,batch_id AS batchId,job_id AS jobId,submission_key AS submissionKey,context_id AS contextId,format_version AS formatVersion,manifest_version AS manifestVersion,created_at AS createdAt,context_json AS contextJson,manifest_json AS manifestJson,request_sha256 AS requestSha256,manifest_sha256 AS manifestSha256 FROM capture_submission_batches`;
type Facts = ReturnType<typeof inputFactsSchema.parse>;
type InputRow = Facts &
  Omit<InputDeclaration, "id"> & {
    revisionStorage: string;
    countStorage: string;
    captureRevisionStorage: string;
    ordinalStorage: string;
    inputId: string;
    declarationSha256: string;
  };
const inputs = `SELECT typeof(row_revision) AS revisionStorage,typeof(content_byte_count) AS countStorage,typeof(accepted_capture_revision) AS captureRevisionStorage,typeof(ordinal) AS ordinalStorage,input_id AS inputId,item_key AS itemKey,ordinal,acquisition_source AS acquisitionSource,kind,original_filename AS originalFilename,declared_content_type AS declaredContentType,continues_from_input_id AS continuesFromInputId,declaration_sha256 AS declarationSha256,row_revision AS revision,content_sha256 AS contentSha256,content_byte_count AS contentByteCount,acceptance_state AS state,pending_reason AS pendingReason,failure_code AS failureCode,capture_id AS captureId,accepted_payload_id AS payloadId,accepted_capture_revision AS captureRevision,accepted_at AS acceptedAt FROM capture_submission_inputs`;
const fail = () => {
  throw new LocalCaptureError("INTEGRITY");
};
export function createCaptureSubmissionRepository(
  database: LocalCaptureDatabase,
  getActiveUserId: () => Promise<string>,
  dependencies: LocalCaptureDependencies,
) {
  const storage = createLocalCaptureTransactionStore(database, dependencies);
  const context = () => captureAccountRequestContext("", getActiveUserId);
  const assert = (c: AccountRequestContext) =>
    assertAccountRequestContext(c, getActiveUserId);
  const hash = (json: string) =>
    hashCaptureBytes(new TextEncoder().encode(json), dependencies.sha256);
  async function scoped<T>(c: AccountRequestContext, work: () => Promise<T>) {
    return withAccountApplyGate(async () => {
      let result!: T;
      await database.withTransactionAsync(async () => {
        await assert(c);
        result = await work();
        await assert(c);
      });
      await assert(c);
      return result;
    });
  }
  async function loadHeader(
    c: AccountRequestContext,
    jobId: string,
  ): Promise<SubmissionRequest> {
    submissionId.parse(jobId);
    const row = await database.getFirstAsync<HeaderRow>(
      `${headers} WHERE account_id=? AND job_id=?`,
      c.accountId,
      jobId,
    );
    if (!row) throw new LocalCaptureError("NOT_FOUND");
    let request: SubmissionRequest;
    try {
      request = submissionRequestSchema.parse({
        formatVersion: row.formatVersion,
        manifestVersion: row.manifestVersion,
        accountId: c.accountId,
        batchId: row.batchId,
        jobId: row.jobId,
        submissionKey: row.submissionKey,
        createdAt: row.createdAt,
        context: JSON.parse(row.contextJson),
        inputs: JSON.parse(row.manifestJson),
      });
      if (
        row.formatStorage !== "integer" ||
        row.manifestStorage !== "integer" ||
        row.contextId !== request.context.id ||
        boundedSubmissionJson(request.context) !== row.contextJson ||
        boundedSubmissionJson(request.inputs) !== row.manifestJson ||
        (await hash(canonicalSubmission(request))) !== row.requestSha256 ||
        (await hash(row.manifestJson)) !== row.manifestSha256
      )
        fail();
    } catch {
      return fail();
    }
    return request;
  }
  async function load(
    c: AccountRequestContext,
    jobId: string,
  ): Promise<CaptureJobReadModel> {
    const request = await loadHeader(c, jobId);
    const rows = await database.getAllAsync<InputRow>(
      `${inputs} WHERE account_id=? AND batch_id=? ORDER BY ordinal`,
      c.accountId,
      request.batchId,
    );
    if (rows.length !== request.inputs.length) fail();
    const projected: CaptureSubmissionInput[] = [];
    for (const [n, row] of rows.entries()) {
      const declaration = request.inputs[n];
      if (
        row.inputId !== declaration.id ||
        row.declarationSha256 !== (await hash(JSON.stringify(declaration)))
      )
        fail();
      const {
        revisionStorage,
        countStorage,
        captureRevisionStorage,
        ordinalStorage,
        inputId,
        declarationSha256: _hash,
        itemKey,
        ordinal,
        acquisitionSource,
        kind,
        originalFilename,
        declaredContentType,
        continuesFromInputId,
        ...rawFacts
      } = row;
      const storedDeclaration = inputDeclarationSchema.safeParse({
        id: inputId,
        itemKey,
        ordinal,
        acquisitionSource,
        kind,
        originalFilename,
        declaredContentType,
        continuesFromInputId,
      });
      if (
        !storedDeclaration.success ||
        JSON.stringify(storedDeclaration.data) !== JSON.stringify(declaration)
      )
        fail();
      if (
        revisionStorage !== "integer" ||
        ordinalStorage !== "integer" ||
        countStorage !== (row.contentByteCount === null ? "null" : "integer") ||
        captureRevisionStorage !== (row.captureRevision === null ? "null" : "integer")
      )
        fail();
      const parsed = inputFactsSchema.safeParse(rawFacts);
      if (
        !parsed.success ||
        (declaration.kind === "TEXT" && (parsed.data.contentByteCount ?? 0) > 1048576)
      )
        fail();
      const facts = parsed.data!;
      if (facts.state === "ACCEPTED") {
        const { capture } = await storage.load(c.accountId, facts.captureId!);
        if (
          capture.payloadId !== facts.payloadId ||
          capture.sha256 !== facts.contentSha256 ||
          capture.byteCount !== facts.contentByteCount ||
          capture.kind !== declaration.kind ||
          capture.originalFilename !== declaration.originalFilename ||
          capture.declaredContentType !== declaration.declaredContentType ||
          capture.revision < facts.captureRevision!
        )
          fail();
      }
      let continuesFromJobId: string | null = null;
      if (declaration.continuesFromInputId) {
        const prior = await database.getFirstAsync<{ jobId: string }>(
          `SELECT b.job_id AS jobId FROM capture_submission_inputs i JOIN capture_submission_batches b ON b.account_id=i.account_id AND b.batch_id=i.batch_id JOIN capture_submission_batches current ON current.account_id=? AND current.batch_id=? WHERE i.account_id=? AND i.input_id=? AND b.rowid<current.rowid`,
          c.accountId,
          request.batchId,
          c.accountId,
          declaration.continuesFromInputId,
        );
        if (!prior) fail();
        const priorHeader = await loadHeader(c, prior!.jobId);
        if (!priorHeader.inputs.some((i) => i.id === declaration.continuesFromInputId))
          fail();
        continuesFromJobId = prior!.jobId;
      }
      const continuedIn = await database.getAllAsync<{ jobId: string; inputId: string }>(
        `SELECT b.job_id AS jobId,i.input_id AS inputId FROM capture_submission_inputs i JOIN capture_submission_batches b ON b.account_id=i.account_id AND b.batch_id=i.batch_id WHERE i.account_id=? AND i.continues_from_input_id=? ORDER BY b.rowid,i.ordinal`,
        c.accountId,
        declaration.id,
      );
      for (const successor of continuedIn) {
        const successorHeader = await loadHeader(c, successor.jobId);
        if (
          !successorHeader.inputs.some(
            (i) =>
              i.id === successor.inputId && i.continuesFromInputId === declaration.id,
          )
        )
          fail();
      }
      projected.push({ ...declaration, ...facts, continuedIn, continuesFromJobId });
    }
    const counts = {
      selected: projected.length,
      accepted: projected.filter((i) => i.state === "ACCEPTED").length,
      failed: projected.filter((i) => i.state === "FAILED").length,
      pending: projected.filter((i) => i.state === "PENDING").length,
    };
    return {
      batch: request,
      inputs: projected,
      counts,
      allInputsAccepted: counts.accepted === counts.selected,
      intakeSettled: counts.pending === 0,
      processing: {
        capability: "NOT_INSTALLED",
        assessedInputs: null,
        totalInputs: null,
        currentPassComplete: null,
      },
      results: { admittedCreates: 0, admittedUpdates: 0, currentAttention: null },
      availableActions: {
        canHide: true,
        canReopen: true,
        canAddMore: true,
        canResumeAcceptedLocalWork: false,
        canReviewNow: false,
        canOpenCurrentReview: false,
        // No transient handle is available from a durable projection. FAILED alone grants no retry.
        canRetryKnownFailedItem: false,
        reacquireInputIds: projected
          .filter((i) => i.state !== "ACCEPTED")
          .map((i) => i.id),
        unavailableReasons:
          counts.accepted < counts.selected
            ? ["PROCESSING_NOT_INSTALLED", "INPUT_REACQUISITION_REQUIRED"]
            : ["PROCESSING_NOT_INSTALLED"],
      },
    };
  }
  async function register(
    c: AccountRequestContext,
    raw: SubmissionRequest,
    lineageRevisions: Readonly<Record<string, number>> = {},
  ) {
    const request = submissionRequestSchema.parse(raw);
    if (request.accountId !== c.accountId) throw new LocalCaptureError("INVALID_INPUT");
    const contextJson = boundedSubmissionJson(request.context),
      manifestJson = boundedSubmissionJson(request.inputs);
    const requestSha256 = await hash(canonicalSubmission(request)),
      manifestSha256 = await hash(manifestJson);
    await scoped(c, async () => {
      const existing = await database.getFirstAsync<{
        jobId: string;
        requestSha256: string;
      }>(
        `${headers} WHERE account_id=? AND submission_key=?`,
        c.accountId,
        request.submissionKey,
      );
      if (existing) {
        if (existing.requestSha256 !== requestSha256 || existing.jobId !== request.jobId)
          throw new LocalCaptureError("INVALID_INPUT");
        await load(c, existing.jobId);
        return;
      }
      // Lineage must resolve to an already complete registered older roster. Immutable edges cannot cycle.
      for (const declaration of request.inputs)
        if (declaration.continuesFromInputId) {
          const prior = await database.getFirstAsync<{ jobId: string }>(
            `SELECT b.job_id AS jobId FROM capture_submission_inputs i JOIN capture_submission_batches b ON b.account_id=i.account_id AND b.batch_id=i.batch_id WHERE i.account_id=? AND i.input_id=?`,
            c.accountId,
            declaration.continuesFromInputId,
          );
          if (!prior) throw new LocalCaptureError("INVALID_INPUT");
          const previous = (await load(c, prior.jobId)).inputs.find(
            (i) => i.id === declaration.continuesFromInputId,
          );
          if (!previous || previous.revision !== lineageRevisions[previous.id])
            throw new LocalCaptureError("STALE_REVISION");
        }
      await database.runAsync(
        `INSERT INTO capture_submission_batches(account_id,batch_id,job_id,submission_key,context_id,format_version,manifest_version,created_at,context_json,manifest_json,request_sha256,manifest_sha256) VALUES(?,?,?,?,?,1,1,?,?,?,?,?)`,
        c.accountId,
        request.batchId,
        request.jobId,
        request.submissionKey,
        request.context.id,
        request.createdAt,
        contextJson,
        manifestJson,
        requestSha256,
        manifestSha256,
      );
      for (const i of request.inputs)
        await database.runAsync(
          `INSERT INTO capture_submission_inputs(account_id,input_id,batch_id,item_key,ordinal,declaration_sha256,acquisition_source,kind,original_filename,declared_content_type,continues_from_input_id,row_revision,acceptance_state,pending_reason) VALUES(?,?,?,?,CAST(? AS INTEGER),?,?,?,?,?,?,1,'PENDING','READ')`,
          c.accountId,
          i.id,
          request.batchId,
          i.itemKey,
          i.ordinal,
          await hash(JSON.stringify(i)),
          i.acquisitionSource,
          i.kind,
          i.originalFilename,
          i.declaredContentType,
          i.continuesFromInputId,
        );
      await load(c, request.jobId);
    });
  }
  async function update(
    c: AccountRequestContext,
    jobId: string,
    input: CaptureSubmissionInput,
    changes: Partial<Facts>,
  ) {
    const next = inputFactsSchema.parse({
      revision: input.revision + 1,
      contentSha256: input.contentSha256,
      contentByteCount: input.contentByteCount,
      state: input.state,
      pendingReason: input.pendingReason,
      failureCode: input.failureCode,
      captureId: input.captureId,
      payloadId: input.payloadId,
      captureRevision: input.captureRevision,
      acceptedAt: input.acceptedAt,
      ...changes,
    });
    const result = await database.runAsync(
      `UPDATE capture_submission_inputs SET row_revision=CAST(? AS INTEGER),content_sha256=?,content_byte_count=CAST(? AS INTEGER),acceptance_state=?,pending_reason=?,failure_code=?,capture_id=?,accepted_payload_id=?,accepted_capture_revision=CAST(? AS INTEGER),accepted_at=? WHERE account_id=? AND batch_id=(SELECT batch_id FROM capture_submission_batches WHERE account_id=? AND job_id=?) AND input_id=? AND item_key=? AND row_revision=?`,
      next.revision,
      next.contentSha256,
      next.contentByteCount,
      next.state,
      next.pendingReason,
      next.failureCode,
      next.captureId,
      next.payloadId,
      next.captureRevision,
      next.acceptedAt,
      c.accountId,
      c.accountId,
      jobId,
      input.id,
      input.itemKey,
      input.revision,
    );
    if (result.changes !== 1) throw new LocalCaptureError("STALE_REVISION");
  }
  const readWith = (c: AccountRequestContext, jobId: string) =>
    scoped(c, () => load(c, jobId));
  async function acceptItem(
    c: AccountRequestContext,
    jobId: string,
    inputId: string,
    expectedRevision: number,
    source: (() => Promise<CapturePayloadInput>) | undefined,
    allowUnpinned: boolean,
  ) {
    let model = await readWith(c, jobId);
    let item = model.inputs.find((i) => i.id === inputId);
    if (!item) throw new LocalCaptureError("NOT_FOUND");
    if (item.state === "ACCEPTED") return model;
    if (item.revision !== expectedRevision) throw new LocalCaptureError("STALE_REVISION");
    if (!source || (!allowUnpinned && item.contentSha256 === null)) {
      await scoped(c, async () => {
        const current = (await load(c, jobId)).inputs.find((i) => i.id === inputId)!;
        if (current.state !== "ACCEPTED" && current.revision === item!.revision)
          await update(c, jobId, current, {
            state: "PENDING",
            pendingReason: "REACQUIRE",
            failureCode: null,
          });
      });
      return readWith(c, jobId);
    }
    let payload: Awaited<ReturnType<typeof readCapturePayload>>;
    try {
      await assert(c);
      payload = await readCapturePayload(item.kind, await source(), dependencies.sha256);
      await assert(c);
    } catch (error) {
      await assert(c);
      const code =
        error instanceof LocalCaptureError
          ? safeIntakeFailureSchema.safeParse(error.code)
          : null;
      if (!code?.success) throw error;
      await knownFailure(c, jobId, item, code.data);
      return readWith(c, jobId);
    }
    if (
      item.contentSha256 !== null &&
      (payload.sha256 !== item.contentSha256 ||
        payload.byteCount !== item.contentByteCount)
    ) {
      await knownFailure(c, jobId, item, "CONTENT_MISMATCH");
      return readWith(c, jobId);
    }
    // A first pin is durable before quota/acceptance. Pin ACK loss is recovered by exact read.
    try {
      await scoped(c, async () => {
        const current = (await load(c, jobId)).inputs.find((i) => i.id === inputId)!;
        if (current.state === "ACCEPTED") return;
        if (current.revision !== item!.revision)
          throw new LocalCaptureError("STALE_REVISION");
        await update(c, jobId, current, {
          contentSha256: payload.sha256,
          contentByteCount: payload.byteCount,
          state: "PENDING",
          pendingReason: "RECOVER_COMMIT",
          failureCode: null,
        });
      });
    } catch (error) {
      const recovered = (await readWith(c, jobId)).inputs.find((i) => i.id === inputId)!;
      if (recovered.state === "ACCEPTED") return readWith(c, jobId);
      if (
        recovered.contentSha256 !== payload.sha256 ||
        recovered.contentByteCount !== payload.byteCount ||
        recovered.revision !== item.revision + 1
      )
        throw error;
    }
    model = await readWith(c, jobId);
    item = model.inputs.find((i) => i.id === inputId)!;
    if (item.state === "ACCEPTED") return model;
    try {
      await scoped(c, async () => {
        const current = (await load(c, jobId)).inputs.find((i) => i.id === inputId)!;
        if (current.state === "ACCEPTED") return;
        if (
          current.revision !== item!.revision ||
          current.contentSha256 !== payload.sha256 ||
          current.contentByteCount !== payload.byteCount
        )
          throw new LocalCaptureError("STALE_REVISION");
        const capture: LocalCapture = await storage.insert(
          c.accountId,
          {
            kind: current.kind,
            originalFilename: current.originalFilename,
            declaredContentType: current.declaredContentType,
            tripId: null,
          },
          payload,
        );
        await update(c, jobId, current, {
          state: "ACCEPTED",
          pendingReason: null,
          failureCode: null,
          captureId: capture.id,
          payloadId: capture.payloadId,
          captureRevision: capture.revision,
          acceptedAt: dependencies.now(),
        });
      });
    } catch (error) {
      // Never repeat insert after an uncertain commit: verify exact Input binding first.
      const recovered = (await readWith(c, jobId)).inputs.find((i) => i.id === inputId)!;
      if (recovered.state === "ACCEPTED") return readWith(c, jobId);
      if (
        error instanceof LocalCaptureError &&
        ["ROW_QUOTA", "ACCOUNT_BYTE_QUOTA", "DEVICE_BYTE_QUOTA"].includes(error.code)
      )
        await knownFailure(c, jobId, recovered, error.code as SafeIntakeFailure);
      else throw error;
    }
    return readWith(c, jobId);
  }
  async function knownFailure(
    c: AccountRequestContext,
    jobId: string,
    item: CaptureSubmissionInput,
    code: SafeIntakeFailure,
  ) {
    await scoped(c, async () => {
      const current = (await load(c, jobId)).inputs.find((i) => i.id === item.id)!;
      if (current.state !== "ACCEPTED" && current.revision === item.revision)
        await update(c, jobId, current, {
          state: "FAILED",
          pendingReason: null,
          failureCode: code,
        });
    });
  }
  return {
    async register(
      request: SubmissionRequest,
      lineageRevisions?: Readonly<Record<string, number>>,
    ) {
      const c = await context();
      await register(c, request, lineageRevisions);
      return readWith(c, request.jobId);
    },
    async submit(
      request: SubmissionRequest,
      sources: ReadonlyMap<string, () => Promise<CapturePayloadInput>>,
      onProgress?: (model: CaptureJobReadModel) => void,
      expectedContext?: AccountRequestContext,
      lineageRevisions?: Readonly<Record<string, number>>,
    ) {
      const c = expectedContext ?? (await context());
      await assert(c);
      try {
        await register(c, request, lineageRevisions);
      } catch (error) {
        // Registration ACK loss: only an exact verified same-key request is recoverable.
        const row = await scoped(c, () =>
          database.getFirstAsync<{ jobId: string; requestSha256: string }>(
            `${headers} WHERE account_id=? AND submission_key=?`,
            c.accountId,
            request.submissionKey,
          ),
        );
        if (
          !row ||
          row.jobId !== request.jobId ||
          row.requestSha256 !== (await hash(canonicalSubmission(request)))
        )
          throw error;
        await readWith(c, row.jobId);
      }
      let model = await readWith(c, request.jobId);
      onProgress?.(model);
      for (const declaration of request.inputs) {
        const item = model.inputs.find((i) => i.id === declaration.id)!;
        model = await acceptItem(
          c,
          request.jobId,
          item.id,
          item.revision,
          sources.get(item.id),
          true,
        );
        onProgress?.(model);
      }
      return model;
    },
    async read(jobId: string) {
      const c = await context();
      return readWith(c, jobId);
    },
    async reopen(jobId: string, expectedContext?: AccountRequestContext) {
      const c = expectedContext ?? (await context());
      await assert(c);
      return readWith(c, jobId);
    },
    async recoverSubmission(
      submissionKey: string,
      expectedContext?: AccountRequestContext,
    ) {
      const c = expectedContext ?? (await context());
      await assert(c);
      submissionId.parse(submissionKey);
      return scoped(c, async () => {
        const row = await database.getFirstAsync<{ jobId: string }>(
          `${headers} WHERE account_id=? AND submission_key=?`,
          c.accountId,
          submissionKey,
        );
        if (!row) throw new LocalCaptureError("NOT_FOUND");
        return load(c, row.jobId);
      });
    },
    async list(
      options: { limit?: number; before?: { createdAt: string; batchId: string } } = {},
    ) {
      const c = await context();
      const limit = options.limit ?? 20;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new LocalCaptureError("INVALID_INPUT");
      if (options.before) {
        submissionId.parse(options.before.batchId);
        if (!/^\d{4}-\d{2}-\d{2}T/.test(options.before.createdAt))
          throw new LocalCaptureError("INVALID_INPUT");
      }
      return scoped(c, async () => {
        const rows = await database.getAllAsync<{ jobId: string }>(
          `${headers} WHERE account_id=? ${options.before ? "AND (created_at<? OR (created_at=? AND batch_id<?))" : ""} ORDER BY created_at DESC,batch_id DESC LIMIT ?`,
          c.accountId,
          ...(options.before
            ? [options.before.createdAt, options.before.createdAt, options.before.batchId]
            : []),
          limit,
        );
        const result: CaptureJobReadModel[] = [];
        for (const row of rows) result.push(await load(c, row.jobId));
        return result;
      });
    },
    async resume(
      jobId: string,
      inputId: string,
      expectedRevision: number,
      source?: () => Promise<CapturePayloadInput>,
      expectedContext?: AccountRequestContext,
    ) {
      const c = expectedContext ?? (await context());
      await assert(c);
      submissionId.parse(inputId);
      return acceptItem(c, jobId, inputId, expectedRevision, source, false);
    },
  };
}
