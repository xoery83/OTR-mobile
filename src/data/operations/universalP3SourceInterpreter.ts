import type { CaptureSelection } from "@/features/capture/captureStaging";
import type { createUniversalImportTransport } from "../api/universalImportTransport";
import {
  universalContextSchema,
  type UniversalExecutionContext,
} from "../api/universalImportContracts";
import { ApiClientError } from "../api/client";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { createCaptureSubmissionSession } from "./captureSubmission";
import { createUniversalCaptureConsumer } from "./universalCaptureConsumer";
import {
  isCurrentUniversalP3FormContext,
  projectUniversalP3FormInterpretation,
  universalP3FormContextSchema,
  type UniversalP3FormContext,
  type UniversalP3FormInterpretation,
} from "./universalP3FormInterpretation";

type Submission = Parameters<typeof createCaptureSubmissionSession>[0];
type Consumer = Parameters<typeof createUniversalCaptureConsumer>[0];

// One Native Form and one explicit material intent. Its owning session retains all durable IDs.
export function createUniversalP3SourceInterpreter(dependencies: {
  requireNormalAccount(): Promise<string>;
  submission: Omit<Submission, "context" | "getActiveUserId">;
  createTransport(options: {
    signal: AbortSignal;
    assertCurrent(): void;
  }): Pick<
    ReturnType<typeof createUniversalImportTransport>,
    "context" | "result" | "execute"
  >;
  prepareSources?: Consumer["prepareSources"];
}) {
  let frozen: {
    context: UniversalP3FormContext;
    material: readonly CaptureSelection[];
    selections: readonly CaptureSelection[];
    session: Promise<ReturnType<typeof createCaptureSubmissionSession>>;
    started: boolean;
    submitted: boolean;
  } | null = null;
  let running: Promise<UniversalP3FormInterpretation> | null = null;
  let accountContext: AccountRequestContext | null = null;
  return async (
    rawContext: UniversalP3FormContext,
    signal: AbortSignal,
    material: readonly CaptureSelection[],
    getCurrentContext: () => UniversalP3FormContext | null,
  ): Promise<UniversalP3FormInterpretation> => {
    const context = Object.freeze(universalP3FormContextSchema.parse(rawContext));
    if (typeof getCurrentContext !== "function")
      throw Error("FORM_SCAN_CURRENT_CONTEXT_REQUIRED");
    if (!material.length) throw Error("FORM_SCAN_MATERIAL_REQUIRED");
    if (
      frozen &&
      (!isCurrentUniversalP3FormContext(frozen.context, context) ||
        frozen.material.length !== material.length ||
        frozen.material.some((selection, index) => selection !== material[index]))
    )
      throw Error("FORM_SCAN_FROZEN_REQUEST_MISMATCH");
    const assertCurrent = () => {
      if (signal.aborted) throw Error("FORM_SCAN_CANCELLED");
      if (accountContext) assertAccountRequestGeneration(accountContext);
      if (!isCurrentUniversalP3FormContext(context, getCurrentContext()))
        throw Error("FORM_SCAN_STALE");
    };
    const check = async () => {
      assertCurrent();
      if (!accountContext) throw Error("FORM_SCAN_ACCOUNT_CONTEXT_REQUIRED");
      await assertAccountRequestContext(
        accountContext,
        dependencies.requireNormalAccount,
      );
      assertCurrent();
    };
    assertCurrent();
    if (running) return running;
    if (!frozen) {
      const selections = material.map((selection) => ({
        ...selection,
        ...(selection.identity ? { identity: { ...selection.identity } } : {}),
      }));
      frozen = {
        context,
        material: [...material],
        selections,
        started: false,
        submitted: false,
        session: (async () => {
          // The Account context is independently captured; Form revision is never an auth generation.
          accountContext = await captureAccountRequestContext(
            context.tripId,
            dependencies.requireNormalAccount,
          );
          if (
            accountContext.accountId !== context.accountId ||
            accountContext.tripId !== context.tripId
          )
            throw Error("FORM_SCAN_ACCOUNT_CONTEXT_MISMATCH");
          await check();
          return createCaptureSubmissionSession({
            ...dependencies.submission,
            context: accountContext,
            getActiveUserId: dependencies.requireNormalAccount,
            open: async (selection) => {
              assertCurrent();
              return dependencies.submission.open(selection);
            },
          });
        })(),
      };
    }
    const request = frozen;
    const work = (async () => {
      const session = await request.session;
      await check();
      const model = request.submitted
        ? await session.recover()
        : await session.submit(request.selections, () => {}, context.tripId);
      request.submitted = true;
      await check();
      if (!model || !model.allInputsAccepted) throw Error("FORM_SCAN_INTAKE_PENDING");
      const transport = dependencies.createTransport({ signal, assertCurrent });
      let task: UniversalExecutionContext | null = null;
      const consumer = createUniversalCaptureConsumer({
        getAccountId: dependencies.requireNormalAccount,
        isCurrent: () => {
          try {
            assertCurrent();
            return true;
          } catch {
            return false;
          }
        },
        continuous: true,
        transport: {
          ...transport,
          context: async (...args) => {
            task = universalContextSchema.parse(await transport.context(...args));
            if (
              task.accountId !== context.accountId ||
              task.actorId !== context.accountId ||
              task.tripId !== context.tripId ||
              task.batchId !== model.batch.batchId
            )
              throw Error("FORM_SCAN_TASK_MISMATCH");
            request.started = true;
            return task;
          },
        },
        ...(dependencies.prepareSources
          ? {
              prepareSources: async (...args) => {
                await check();
                if (task) throw Error("FORM_SCAN_EXISTING_TASK_READ_ONLY");
                await dependencies.prepareSources!(...args);
                await check();
              },
            }
          : {}),
      });
      let result;
      try {
        // A retained success/UNKNOWN is read first and can never fall through to paid Start.
        result = await consumer.recover(model);
      } catch (error) {
        await check();
        if (
          request.started ||
          !dependencies.prepareSources ||
          !(
            error instanceof ApiClientError &&
            error.status === 404 &&
            error.code === "TASK_NOT_FOUND"
          )
        )
          throw error;
        request.started = true;
        result = await consumer.start(model);
      }
      await check();
      if (!result || !task) throw Error("FORM_SCAN_RESULTS_PENDING");
      const projected = projectUniversalP3FormInterpretation({
        result,
        task,
        capturedContext: context,
        currentContext: getCurrentContext(),
      });
      assertCurrent();
      if (!projected) throw Error("FORM_SCAN_RESULT_UNAVAILABLE");
      return projected;
    })();
    running = work;
    work
      .finally(() => {
        if (running === work) running = null;
      })
      .catch(() => {});
    return work;
  };
}
