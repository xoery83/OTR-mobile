import { fetch } from "expo/fetch";

import { ApiClientError, createApiClient } from "@/data/api/client";
import {
  completeReceiptRequestSchema,
  createReceiptRequestSchema,
  linkReceiptRequestSchema,
  linkPersonalPaymentAttachmentRequestSchema,
  personalPaymentAttachmentListResponseSchema,
  receiptMutationResponseSchema,
  type CompleteReceiptRequest,
  type CreateReceiptRequest,
} from "@/data/api/ledgerReceiptContracts";
import { readLocalSession } from "@/data/auth/authRepository";
import { resolveReceiptFile } from "@/data/files/receiptFileStore";

async function authenticated() {
  const session = await readLocalSession();
  if (!session?.accessToken)
    throw new ApiClientError(
      "Authentication is unavailable.",
      "http",
      401,
      "AUTH_REQUIRED",
    );
  return {
    client: createApiClient({ accessToken: session.accessToken }),
    token: session.accessToken,
  };
}

export function createLedgerReceiptTransport() {
  return {
    async download(journeyId: string, receiptId: string) {
      const { token } = await authenticated();
      const baseUrl = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
      if (!baseUrl) throw new Error("OTR API base URL is required.");
      try {
        const response = await fetch(
          `${baseUrl}/v2/trips/${journeyId}/receipts/${receiptId}/content`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (response.status < 200 || response.status >= 300)
          throw new ApiClientError("Receipt download failed.", "http", response.status);
        return new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        if (error instanceof ApiClientError) throw error;
        throw new ApiClientError("Receipt download is unavailable.", "network");
      }
    },
    async create(journeyId: string, key: string, input: CreateReceiptRequest) {
      const { client } = await authenticated();
      return client.post(
        `/v2/trips/${journeyId}/receipts`,
        createReceiptRequestSchema.parse(input),
        receiptMutationResponseSchema,
        { "Idempotency-Key": key },
      );
    },
    async upload(
      journeyId: string,
      receiptId: string,
      localUri: string,
      mimeType: string,
    ) {
      const { token } = await authenticated();
      const baseUrl = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
      if (!baseUrl) throw new Error("OTR API base URL is required.");
      const file = resolveReceiptFile(localUri);
      try {
        const response = await fetch(
          `${baseUrl}/v2/trips/${journeyId}/receipts/${receiptId}/content`,
          {
            method: "PUT",
            body: file,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType },
          },
        );
        if (response.status < 200 || response.status >= 300)
          throw new ApiClientError("Receipt upload failed.", "http", response.status);
        return file.uri;
      } catch (error) {
        if (error instanceof ApiClientError) throw error;
        throw new ApiClientError("Receipt upload is unavailable.", "network");
      }
    },
    async complete(
      journeyId: string,
      receiptId: string,
      key: string,
      input: CompleteReceiptRequest,
    ) {
      const { client } = await authenticated();
      return client.post(
        `/v2/trips/${journeyId}/receipts/${receiptId}/upload-complete`,
        completeReceiptRequestSchema.parse(input),
        receiptMutationResponseSchema,
        { "Idempotency-Key": key },
      );
    },
    async ocr(journeyId: string, receiptId: string, key: string) {
      const { client } = await authenticated();
      return client.post(
        `/v2/trips/${journeyId}/receipts/${receiptId}/ocr`,
        {},
        receiptMutationResponseSchema,
        { "Idempotency-Key": key },
      );
    },
    async link(journeyId: string, receiptId: string, expenseId: string, key: string) {
      const { client } = await authenticated();
      return client.post(
        `/v2/trips/${journeyId}/receipts/${receiptId}/links`,
        linkReceiptRequestSchema.parse({ expenseId }),
        receiptMutationResponseSchema,
        { "Idempotency-Key": key },
      );
    },
    async linkPersonalPayment(
      journeyId: string,
      receiptId: string,
      paymentId: string,
      key: string,
    ) {
      const { client } = await authenticated();
      return client.post(
        `/v2/trips/${journeyId}/ledger/personal-payments/${paymentId}/attachments`,
        linkPersonalPaymentAttachmentRequestSchema.parse({ receiptId }),
        receiptMutationResponseSchema,
        { "Idempotency-Key": key },
      );
    },
    async listPersonalPaymentAttachments(journeyId: string, paymentId: string) {
      const { client } = await authenticated();
      return client.get(
        `/v2/trips/${journeyId}/ledger/personal-payments/${paymentId}/attachments`,
        personalPaymentAttachmentListResponseSchema,
      );
    },
    async unlinkPersonalPayment(
      journeyId: string,
      paymentId: string,
      receiptId: string,
      key: string,
    ) {
      const { client } = await authenticated();
      return client.delete(
        `/v2/trips/${journeyId}/ledger/personal-payments/${paymentId}/attachments/${receiptId}`,
        {},
        receiptMutationResponseSchema,
        { "Idempotency-Key": key },
      );
    },
  };
}
