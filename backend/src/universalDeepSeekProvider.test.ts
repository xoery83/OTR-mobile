import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createUniversalDeepSeekProvider } from "./universalDeepSeekProvider";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
import type { UniversalProvider } from "./universalImport";

const bytes = Buffer.from("Activity: Museum walk\n");
const input: Parameters<UniversalProvider["interpret"]>[0] = {
  taskId: randomUUID(),
  actorId: randomUUID(),
  accountId: randomUUID(),
  tripId: randomUUID(),
  batchId: randomUUID(),
  promptVersion: COMPACT_PROMPT_VERSION,
  instruction: universalInstruction,
  advisoryInstruction: universalAdvisoryInstruction,
  sources: [
    {
      index: 0,
      sourceId: "S0",
      mime: "text/plain",
      modality: "TEXT",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes,
    },
  ],
};
const output = {
  v: 2,
  items: [
    {
      id: "i1",
      kind: "P1",
      subtype: "ACTIVITY",
      f: [[0, "activity.name", "Museum walk"]],
    },
  ],
  bookings: [],
  tickets: [],
  links: [],
  issues: [],
};
const responseBytes = Buffer.from(
  JSON.stringify({
    id: "provider-r1",
    model: "deepseek-flash",
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      prompt_cache_hit_tokens: 0,
    },
  }),
);
function provider(status = 200, body = responseBytes) {
  const custody = {
    acquire: vi.fn(async () => ({
      secret: "fixture-secret",
      assertCurrent: vi.fn(async () => undefined),
    })),
    retainResponse: vi.fn(async () => undefined),
    settle: vi.fn(async () => undefined),
  };
  const send = vi.fn(async (_request: { body: string }) => ({
    status,
    redirected: false,
    body: (async function* () {
      yield body;
    })(),
  }));
  return {
    custody,
    send,
    instance: createUniversalDeepSeekProvider({
      custody,
      send: send as never,
      priceSchedule: {
        currency: "USD",
        inputNanosPerMillion: "1000000000",
        cachedInputNanosPerMillion: "100000000",
        outputNanosPerMillion: "2000000000",
      },
    }),
  };
}
it("builds frozen one-call Universal request, uses Backend custody and retains actual usage with fake HTTPS", async () => {
  const x = provider();
  const result = await x.instance.interpret(input);
  expect(result.output).toEqual(output);
  expect(result.providerReceipt.outcome).toBe("SETTLED");
  expect(result.providerReceipt.usage).toMatchObject({
    usage_quality: "ACTUAL_REPORTED",
    input_tokens: 100,
    output_tokens: 20,
  });
  expect(result.providerReceipt.costNanos).toBe("140000");
  expect(x.custody.acquire).toHaveBeenCalledWith(
    expect.objectContaining({
      actorId: input.actorId,
      accountId: input.accountId,
      tripId: input.tripId,
      batchId: input.batchId,
      taskId: input.taskId,
    }),
  );
  const sent = JSON.parse(x.send.mock.calls[0][0].body);
  expect(sent.model).toBe("deepseek-flash");
  expect(sent.messages[0].content).toBe(
    universalInstruction + "\n" + universalAdvisoryInstruction,
  );
  expect(sent.messages[1].content[1].text).toContain("Museum walk");
  expect(x.custody.retainResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      httpStatus: 200,
      requestSha256: result.providerReceipt.requestSha256,
    }),
  );
});
it("does not send when credential is absent and retains failed HTTP for UNKNOWN reconciliation", async () => {
  const x = provider(503, Buffer.from("unavailable"));
  x.custody.acquire.mockResolvedValueOnce(null as never);
  await expect(x.instance.interpret(input)).rejects.toThrow("UNIVERSAL_PROVIDER_CLOSED");
  expect(x.send).not.toHaveBeenCalled();
  await expect(x.instance.interpret(input)).rejects.toThrow(
    "UNIVERSAL_PROVIDER_HTTP_FAILURE",
  );
  expect(x.custody.retainResponse).toHaveBeenCalledOnce();
});

it("does not retain or settle a Provider response after scoped custody is revoked", async () => {
  const x = provider();
  let current = true,
    checks = 0;
  x.custody.acquire.mockResolvedValueOnce({
    secret: "fixture-secret",
    assertCurrent: vi.fn(async () => {
      checks++;
      if (!current) throw new Error("REVOKED");
    }),
  });
  x.send.mockImplementationOnce(async () => {
    current = false;
    return {
      status: 200,
      redirected: false,
      body: (async function* () {
        yield responseBytes;
      })(),
    };
  });
  await expect(x.instance.interpret(input)).rejects.toThrow("REVOKED");
  expect(checks).toBeGreaterThanOrEqual(2);
  expect(x.custody.retainResponse).not.toHaveBeenCalled();
});

