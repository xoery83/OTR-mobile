import { createServer } from "node:http";

import { z } from "zod";

import { createDevBackendHandler } from "./app";
import { createSupabaseDevGateway } from "./supabaseGateway";
import { createReceiptOcrProvider } from "./receiptOcrProvider";
import { createRateDemandScanner } from "./rateDemandScanner";

const environmentSchema = z.object({
  OTR_DEV_SUPABASE_URL: z.url(),
  OTR_DEV_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  OTR_DEV_SUPABASE_SECRET_KEY: z.string().min(1),
  OTR_DEV_BACKEND_PORT: z.coerce.number().int().positive().default(8787),
  OTR_DEV_RECEIPT_OCR_ACCEPTANCE_FIXTURE: z.enum(["0", "1"]).default("0"),
});

const environment = environmentSchema.parse(process.env);
let scanner: ReturnType<typeof createRateDemandScanner> | null = null;
const gateway = createSupabaseDevGateway({
  url: environment.OTR_DEV_SUPABASE_URL,
  publishableKey: environment.OTR_DEV_SUPABASE_PUBLISHABLE_KEY,
  secretKey: environment.OTR_DEV_SUPABASE_SECRET_KEY,
  receiptOcrProvider: createReceiptOcrProvider(
    environment.OTR_DEV_RECEIPT_OCR_ACCEPTANCE_FIXTURE === "1",
  ),
  onRateDemand: () => scanner?.wake(),
  onMyLedgerRead: (event) =>
    console.info(
      JSON.stringify({
        level: event.failureClass ? "warn" : "info",
        event: "my_ledger_read",
        ...event,
      }),
    ),
});
scanner = createRateDemandScanner(
  () => gateway.acquirePendingRateQuotes!(),
  (event) =>
    console.info(
      JSON.stringify({ level: event.failureClass ? "error" : "info", ...event }),
    ),
);
const handle = createDevBackendHandler({
  gateway,
  log(event) {
    console.info(JSON.stringify({ level: "info", event: "request", ...event }));
  },
});

const server = createServer(async (incoming, outgoing) => {
  const controller = new AbortController();
  const onClose = () => {
    if (!outgoing.writableFinished) controller.abort();
  };
  outgoing.on("close", onClose);
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const request = new Request(
      `http://${incoming.headers.host ?? "127.0.0.1"}${incoming.url ?? "/"}`,
      {
        method: incoming.method,
        headers: incoming.headers as HeadersInit,
        body: body.length ? body : undefined,
        signal: controller.signal,
      },
    );
    const response = await handle(request);
    if (outgoing.destroyed) return;

    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } finally {
    outgoing.off("close", onClose);
  }
});

server.on("close", () => scanner?.stop());
server.listen(environment.OTR_DEV_BACKEND_PORT, "0.0.0.0", () => {
  console.info(
    JSON.stringify({
      level: "info",
      event: "listening",
      port: environment.OTR_DEV_BACKEND_PORT,
      environment: "development",
    }),
  );
  scanner?.start();
});
