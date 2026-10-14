import { createServer } from "node:http";

import { z } from "zod";

import { createDevBackendHandler, type BackendDependencies } from "./app";
import { createSupabaseDevGateway } from "./supabaseGateway";
import { createReceiptOcrProvider } from "./receiptOcrProvider";
import { initializeDevFlightLiveHost } from "./flightLiveHost";
import { loadDevPublicationCatalog } from "./tripPublicationCatalogRuntime";
import { createRateDemandScanner } from "./rateDemandScanner";

const environmentSchema = z
  .object({
    OTR_DEV_BACKEND_NETWORK_MODE: z.enum(["bridge", "host"]).default("bridge"),
    OTR_DEV_BACKEND_BIND_ADDRESS: z.string().optional(),
    OTR_DEV_SUPABASE_URL: z.url(),
    OTR_DEV_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    OTR_DEV_SUPABASE_SECRET_KEY: z.string().min(1),
    OTR_DEV_BACKEND_PORT: z.coerce.number().int().positive().default(8787),
    OTR_DEV_RECEIPT_OCR_ACCEPTANCE_FIXTURE: z.enum(["0", "1"]).default("0"),
  })
  .superRefine((environment, context) => {
    const hostMode = environment.OTR_DEV_BACKEND_NETWORK_MODE === "host";
    const address = hostMode ? "127.0.0.1" : "0.0.0.0";
    if (
      environment.OTR_DEV_BACKEND_BIND_ADDRESS !== address &&
      (hostMode || environment.OTR_DEV_BACKEND_BIND_ADDRESS !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["OTR_DEV_BACKEND_BIND_ADDRESS"],
        message: `Expected exact ${address} for the selected DEV network mode.`,
      });
    }
    if (hostMode && environment.OTR_DEV_BACKEND_PORT !== 8787) {
      context.addIssue({
        code: "custom",
        path: ["OTR_DEV_BACKEND_PORT"],
        message: "DEV host mode requires port 8787.",
      });
    }
  });

export function startDevBackend(
  startOptions: Pick<
    BackendDependencies,
    "tripCreatePort" | "coreConnection" | "documentOriginalReader"
  > = {},
) {
  const environment = environmentSchema.parse(process.env);
  // Backend-private, unprovisioned and CLOSED. No HTTP route, polling or provider call.
  void initializeDevFlightLiveHost((key) => process.env[key]).catch(() => {
    console.info(
      JSON.stringify({ level: "warn", event: "dev_flight_host", status: "CLOSED" }),
    );
  });
  let scanner: ReturnType<typeof createRateDemandScanner> | null = null;
  const publicationCatalogConnection = loadDevPublicationCatalog(
    environment.OTR_DEV_BACKEND_NETWORK_MODE,
    environment.OTR_DEV_SUPABASE_URL,
  );
  const gateway = createSupabaseDevGateway({
    publicationCatalogConnection,
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
    tripCreatePort: startOptions.tripCreatePort,
    coreConnection: startOptions.coreConnection,
    documentOriginalReader: startOptions.documentOriginalReader,
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
      const textSourceRoute =
        /^\/v2\/trips\/[^/]+\/sources\/(?:acquire|runs\/publish)(?:\?|$)/.test(
          incoming.url ?? "",
        );
      const originalRoute =
        /^\/v2\/trips\/[^/]+\/documents\/[^/]+\/original(?:\?|$)/.test(
          incoming.url ?? "",
        );
      let byteCount = 0;
      for await (const chunk of incoming) {
        byteCount += chunk.length;
        if (originalRoute && byteCount > 0) {
          outgoing.statusCode = 413;
          outgoing.setHeader("Content-Type", "application/json");
          outgoing.setHeader("Cache-Control", "private, no-store");
          outgoing.end(JSON.stringify({ error: { code: "ORIGINAL_UNAVAILABLE" } }));
          return;
        }
        if (textSourceRoute && byteCount > 2097152) {
          outgoing.statusCode = 413;
          outgoing.setHeader("Content-Type", "application/json");
          outgoing.setHeader("Cache-Control", "private, no-store");
          outgoing.end(
            JSON.stringify({
              error: {
                code: "INVALID_SOURCE_COMMAND",
                message: "INVALID_SOURCE_COMMAND",
              },
            }),
          );
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
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

  server.on("close", () => {
    scanner?.stop();
    void publicationCatalogConnection?.close();
  });
  server.listen(
    environment.OTR_DEV_BACKEND_PORT,
    environment.OTR_DEV_BACKEND_NETWORK_MODE === "host" ? "127.0.0.1" : "0.0.0.0",
    () => {
      console.info(
        JSON.stringify({
          level: "info",
          event: "listening",
          port: environment.OTR_DEV_BACKEND_PORT,
          environment: "development",
        }),
      );
      scanner?.start();
    },
  );

  return server;
}