it("withholds SETTLED unless the owning usage/terminal receipt succeeds", async () => {
  const x = provider();
  x.custody.settle.mockRejectedValueOnce(new Error("DURABLE_RECEIPT_UNAVAILABLE"));
  await expect(x.instance.interpret(input)).rejects.toThrow(
    "DURABLE_RECEIPT_UNAVAILABLE",
  );
  expect(x.send).toHaveBeenCalledOnce();
  expect(x.custody.retainResponse).toHaveBeenCalledOnce();
});
it("retains but does not settle an unexpected Provider model", async () => {
  const raw = JSON.parse(responseBytes.toString());
  raw.model = "unapproved-model";
  const x = provider(200, Buffer.from(JSON.stringify(raw)));
  await expect(x.instance.interpret(input)).rejects.toThrow(
    "UNIVERSAL_PROVIDER_MODEL_UNRESOLVED",
  );
  expect(x.custody.retainResponse).toHaveBeenCalledOnce();
  expect(x.custody.settle).not.toHaveBeenCalled();
});

it("records only a fixed send-timeout code and never retries or settles", async () => {
  const x = provider();
  x.send.mockRejectedValueOnce(
    new DOMException("fixture sensitive detail", "TimeoutError"),
  );
  await expect(x.instance.interpret(input)).rejects.toMatchObject({
    code: "UNIVERSAL_PROVIDER_SEND_TIMEOUT",
  });
  expect(x.send).toHaveBeenCalledOnce();
  expect(x.custody.retainResponse).not.toHaveBeenCalled();
  expect(x.custody.settle).not.toHaveBeenCalled();
});
it("distinguishes custody retention failure without pretending settlement or sending again", async () => {
  const x = provider();
  x.custody.retainResponse.mockRejectedValueOnce(new Error("fixture private detail"));
  await expect(x.instance.interpret(input)).rejects.toMatchObject({
    code: "UNIVERSAL_PROVIDER_RETAIN_FAILED",
  });
  expect(x.send).toHaveBeenCalledOnce();
  expect(x.custody.settle).not.toHaveBeenCalled();
});

it("diagnoses an empty-message acquire aggregate without exposing details or sending", async () => {
  const x = provider();
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const failure = new AggregateError([
    Object.assign(new Error("fixture-secret and private image detail"), {
      code: "ECONNREFUSED",
    }),
  ]);
  x.custody.acquire.mockRejectedValueOnce(failure);
  try {
    await expect(x.instance.interpret(input)).rejects.toMatchObject({
      code: "UNIVERSAL_PROVIDER_ACQUIRE_FAILED",
      cause: failure,
    });
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      event: "universal_provider_phase_failed",
      phase: "ACQUIRE",
      boundary: "CUSTODY",
      kind: "AGGREGATE",
      code: "ECONNREFUSED",
    }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/fixture-secret|private image/);
    expect(x.send).not.toHaveBeenCalled();
    expect(x.custody.settle).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

it("preserves the owning acquire failure if diagnostics throw", async () => {
  const x = provider();
  const log = vi.spyOn(console, "info").mockImplementation(() => { throw Error("logger"); });
  const failure = Object.assign(new Error("private detail"), { code: "private-code" });
  x.custody.acquire.mockRejectedValueOnce(failure);
  try {
    await expect(x.instance.interpret(input)).rejects.toMatchObject({
      code: "UNIVERSAL_PROVIDER_ACQUIRE_FAILED", cause: failure,
    });
    expect(x.send).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});


it("redacts unknown codes and omits acquire boundaries after send", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  try {
    const acquire = provider();
    acquire.custody.acquire.mockRejectedValueOnce(
      Object.assign(new Error("private detail"), { code: "private-code" }),
    );
    await expect(acquire.instance.interpret(input)).rejects.toMatchObject({
      code: "UNIVERSAL_PROVIDER_ACQUIRE_FAILED",
    });
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
      boundary: "CUSTODY", code: "UNCLASSIFIED",
    });
    const send = provider();
    send.send.mockRejectedValueOnce(new Error("private detail"));
    await expect(send.instance.interpret(input)).rejects.toMatchObject({
      code: "UNIVERSAL_PROVIDER_SEND_FAILED",
    });
    expect(JSON.parse(log.mock.calls[1][0])).toEqual({
      event: "universal_provider_phase_failed", phase: "SEND", kind: "OTHER", code: "UNCLASSIFIED",
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private/);
  } finally {
    log.mockRestore();
  }
});

it("retains a fixed owning reason and compiled throw site without logging the error", async () => {
  const x = provider();
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const failure = new Error("INTELLIGENCE_STALE_SOURCE");
  failure.stack = "Error: private payload /app/server-capture.mjs:1:2\n    at read (/app/server-capture.mjs:12345:67)\n    at private-user-path:9:8";
  x.custody.acquire.mockRejectedValueOnce(failure);
  try {
    await expect(x.instance.interpret(input)).rejects.toMatchObject({ code: "UNIVERSAL_PROVIDER_ACQUIRE_FAILED", cause: failure });
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ code: "INTELLIGENCE_STALE_SOURCE", backendFrame: { line: 12345, column: 67 } });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|payload/);
    expect(x.send).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

it("classifies schema failures without recording issue values", async () => {
  const x = provider();
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  x.custody.acquire.mockRejectedValueOnce(Object.assign(new Error("private issue value"), { name: "ZodError" }));
  try {
    await expect(x.instance.interpret(input)).rejects.toMatchObject({ code: "UNIVERSAL_PROVIDER_ACQUIRE_FAILED" });
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ kind: "SCHEMA" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private issue");
    expect(x.send).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});
