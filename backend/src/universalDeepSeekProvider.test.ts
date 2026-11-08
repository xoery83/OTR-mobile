import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { isAiCostGuardEnabled } from "./universalPg";
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
function provider(
  status = 200,
  body = responseBytes,
  beforeRemoteSend?: Parameters<
    typeof createUniversalDeepSeekProvider
  >[0]["beforeRemoteSend"],
  costGuardDisabled = false,
) {
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
      beforeRemoteSend,
      costGuardDisabled,
      priceSchedule: costGuardDisabled
        ? undefined
        : {
            currency: "USD",
            inputNanosPerMillion: "1000000000",
            cachedInputNanosPerMillion: "100000000",
            outputNanosPerMillion: "2000000000",
          },
    }),
  };
}
it.each(["SOURCE", "CREDENTIAL", "CLAIM", "CURRENT"])(
  "requires both Source and Provider custody to remain current before transport (%s)",
  async (scenario) => {
    let sourceCurrent = true;
    const calls: string[] = [];
    const x = provider(200, responseBytes, async () => {
      calls.push("source-proof");
      return {
        async readCurrentClaim() {
          calls.push("claim");
          if (scenario === "CLAIM") throw Error("CLAIM_CLOSED");
          return () => {
            calls.push("source-recheck");
            if (!sourceCurrent) throw Error("SOURCE_CLOSED");
          };
        },
      };
    });
    x.custody.acquire.mockResolvedValueOnce({
      secret: "fixture-secret",
      assertCurrent: vi.fn(async () => {
        calls.push("credential");
        if (scenario === "SOURCE") sourceCurrent = false;
        if (scenario === "CREDENTIAL") throw Error("CREDENTIAL_CLOSED");
      }),
    });
    if (scenario === "CURRENT") {
      await expect(x.instance.interpret(input)).resolves.toMatchObject({
        providerReceipt: { outcome: "SETTLED" },
      });
      expect(x.send).toHaveBeenCalledOnce();
    } else {
      await expect(x.instance.interpret(input)).rejects.toThrow(`${scenario}_CLOSED`);
      expect(x.send).not.toHaveBeenCalled();
    }
    expect(calls.slice(0, 4)).toEqual(
      scenario === "CREDENTIAL"
        ? ["source-proof", "credential"]
        : scenario === "CLAIM"
          ? ["source-proof", "credential", "claim"]
          : ["source-proof", "credential", "claim", "source-recheck"],
    );
  },
);
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
it("records only Task-correlated dispatch and transport duration after permission checks", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const x = provider();
    await x.instance.interpret(input);
    const events = log.mock.calls.map(([line]) => JSON.parse(line));
    expect(events).toEqual([
      {
        event: "universal_provider_transport",
        taskId: input.taskId,
        stage: "DISPATCH",
        at: expect.any(String),
      },
      {
        event: "universal_provider_transport",
        taskId: input.taskId,
        stage: "RESPONSE",
        at: expect.any(String),
        elapsedMs: expect.any(Number),
      },
    ]);
    log.mockClear();
    x.custody.acquire.mockRejectedValueOnce(Error("CLOSED"));
    await expect(x.instance.interpret(input)).rejects.toThrow("CLOSED");
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
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

it("accepts the current official Flash alias version with one retained and settled response", async () => {
  const raw = JSON.parse(responseBytes.toString());
  raw.model = "DeepSeek-V4.1-Flash-1017";
  const x = provider(200, Buffer.from(JSON.stringify(raw)));
  const result = await x.instance.interpret(input);
  expect(result.output).toEqual(output);
  expect(result.providerReceipt.outcome).toBe("SETTLED");
  expect(x.send).toHaveBeenCalledOnce();
  expect(x.custody.retainResponse).toHaveBeenCalledOnce();
  expect(x.custody.settle).toHaveBeenCalledOnce();
  expect(JSON.parse(x.send.mock.calls[0][0].body).model).toBe("deepseek-flash");
});

it("only exact DEV false disables the server cost guard", () => {
  const dev = "https://tuqigdxrvrerfewsxqgm.supabase.co";
  for (const [url, value, expected] of [
    [dev, undefined, true],
    [dev, "true", true],
    [dev, "False", true],
    [dev, "false", false],
    ["https://another-project.supabase.co", "false", true],
  ] as const) {
    expect(
      isAiCostGuardEnabled((key) => (key === "OTR_DEV_SUPABASE_URL" ? url : value)),
    ).toBe(expected);
  }
});

it("OFF uses the authorized provider transport and retains actual usage with unknown cost", async () => {
  const logged = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const f = provider(200, responseBytes, undefined, true);
    const result = await f.instance.interpret(input);
    expect(f.send).toHaveBeenCalledOnce();
    expect(f.custody.retainResponse).toHaveBeenCalledOnce();
    expect(f.custody.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({ input_tokens: 100, output_tokens: 20 }),
        costNanos: null,
      }),
    );
    expect(result.providerReceipt).toMatchObject({ outcome: "SETTLED", costNanos: null });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('"providerChargesMayApply":true'),
    );
    const denied = provider(200, responseBytes, undefined, true);
    denied.custody.acquire.mockRejectedValueOnce(Error("UNIVERSAL_PROVIDER_CLOSED"));
    await expect(denied.instance.interpret(input)).rejects.toThrow(
      "UNIVERSAL_PROVIDER_CLOSED",
    );
    expect(denied.send).not.toHaveBeenCalled();
  } finally {
    logged.mockRestore();
  }
});
