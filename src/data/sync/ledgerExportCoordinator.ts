import { getDefaultLedgerExportRepository } from "@/data/repositories/defaultLedgerExportRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import type {
  SettlementExportFormat,
  SettlementExportManifest,
} from "@/data/repositories/ledgerExportRepository";
import { createSettlementExportFileStore } from "@/data/files/settlementExportFileStore";
import { digestSettlementStatement } from "@/data/files/settlementStatementDigest";
import {
  buildSettlementExportDocument,
  settlementExportCsv,
  settlementExportHtml,
  type SettlementExportPrivacy,
} from "@/domain/ledger/settlementExport";
import {
  assertCurrentFinalStatement,
  buildSettlementStatement,
} from "@/domain/ledger/settlementStatement";
import { runLedgerExpenseSync } from "./ledgerExpenseDemoCoordinator";
import { revalidateJourneyLedger } from "./ledgerReportingCoordinator";
import { runLedgerSettlementPaymentSync } from "./ledgerSettlementPaymentCoordinator";

type Dependencies = {
  syncExpenses?: typeof runLedgerExpenseSync;
  syncSettlement?: typeof runLedgerSettlementPaymentSync;
  revalidate?: typeof revalidateJourneyLedger;
  settlementRepository?: Awaited<ReturnType<typeof getDefaultLedgerSettlementRepository>>;
  exportRepository?: Awaited<ReturnType<typeof getDefaultLedgerExportRepository>>;
  fileStore?: ReturnType<typeof createSettlementExportFileStore>;
  now?: () => string;
};

export async function generateCurrentSettlementExport(
  journeyId: string,
  format: SettlementExportFormat,
  privacyMode: SettlementExportPrivacy,
  dependencies: Dependencies = {},
) {
  const { statement, settlements } = await validateCurrentSettlementStatement(
    journeyId,
    dependencies,
  );
  if (!(await settlements.isOrganizer(journeyId)))
    throw new Error("Organizer export access is required.");

  const statementDigest = await digestSettlementStatement(statement);
  const document = buildSettlementExportDocument(statement, privacyMode);
  const files = dependencies.fileStore ?? createSettlementExportFileStore();
  const identity = {
    rootSettlementId: statement.rootSettlementId,
    headSettlementId: statement.headSettlementId,
    statementDigest,
    privacyMode,
  };
  const file =
    format === "CSV"
      ? await files.writeCsv(identity, settlementExportCsv(document))
      : await files.writePdf(identity, settlementExportHtml(document));
  const manifest: SettlementExportManifest = {
    ...identity,
    journeyId,
    exportSchemaVersion: statement.schemaVersion,
    format,
    fileUri: file.uri,
    fileSha256: file.sha256,
    generatedAt: (dependencies.now ?? (() => new Date().toISOString()))(),
  };
  await (
    dependencies.exportRepository ?? (await getDefaultLedgerExportRepository())
  ).save(manifest);
  return { manifest, statement };
}

export async function validateCurrentSettlementStatement(
  journeyId: string,
  dependencies: Dependencies = {},
) {
  await (dependencies.syncExpenses ?? runLedgerExpenseSync)({ journeyId });
  await (dependencies.syncSettlement ?? runLedgerSettlementPaymentSync)(
    "AUTHENTICATED_ONLINE",
    journeyId,
  );

  const settlements =
    dependencies.settlementRepository ?? (await getDefaultLedgerSettlementRepository());
  if (await settlements.hasPendingFinancialOperations(journeyId))
    throw new Error("Sync all pending financial changes before exporting.");

  const canonical = await (dependencies.revalidate ?? revalidateJourneyLedger)(journeyId);
  const serverLineage = canonical.settlements ?? [];
  const serverRoot = serverLineage.find((row) => (row.kind ?? "ROOT") === "ROOT");
  const serverHead = [...serverLineage]
    .sort((left, right) => (left.lineageSequence ?? 0) - (right.lineageSequence ?? 0))
    .at(-1);
  if (!serverRoot || !serverHead) throw new Error("Canonical Settlement is missing.");

  if (await settlements.hasPendingFinancialOperations(journeyId))
    throw new Error("Financial state changed while validating the export.");
  const statement = buildSettlementStatement(await settlements.listFinalized(journeyId));
  const serverIdentity = serverLineage
    .map((row) => `${row.lineageSequence ?? 0}:${row.id}:${row.inputDigest}`)
    .sort();
  const localIdentity = statement.lineage
    .map((row) => `${row.sequence}:${row.id}:${row.inputDigest}`)
    .sort();
  if (JSON.stringify(localIdentity) !== JSON.stringify(serverIdentity)) {
    throw new Error("Local Settlement head does not match the canonical server head.");
  }
  assertCurrentFinalStatement(statement);
  return { statement, settlements };
}

export async function listSettlementExports(journeyId: string) {
  const repository = await getDefaultLedgerExportRepository();
  const manifests = await repository.list(journeyId);
  const settlements = await getDefaultLedgerSettlementRepository();
  const rows = await settlements.listFinalized(journeyId);
  const statement = rows.length ? buildSettlementStatement(rows) : null;
  const currentDigest = statement ? await digestSettlementStatement(statement) : null;
  const files = createSettlementExportFileStore();
  const result = [];
  for (const manifest of manifests) {
    if (await files.exists(manifest.fileUri)) {
      result.push({
        ...manifest,
        isCurrent:
          manifest.statementDigest === currentDigest &&
          manifest.headSettlementId === statement?.headSettlementId,
      });
    }
  }
  return result;
}

export async function shareSettlementExport(manifest: SettlementExportManifest) {
  if (
    !(await (
      await getDefaultLedgerSettlementRepository()
    ).isOrganizer(manifest.journeyId))
  )
    throw new Error("Organizer export access is required.");
  const files = createSettlementExportFileStore();
  if (!(await files.verify(manifest.fileUri, manifest.fileSha256)))
    throw new Error("Cached export failed its integrity check.");
  await files.share(manifest.fileUri, manifest.format);
}
