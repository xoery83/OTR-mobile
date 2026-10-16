import { captureRemoteFixture } from "../../src/domain/capture/__fixtures__/captureRemoteProcessing";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import {
  captureRemoteProcessingBoundary,
  type CaptureRemoteProcessingPort,
} from "./captureRemoteProcessingHttp";
import { validateCaptureRemoteRequest } from "../../src/domain/capture/captureRemoteProcessing";
import { captureCustodyBindingJson } from "../../src/domain/capture/captureCustody";
function fixture() {
  const { binding, input, output } = captureRemoteFixture();
  const port: CaptureRemoteProcessingPort = {
    run: vi.fn(async () => output),
    read: vi.fn(async () => output),
  };
  function request(method = "POST", body: unknown = input, headers = {}) {
    return new Request(
      `https://api.example/v2/capture-jobs/${binding.jobId}/inputs/${binding.inputId}/processing/${input.task.task_id}`,
      {
        method,
        headers: {
          Authorization: "Bearer valid",
          "X-OTR-Capture-Binding": captureCustodyBindingJson(binding),
          "Content-Type": "application/json",
          ...headers,
        },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      },
    );
  }
  return { binding, input, output, port, request };
}
it("uses normal authentication and stays CLOSED without a provisioned executor", async () => {
  const f = fixture(),
    gateway = {
      validateAccessToken: vi.fn(async (t: string) =>
        t === "valid" ? { id: f.binding.accountId } : null,
      ),
    } as unknown as DevBackendGateway;
  const handle = createDevBackendHandler({ gateway, captureRemoteProcessing: f.port });
  expect(
    (await handle(f.request("POST", f.input, { Authorization: "Bearer wrong" }))).status,
  ).toBe(401);
  expect(f.port.run).not.toHaveBeenCalled();
  expect((await createDevBackendHandler({ gateway })(f.request())).status).toBe(503);
  expect(
    (await captureRemoteProcessingBoundary(f.request(), randomUUID(), f.port)).status,
  ).toBe(403);
  expect(f.port.run).not.toHaveBeenCalled();
  expect((await handle(f.request())).status).toBe(200);
  expect(f.port.run).toHaveBeenCalledTimes(1);
});
it("pins text bytes/task identity and rejects caller secrets or changed extraction", async () => {
  const f = fixture();
  expect(validateCaptureRemoteRequest(f.input).binding).toEqual(f.binding);
  for (const input of [
    { ...f.input, providerKey: "never accepted" },
    { ...f.input, localEvidence: { ...f.input.localEvidence, text: "changed" } },
  ]) {
    expect(
      (
        await captureRemoteProcessingBoundary(
          f.request("POST", input),
          f.binding.accountId,
          f.port,
        )
      ).status,
    ).toBe(422);
  }
  expect(f.port.run).not.toHaveBeenCalled();
});
it("reads same task after restart through the supplied durable owner, never dispatches on GET", async () => {
  const f = fixture();
  const r = await captureRemoteProcessingBoundary(
    f.request("GET"),
    f.binding.accountId,
    f.port,
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toContain("no-store");
  expect(f.port.run).not.toHaveBeenCalled();
  expect(await r.json()).toEqual(f.output);
});
it("fences a cross-account/result-task response and does not expose raw errors", async () => {
  const f = fixture();
  f.port.run = vi.fn(async () => ({
    ...f.output,
    binding: { ...f.binding, accountId: randomUUID() },
  }));
  const response = await captureRemoteProcessingBoundary(
    f.request(),
    f.binding.accountId,
    f.port,
  );
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain(f.binding.accountId);
});
it("distinguishes absent result and rejects malformed routes, queries and excessive body", async () => {
  const f = fixture();
  f.port.read = vi.fn(async () => null);
  expect(
    (await captureRemoteProcessingBoundary(f.request("GET"), f.binding.accountId, f.port))
      .status,
  ).toBe(404);
  expect(
    (
      await captureRemoteProcessingBoundary(
        new Request(f.request("GET").url + "?url=https://other.example", {
          headers: f.request("GET").headers,
        }),
        f.binding.accountId,
        f.port,
      )
    ).status,
  ).toBe(422);
  expect(
    (
      await captureRemoteProcessingBoundary(
        f.request("POST", { large: "x".repeat(524289) }),
        f.binding.accountId,
        f.port,
      )
    ).status,
  ).toBe(413);
});
