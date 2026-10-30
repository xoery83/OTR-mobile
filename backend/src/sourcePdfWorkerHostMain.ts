import { startSourcePdfWorkerHost } from "./sourcePdfWorkerHost";

// Dedicated host operator entry, never imported by Backend startup.
if (process.platform !== "linux" || process.arch !== "x64" || process.getuid?.() !== 0)
  throw Error("PDF_WORKER_HOST_IDENTITY_REQUIRED");
const server = await startSourcePdfWorkerHost({
  directory: "/run/otr/universal-pdf-worker",
  ownerUid: 0,
  socketGid: 999,
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    server.close();
    server.closeIdleConnections();
  });
