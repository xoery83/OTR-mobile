import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createCaptureRemoteProcessingTransport } from "./captureRemoteProcessingTransport";
import { captureRemoteFixture } from "../../domain/capture/__fixtures__/captureRemoteProcessing";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
it("uses normal session refresh once and returns typed job data without Provider credentials", async () => {
  const f = captureRemoteFixture(),
    getAccount = async () => f.binding.accountId,
    context = await captureAccountRequestContext("", getAccount),
    sent: string[] = [];
  const tokenProvider = vi.fn(async () => ({
    userId: f.binding.accountId,
    token: "synthetic-session",
  }));
  let count = 0;
  const transport = createCaptureRemoteProcessingTransport(
    getAccount,
    {
      baseUrl: "https://api.example",
      fetchImplementation: vi.fn(async (_url, options) => {
        sent.push(String(options?.body));
        return ++count === 1
          ? new Response(null, { status: 401 })
          : Response.json(f.output);
      }),
    },
    tokenProvider,
  );
  expect(await transport.run(context, f.input)).toEqual(f.output);
  expect(tokenProvider).toHaveBeenCalledTimes(2);
  expect(sent[0]).toBe(sent[1]);
  expect(sent[0]).not.toContain("synthetic-session");
});
it("fences wrong-account output, generation changes and unready bindings", async () => {
  const f = captureRemoteFixture(),
    getAccount = async () => f.binding.accountId,
    context = await captureAccountRequestContext("", getAccount);
  const t = createCaptureRemoteProcessingTransport(
    getAccount,
    {
      baseUrl: "https://api.example",
      fetchImplementation: vi.fn(async () =>
        Response.json({
          ...f.output,
          binding: { ...f.binding, accountId: randomUUID() },
        }),
      ),
    },
    async () => ({ userId: f.binding.accountId, token: "synthetic" }),
  );
  await expect(t.read(context, f.binding, f.input.task.task_id)).rejects.toThrow(
    "CAPTURE_REMOTE_RESULT_SCOPE",
  );
  advanceAccountGeneration();
  await expect(t.read(context, f.binding, f.input.task.task_id)).rejects.toThrow();
});
