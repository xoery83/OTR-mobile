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

it("real SQLite C3v2 originals project TEXT and PDF custody identities, HTTP roundtrip and cold recovery", async () => {
  const { captureCustodyBoundary } =
    await import("../../../backend/src/captureCustodyHttp");
  const f = fixture(true, 73),
    q = f.request(),
    text = "周一，参观博物馆。\nDo not rewrite my text.",
    pdf = new TextEncoder().encode("%PDF-1.4\nsynthetic");
  q.formatVersion = 2;
  q.manifestVersion = 2;
  q.inputs[0] = {
    ...q.inputs[0],
    kind: "TEXT",
    acquisitionSource: "magic_input",
    originalFilename: null,
    declaredContentType: "text/plain",
  };
  q.inputs[1] = {
    ...q.inputs[0],
    id: randomUUID(),
    itemKey: randomUUID(),
    ordinal: 1,
    kind: "FILE",
    acquisitionSource: "files",
    declaredContentType: "application/pdf",
  };
  await f.submissions.submit(
    q,
    new Map<
      string,
      () => Promise<import("../files/capturePayloadReader").CapturePayloadInput>
    >([
      [q.inputs[0].id, async () => ({ text })],
      [q.inputs[1].id, async () => ({ bytes: pdf })],
    ]),
  );
  const stored = new Map<string, { binding: string; bytes: Uint8Array }>(),
    context = await captureAccountRequestContext("", f.getAccount);
  const custody: import("@/domain/capture/captureCustody").CaptureMaterialCustody = {
    async put(b, bytes) {
      stored.set(b.inputId, {
        binding: captureCustodyBindingJson(b),
        bytes: bytes.slice(),
      });
    },
    async read(b) {
      const p = stored.get(b.inputId);
      if (!p) return null;
      if (p.binding !== captureCustodyBindingJson(b))
        throw Error("CAPTURE_CUSTODY_BINDING_CONFLICT");
      return p.bytes.slice();
    },
  };
  const http = async (
    b: import("@/domain/capture/captureCustody").CaptureMaterialBinding,
    bytes?: Uint8Array,
  ) => {
    const response = await captureCustodyBoundary(
      new Request(`https://fixture.test/v2/capture-inputs/${b.inputId}/material`, {
        method: bytes ? "PUT" : "GET",
        headers: {
          "X-OTR-Capture-Binding": captureCustodyBindingJson(b),
          ...(bytes
            ? { "Content-Type": b.mediaType, "Content-Length": String(bytes.length) }
            : {}),
        },
        ...(bytes ? { body: Uint8Array.from(bytes).buffer } : {}),
      }),
      context.accountId,
      custody,
    );
    expect(response.status).toBe(200);
    return new Uint8Array(await response.arrayBuffer());
  };
  const operation = () =>
    createCaptureCustodyOperation({
      submissions: f.submissions,
      inbox: f.captures,
      getAccountId: f.getAccount,
      bindingVersion: 2,
      transport: {
        put: async (_c, b, bytes) => http(b, bytes),
        read: async (_c, b) => http(b),
      },
    });
  for (const input of q.inputs) {
    const b = await operation().binding(context, q.jobId, input.id);
    expect(b.version).toBe(2);
    expect(b.mediaType).toBe(input.kind === "TEXT" ? "text/plain" : "application/pdf");
    await operation().put(context, q.jobId, input.id);
  }
  f.reopen();
  expect(await operation().recover(context, q.jobId, q.inputs[0].id)).toEqual(
    new TextEncoder().encode(text),
  );
  expect(await operation().recover(context, q.jobId, q.inputs[1].id)).toEqual(pdf);
});
