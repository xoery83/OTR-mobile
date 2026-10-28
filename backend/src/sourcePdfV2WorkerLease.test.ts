import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createSourcePdfV2WorkerLease } from "./sourcePdfV2LinuxWorker";

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function marker() {
  const dir = await mkdtemp(join(tmpdir(), "otr-pdf-lease-"));
  dirs.push(dir);
  return join(dir, "active-worker");
}
const bytes = new Uint8Array([37, 80, 68, 70]);
it("retains UNKNOWN across a reconstructed worker instead of reopening its slot", async () => {
  const path = await marker();
  const unknown = vi.fn(async () => {
    throw Error("PDF_V2_WORKER_TERMINATION_UNKNOWN");
  });
  await expect(createSourcePdfV2WorkerLease(path, unknown)(bytes)).rejects.toThrow(
    "PDF_V2_WORKER_TERMINATION_UNKNOWN",
  );
  const replacement = vi.fn(async () => null);
  await expect(createSourcePdfV2WorkerLease(path, replacement)(bytes)).rejects.toThrow(
    "PDF_V2_WORKER_UNAVAILABLE",
  );
  expect(replacement).not.toHaveBeenCalled();
  expect(await readFile(path, "utf8")).toBe("");
});
it("never removes an existing marker after process loss or operator quarantine", async () => {
  const path = await marker();
  await writeFile(path, "operator retained");
  const worker = vi.fn(async () => null);
  await expect(createSourcePdfV2WorkerLease(path, worker)(bytes)).rejects.toThrow(
    "PDF_V2_WORKER_UNAVAILABLE",
  );
  expect(await readFile(path, "utf8")).toBe("operator retained");
  expect(worker).not.toHaveBeenCalled();
});
it("prevents two independently constructed workers from running concurrently", async () => {
  const path = await marker();
  let finish!: (value: unknown) => void;
  const first = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = createSourcePdfV2WorkerLease(path, first)(bytes);
  await vi.waitFor(() => expect(first).toHaveBeenCalledOnce());
  const next = vi.fn(async () => ({ testOnly: true }));
  await expect(createSourcePdfV2WorkerLease(path, next)(bytes)).rejects.toThrow(
    "PDF_V2_WORKER_UNAVAILABLE",
  );
  expect(next).not.toHaveBeenCalled();
  finish({ testOnly: true });
  await pending;
  expect(await createSourcePdfV2WorkerLease(path, next)(bytes)).toEqual({
    testOnly: true,
  });
});
it("releases only a known-terminated failure for an explicit retry", async () => {
  const path = await marker();
  await expect(
    createSourcePdfV2WorkerLease(path, async () => {
      throw Error("PDF_V2_WORKER_FAILED");
    })(bytes),
  ).rejects.toThrow("PDF_V2_WORKER_FAILED");
  expect(await createSourcePdfV2WorkerLease(path, async () => true)(bytes)).toBe(true);
});
it("requires a trusted absolute marker path and never creates missing parent directories", async () => {
  expect(() => createSourcePdfV2WorkerLease("relative")).toThrow(
    "PDF_V2_WORKER_LOCK_INVALID",
  );
  const path = join(await marker(), "missing", "worker");
  const run = vi.fn();
  await expect(createSourcePdfV2WorkerLease(path, run)(bytes)).rejects.toThrow(
    "PDF_V2_WORKER_UNAVAILABLE",
  );
  expect(run).not.toHaveBeenCalled();
});

it("also retains unexpected failures whose termination cannot be established", async () => {
  const path = await marker();
  await expect(
    createSourcePdfV2WorkerLease(path, async () => {
      throw Error("unexpected");
    })(bytes),
  ).rejects.toThrow("unexpected");
  const run = vi.fn();
  await expect(createSourcePdfV2WorkerLease(path, run)(bytes)).rejects.toThrow(
    "PDF_V2_WORKER_UNAVAILABLE",
  );
  expect(run).not.toHaveBeenCalled();
});
