import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerPersonalPaymentRepository } from "@/data/repositories/defaultLedgerPersonalPaymentRepository";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import { refreshLedgerPersonalPayments } from "@/data/sync/ledgerPersonalPaymentCoordinator";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { createLedgerReceiptTransport } from "@/data/sync/ledgerReceiptTransport";

export async function refreshPersonalPaymentPresentation(journeyId: string) {
  await refreshLedgerPersonalPayments(journeyId);
  const payments = await (
    await getDefaultLedgerPersonalPaymentRepository()
  ).listForJourney(journeyId);
  const receipts = await getDefaultLedgerReceiptRepository();
  const transport = createLedgerReceiptTransport();
  for (const payment of payments) {
    const response = await transport.listPersonalPaymentAttachments(
      journeyId,
      payment.id,
    );
    await receipts.applyPersonalPaymentAttachments(payment.id, response.attachments);
  }
}

export async function refreshPersonalPaymentRateQuotes(
  journeyId: string,
  quoteCurrency: string,
  baseCurrency: string,
) {
  const repository = await getDefaultLedgerExpenseRepository();
  const remote = await createLedgerReadTransport().rateQuotes(
    journeyId,
    quoteCurrency,
    baseCurrency,
  );
  await Promise.all(remote.map((quote) => repository.cacheRateQuote(quote)));
}
