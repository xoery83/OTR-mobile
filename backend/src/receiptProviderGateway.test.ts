import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  createReceipt,
  downloadReceiptContent,
  statReceiptContent,
  ocrReceipt,
  uploadReceiptContent,
} from "./supabaseGateway";

const bytes = Uint8Array.from([1, 2, 3]);
const sha256 = createHash("sha256").update(bytes).digest("hex");

function fixture(
  options: {
    expenseId?: string | null;
    linkedPayment?: boolean;
    deleted?: boolean;
    provider?: string;
    missing?: boolean;
  } = {},
) {
  let row: Record<string, unknown> | null = options.missing
    ? null
    : {
        id: "receipt",
        journey_id: "journey",
        expense_id: options.expenseId === undefined ? "expense" : options.expenseId,
        created_by: "uploader",
        local_id: "local-receipt",
        storage_provider: options.provider ?? "supabase_storage",
        object_path: "journey/receipt/original",
        mime_type: "image/jpeg",
        size_bytes: bytes.length,
        sha256,
        upload_status: "UPLOADED",
        ocr_status: "PENDING",
        ocr_suggestion: null,
        deleted_at: options.deleted ? "2026-09-27T00:00:00Z" : null,
        created_at: "now",
        updated_at: "now",
      };
  const objects = new Map<string, Blob>();
  objects.set(
    "journey/receipt/original",
    new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
  );
  const upload = vi.fn(
    async (key: string, body: Uint8Array, config: { contentType: string }) => {
      objects.set(key, new Blob([new Uint8Array(body)], { type: config.contentType }));
      return { error: null };
    },
  );
  const download = vi.fn(async (key: string) => ({
    data: objects.get(key) ?? null,
    error: objects.has(key) ? null : { statusCode: "404" },
  }));
  const service = {
    storage: { from: vi.fn(() => ({ upload, download })) },
    rpc: vi.fn(async () => ({ data: options.linkedPayment ?? false, error: null })),
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        limit: async () => ({
          data: table === "journey_members" ? [{ id: "member" }] : [],
          error: null,
        }),
        maybeSingle: async () => ({
          data:
            table === "receipt_assets"
              ? row
              : table === "personal_settlement_payment_attachments" &&
                  options.linkedPayment
                ? { record_id: "payment" }
                : table === "journey_members"
                  ? { id: "member" }
                  : null,
          error: null,
        }),
        update: (patch: Record<string, unknown>) => {
          row = { ...row, ...patch };
          return builder;
        },
        insert: (input: Record<string, unknown>) => {
          if (table === "ledger_idempotency_keys")
            return Promise.resolve({ error: null });
          row = {
            ...input,
            upload_status: "PENDING",
            ocr_status: "PENDING",
            ocr_suggestion: null,
            deleted_at: null,
            created_at: "now",
            updated_at: "now",
          };
          return builder;
        },
        single: async () => ({ data: row, error: null }),
      };
      return builder;
    },
  };
  return { service, upload, download, objects, getRow: () => row };
}

