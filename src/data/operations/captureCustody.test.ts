import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { fixture } from "../repositories/__fixtures__/captureBatchAssessment";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { createCaptureCustodyOperation } from "./captureCustody";
import {
  captureCustodyBindingJson,
  type CaptureCustodyBinding,
} from "@/domain/capture/captureCustody";

async function setup() {
  const f = fixture(true);
  const request = f.request();
  request.inputs[0].kind = "FILE";
  const bytes = new TextEncoder().encode("%PDF-1.4\nsynthetic-original");
  await f.submissions.submit(
    request,
    new Map([[request.inputs[0].id, async () => ({ bytes })]]),
  );
  const context = await captureAccountRequestContext("", f.getAccount);
  let retained: CaptureCustodyBinding | null = null;
  let loseAck = true;
  const transport = {
    put: vi.fn(async (_c: unknown, b: CaptureCustodyBinding, input: Uint8Array) => {
      if (
        retained &&
        captureCustodyBindingJson(retained) !== captureCustodyBindingJson(b)
      )
        throw Error("changed");
      retained = b;
      expect(input).toEqual(bytes);
      if (loseAck) {
        loseAck = false;
        throw Error("ACK_LOST");
      }
      return bytes;
    }),
    read: vi.fn(async () => (retained ? bytes : null)),
  };
  const operation = () =>
    createCaptureCustodyOperation({
      submissions: f.submissions,
      inbox: f.captures,
      transport,
      getAccountId: f.getAccount,
    });
  return { f, request, context, bytes, transport, operation };
}
it("lost ACK/file restart recovers the same durable Input without allocating/reuploading", async () => {
  const x = await setup();
  const input = x.request.inputs[0].id;
  await expect(x.operation().put(x.context, x.request.jobId, input)).rejects.toThrow(
    "ACK_LOST",
  );
  x.f.reopen();
  expect(await x.operation().recover(x.context, x.request.jobId, input)).toEqual(x.bytes);
  expect(x.transport.put).toHaveBeenCalledTimes(1);
  expect(
    x.f.sql.prepare("SELECT count(*) AS n FROM capture_submission_batches").get()?.n,
  ).toBe(1);
  expect((await x.f.submissions.reopen(x.request.jobId)).inputs[0].id).toBe(input);
});
it("Account ABA invalidates original operation after remote completion", async () => {
  const x = await setup();
  x.transport.read.mockImplementationOnce(async () => {
    const a = await x.f.getAccount();
    await x.f.switchTo(randomUUID());
    await x.f.switchTo(a);
    return x.bytes;
  });
  await expect(
    x.operation().recover(x.context, x.request.jobId, x.request.inputs[0].id),
  ).rejects.toThrow(/Account changed/);
});
it("rejects a foreign Input before transport", async () => {
  const x = await setup();
  await expect(
    x.operation().put(x.context, x.request.jobId, randomUUID()),
  ).rejects.toThrow("INPUT_UNAVAILABLE");
  expect(x.transport.put).not.toHaveBeenCalled();
});
