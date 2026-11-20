import { beforeEach, expect, it, vi } from "vitest";
import { captureAccountScope } from "../auth/accountRequestContext";
import { ApiClientError } from "../api/client";
import { runP3ReceiptQaProbe } from "./p3ReceiptQaProbe";
const f = vi.hoisted(() => ({
  text: null as string | null,
  user: "1f3d7935-1bdc-4952-8d7f-0f72077368c1",
  receipt: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "synthetic" },
  File: class {
    get exists() {
      return f.text !== null;
    }
    create() {
      if (this.exists) throw Error("EXISTS");
      f.text = "";
    }
    write(value: string) {
      f.text = value;
    }
  },
}));
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: async () => f.user }));
vi.mock("../repositories/tripCoreSha256", () => ({ tripCoreSha256Hex: vi.fn() }));
vi.mock("../api/tripCoreV2Transport", () => ({
  createCoreV2Transport: () => ({ receipt: f.receipt, submit: f.submit }),
}));
beforeEach(() => {
  f.text = null;
  f.user = "1f3d7935-1bdc-4952-8d7f-0f72077368c1";
  vi.clearAllMocks();
  f.receipt.mockResolvedValue(null);
});
it("persists before reading and never repeats or submits, including after module reload", async () => {
  const scope = await captureAccountScope(async () => f.user);
  f.receipt.mockImplementation(async () => {
    expect(JSON.parse(f.text!).status).toBe("STARTED");
    return null;
  });
  await runP3ReceiptQaProbe(scope);
  await runP3ReceiptQaProbe(scope);
  vi.resetModules();
  await (await import("./p3ReceiptQaProbe")).runP3ReceiptQaProbe(scope);
  expect(f.receipt).toHaveBeenCalledTimes(1);
  expect(f.submit).not.toHaveBeenCalled();
  expect(JSON.parse(f.text!)).toMatchObject({
    synthetic: true,
    status: "NOT_FOUND",
    outcome: null,
  });
});
it("rejects a different account before reading or writing", async () => {
  const scope = await captureAccountScope(async () => f.user);
  await expect(runP3ReceiptQaProbe({ ...scope, accountId: "wrong" })).rejects.toThrow(
    "ACCOUNT_MISMATCH",
  );
  expect(f.receipt).not.toHaveBeenCalled();
  expect(f.text).toBeNull();
});
it("records only fixed 503 code and a safe request ID", async () => {
  f.receipt.mockRejectedValue(
    new ApiClientError(
      "secret",
      "http",
      503,
      "CORE_CAPABILITY_CLOSED",
      { secret: true },
      "11111111-1111-1111-1111-111111111111",
    ),
  );
  await runP3ReceiptQaProbe(await captureAccountScope(async () => f.user));
  expect(JSON.parse(f.text!)).toMatchObject({
    status: "ERROR",
    httpStatus: 503,
    code: "CORE_CAPABILITY_CLOSED",
  });
  expect(f.text).not.toContain("secret");
  expect(f.submit).not.toHaveBeenCalled();
});
it("redacts arbitrary errors and discards results after an account switch", async () => {
  f.receipt.mockRejectedValue(
    new ApiClientError("secret", "http", 503, "secret", "secret", "secret"),
  );
  const scope = await captureAccountScope(async () => f.user);
  await runP3ReceiptQaProbe(scope);
  expect(f.text).not.toContain("secret");
  f.text = null;
  f.receipt.mockImplementation(async () => {
    f.user = "other";
    return null;
  });
  await expect(runP3ReceiptQaProbe(scope)).rejects.toThrow("Account changed");
  expect(JSON.parse(f.text!).status).toBe("STARTED");
});