describe("receipt gateway provider routing", () => {
  it("writes the provider identity on new metadata without changing the object key", async () => {
    const { service, getRow } = fixture({ missing: true });
    const result = await createReceipt(
      service as never,
      "uploader",
      "journey",
      "receipt",
      {
        localId: "local-receipt",
        mimeType: "image/jpeg",
        sizeBytes: 3,
        sha256,
      },
    );
    expect(result.idempotentReplay).toBe(false);
    expect(getRow()).toMatchObject({
      storage_provider: "supabase_storage",
      object_path: "journey/receipt/original",
    });
  });

  it("keeps Expense upload bytes, SHA metadata, and duplicate retry identical", async () => {
    const { service, upload, getRow, objects } = fixture();
    await uploadReceiptContent(
      service as never,
      "uploader",
      "journey",
      "receipt",
      bytes,
      "image/jpeg",
    );
    await uploadReceiptContent(
      service as never,
      "uploader",
      "journey",
      "receipt",
      bytes,
      "image/jpeg",
    );
    expect(upload).toHaveBeenCalledTimes(2);
    expect(objects.size).toBe(1);
    expect(getRow()).toMatchObject({ uploaded_size_bytes: 3, uploaded_sha256: sha256 });
    expect(
      await downloadReceiptContent(service as never, "reader", "journey", "receipt"),
    ).toEqual({ bytes, mimeType: "image/jpeg" });
  });

  it("keeps metadata pending when put fails or bytes mismatch", async () => {
    const failed = fixture();
    failed.upload.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(
      uploadReceiptContent(
        failed.service as never,
        "uploader",
        "journey",
        "receipt",
        bytes,
        "image/jpeg",
      ),
    ).rejects.toThrow("provider unavailable");
    expect(failed.getRow()?.uploaded_sha256).toBeUndefined();
    await expect(
      uploadReceiptContent(
        failed.service as never,
        "uploader",
        "journey",
        "receipt",
        Uint8Array.from([9, 9, 9]),
        "image/jpeg",
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(failed.upload).toHaveBeenCalledTimes(1);
  });

  it("denies tombstones and unknown providers before reading binary", async () => {
    const tombstone = fixture({ deleted: true });
    await expect(
      downloadReceiptContent(tombstone.service as never, "reader", "journey", "receipt"),
    ).rejects.toMatchObject({ status: 404 });
    expect(tombstone.download).not.toHaveBeenCalled();
    const unknown = fixture({ provider: "unknown" });
    await expect(
      downloadReceiptContent(unknown.service as never, "reader", "journey", "receipt"),
    ).rejects.toThrow("Unsupported attachment storage provider.");
    expect(unknown.download).not.toHaveBeenCalled();
    const missing = fixture();
    missing.objects.clear();
    await expect(
      downloadReceiptContent(missing.service as never, "reader", "journey", "receipt"),
    ).rejects.toThrow("download failed");
  });

  it("confirms exact provider bytes and MIME, failing closed on mismatch", async () => {
    const current = fixture();
    expect(
      await statReceiptContent(current.service as never, "reader", "journey", "receipt"),
    ).toEqual({
      sizeBytes: 3,
      sha256,
      mimeType: "image/jpeg",
      objectPath: "journey/receipt/original",
    });
    const key = "journey/receipt/original";
    current.objects.set(key, new Blob([Uint8Array.from([1, 2])], { type: "image/jpeg" }));
    await expect(
      statReceiptContent(current.service as never, "reader", "journey", "receipt"),
    ).rejects.toMatchObject({ code: "RECEIPT_REMOTE_MISMATCH" });
    current.objects.set(
      key,
      new Blob([Uint8Array.from([9, 9, 9])], { type: "image/jpeg" }),
    );
    await expect(
      statReceiptContent(current.service as never, "reader", "journey", "receipt"),
    ).rejects.toMatchObject({ code: "RECEIPT_REMOTE_MISMATCH" });
    current.objects.set(key, new Blob([bytes], { type: "application/pdf" }));
    await expect(
      statReceiptContent(current.service as never, "reader", "journey", "receipt"),
    ).rejects.toMatchObject({ code: "RECEIPT_REMOTE_MISMATCH" });
    current.objects.clear();
    await expect(
      statReceiptContent(current.service as never, "reader", "journey", "receipt"),
    ).rejects.toMatchObject({ status: 409 });
    const unknown = fixture({ provider: "unknown" });
    await expect(
      statReceiptContent(unknown.service as never, "reader", "journey", "receipt"),
    ).rejects.toThrow("Unsupported attachment storage provider.");
    expect(unknown.download).not.toHaveBeenCalled();
  });

  it("preserves Personal Payment historical read grants independently of Expense", async () => {
    const payment = fixture({ expenseId: null, linkedPayment: true });
    expect(
      await downloadReceiptContent(
        payment.service as never,
        "counterparty",
        "journey",
        "receipt",
      ),
    ).toEqual({ bytes, mimeType: "image/jpeg" });
    expect(payment.service.rpc).toHaveBeenCalledWith(
      "ledger_can_read_personal_settlement_payment_1a",
      { actor_user: "counterparty", target_record: "payment" },
    );
  });

  it("routes the existing unlinked OCR binary read through the provider", async () => {
    const unlinked = fixture({ expenseId: null });
    const extract = vi.fn(async () => ({
      title: null,
      amountMinor: null,
      currency: null,
      occurredAt: null,
      category: null,
    }));
    await ocrReceipt(
      unlinked.service as never,
      { extract },
      "uploader",
      "journey",
      "receipt",
      "ocr-key",
    );
    expect(unlinked.download).toHaveBeenCalledWith("journey/receipt/original");
    expect(extract).toHaveBeenCalledWith({ bytes, mimeType: "image/jpeg" });
  });
});
