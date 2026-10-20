import { useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";

import { signInToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import { digestSettlementStatement } from "@/data/files/settlementStatementDigest";
import { getDefaultLedgerExportRepository } from "@/data/repositories/defaultLedgerExportRepository";
import {
  generateCurrentSettlementExport,
  shareSettlementExport,
  validateCurrentSettlementStatement,
} from "@/data/sync/ledgerExportCoordinator";
import {
  buildSettlementExportDocument,
  settlementExportCsv,
  settlementExportHtml,
} from "@/domain/ledger/settlementExport";

export type Stage73AcceptanceCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export function useStage73Acceptance(journeyId?: string, action?: string) {
  const [checks, setChecks] = useState<Stage73AcceptanceCheck[]>([]);
  useEffect(() => {
    if (!journeyId) return;
    if (action === "share-cached") {
      void shareCached(journeyId).catch((error: unknown) =>
        setChecks([
          {
            name: "Cached share",
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
          },
        ]),
      );
      return;
    }
    void run(journeyId, action === "organizer" || action === "share", action === "share")
      .then(setChecks)
      .catch((error: unknown) =>
        setChecks([
          {
            name: "Acceptance run",
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
          },
        ]),
      );
  }, [action, journeyId]);
  return checks;
}

async function shareCached(journeyId: string) {
  const manifests = await (await getDefaultLedgerExportRepository()).list(journeyId);
  const target = manifests.find(
    (item) => item.privacyMode === "MEMBER" && item.format === "CSV",
  );
  if (!target) throw new Error("Cached member CSV is missing.");
  await shareSettlementExport(target);
}

async function run(journeyId: string, generate: boolean, share: boolean) {
  if (
    !process.env.EXPO_PUBLIC_OTR_DEV_SUPABASE_URL?.includes(
      "tuqigdxrvrerfewsxqgm.supabase.co",
    )
  ) {
    throw new Error("Stage 7.3 acceptance is restricted to the approved Dev project.");
  }
  await signInFor(generate ? "organizer" : "member");
  const checks: Stage73AcceptanceCheck[] = [];
  const { statement, settlements } = await validateCurrentSettlementStatement(journeyId);
  const digest = await digestSettlementStatement(statement);
  const database = await openDatabase();
  const before = await financialFingerprint(database, journeyId);
  const member = buildSettlementExportDocument(statement, "MEMBER");
  const deidentified = buildSettlementExportDocument(statement, "DE_IDENTIFIED");
  const memberCsv = settlementExportCsv(member);
  const deidentifiedCsv = settlementExportCsv(deidentified);
  const memberHtml = settlementExportHtml(member);
  const deidentifiedHtml = settlementExportHtml(deidentified);

  checks.push({
    name: "Canonical current final Statement",
    ok: statement.adjustmentState === "CURRENT" && statement.fullySettled,
    detail: `${statement.lineage.length} lineage rows · ${digest.slice(0, 12)}`,
  });

  if (generate) {
    if (!(await settlements.isOrganizer(journeyId)))
      throw new Error("Organizer identity is required for export generation acceptance.");
    for (const privacy of ["MEMBER", "DE_IDENTIFIED"] as const) {
      await generateCurrentSettlementExport(journeyId, "CSV", privacy);
      await generateCurrentSettlementExport(journeyId, "PDF", privacy);
    }
    const manifests = await (await getDefaultLedgerExportRepository()).list(journeyId);
    const currentManifests = manifests.filter((item) => item.statementDigest === digest);
    const historicalManifests = manifests.filter(
      (item) => item.statementDigest !== digest,
    );
    checks.push({
      name: "Durable digest-keyed artifacts",
      ok:
        currentManifests.length >= 4 &&
        currentManifests.every(
          (item) =>
            item.rootSettlementId === statement.rootSettlementId &&
            item.headSettlementId === statement.headSettlementId &&
            item.fileSha256.length === 64 &&
            item.fileUri.includes("/Documents/settlement-exports/"),
        ),
      detail: `${currentManifests.length} current manifests`,
    });
    if (historicalManifests.length)
      checks.push({
        name: "Prior exports labeled historical",
        ok: historicalManifests.every(
          (item) =>
            item.rootSettlementId === statement.rootSettlementId &&
            item.headSettlementId !== statement.headSettlementId &&
            item.fileUri.includes(`/${item.statementDigest}/`),
        ),
        detail: `${historicalManifests.length} historical manifests`,
      });
    if (share) {
      const target = currentManifests.find(
        (item) => item.privacyMode === "MEMBER" && item.format === "CSV",
      );
      if (!target) throw new Error("Current member CSV is missing.");
      await shareSettlementExport(target);
    }
  }

  const after = await financialFingerprint(database, journeyId);
  checks.push({
    name: "No Ledger financial mutation",
    ok: before === after,
    detail: before.slice(0, 12),
  });

  const sensitive = await sensitiveValues(database, journeyId, statement);
  const memberOutput = `${memberCsv}\n${memberHtml}`;
  const deidentifiedOutput = `${deidentifiedCsv}\n${deidentifiedHtml}`;
  checks.push({
    name: "Member export privacy",
    ok: sensitive.privateValues.every((value) => !memberOutput.includes(value)),
    detail: `${sensitive.privateValues.length} private values excluded`,
  });
  checks.push({
    name: "De-identified export privacy",
    ok:
      sensitive.linkableValues.every((value) => !deidentifiedOutput.includes(value)) &&
      !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(
        deidentifiedOutput,
      ),
    detail: `${sensitive.linkableValues.length} linkable values excluded`,
  });

  const diagnostic = {
    journeyId,
    role: generate ? "organizer" : "member",
    statementDigest: digest,
    memberCsvSha256: await hash(memberCsv),
    deidentifiedCsvSha256: await hash(deidentifiedCsv),
    memberHtmlSha256: await hash(memberHtml),
    deidentifiedHtmlSha256: await hash(deidentifiedHtml),
    exportRows: member.rows.length,
    financialFingerprint: after,
    checks,
  };
  if (!FileSystem.cacheDirectory)
    throw new Error("Acceptance diagnostic cache is unavailable.");
  await FileSystem.writeAsStringAsync(
    `${FileSystem.cacheDirectory}stage7-3-acceptance.json`,
    JSON.stringify(diagnostic),
  );
  return checks;
}

async function signInFor(role: "organizer" | "member") {
  const organizer = role === "organizer";
  const email = organizer
    ? process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL
    : process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_EMAIL;
  const password = organizer
    ? process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD
    : process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_PASSWORD;
  if (!email || !password) throw new Error(`Missing Stage 7.3 ${role} credentials.`);
  await signInToSupabaseDev(email, password);
}

async function financialFingerprint(
  database: Awaited<ReturnType<typeof openDatabase>>,
  journeyId: string,
) {
  const row = await database.getFirstAsync<Record<string, number>>(
    `SELECT
      (SELECT COUNT(*) FROM ledger_settlements WHERE journey_id = ?) settlements,
      (SELECT COALESCE(SUM(revision), 0) FROM ledger_settlements WHERE journey_id = ?) settlement_revisions,
      (SELECT COUNT(*) FROM ledger_settlement_inputs i JOIN ledger_settlements s ON s.id = i.settlement_id WHERE s.journey_id = ?) inputs,
      (SELECT COUNT(*) FROM ledger_settlement_member_balances b JOIN ledger_settlements s ON s.id = b.settlement_id WHERE s.journey_id = ?) balances,
      (SELECT COUNT(*) FROM ledger_settlement_adjustment_deltas d JOIN ledger_settlements s ON s.id = d.settlement_id WHERE s.journey_id = ?) deltas,
      (SELECT COUNT(*) FROM ledger_settlement_transfers t JOIN ledger_settlements s ON s.id = t.settlement_id WHERE s.journey_id = ?) transfers,
      (SELECT COALESCE(SUM(t.revision), 0) FROM ledger_settlement_transfers t JOIN ledger_settlements s ON s.id = t.settlement_id WHERE s.journey_id = ?) transfer_revisions,
      (SELECT COUNT(*) FROM ledger_settlement_payments p JOIN ledger_settlement_transfers t ON t.id = p.transfer_id JOIN ledger_settlements s ON s.id = t.settlement_id WHERE s.journey_id = ?) payments,
      (SELECT COALESCE(SUM(p.revision), 0) FROM ledger_settlement_payments p JOIN ledger_settlement_transfers t ON t.id = p.transfer_id JOIN ledger_settlements s ON s.id = t.settlement_id WHERE s.journey_id = ?) payment_revisions,
      (SELECT COUNT(*) FROM ledger_settlement_payment_discharges d JOIN ledger_settlement_payments p ON p.id = d.payment_id JOIN ledger_settlement_transfers t ON t.id = p.transfer_id JOIN ledger_settlements s ON s.id = t.settlement_id WHERE s.journey_id = ?) discharges,
      (SELECT COUNT(*) FROM ledger_settlement_audit_events a JOIN ledger_settlements s ON s.id = a.settlement_id WHERE s.journey_id = ?) audits,
      (SELECT COALESCE(SUM(a.settlement_revision), 0) FROM ledger_settlement_audit_events a JOIN ledger_settlements s ON s.id = a.settlement_id WHERE s.journey_id = ?) audit_revisions`,
    ...Array(12).fill(journeyId),
  );
  return hash(JSON.stringify(row));
}

async function sensitiveValues(
  database: Awaited<ReturnType<typeof openDatabase>>,
  journeyId: string,
  statement: Awaited<ReturnType<typeof validateCurrentSettlementStatement>>["statement"],
) {
  const privateRows = await database.getAllAsync<{
    userId: string | null;
    notes: string | null;
    evidenceAssetId: string | null;
  }>(
    `SELECT c.user_id userId, p.notes, p.evidence_asset_id evidenceAssetId
     FROM ledger_actor_context c
     LEFT JOIN ledger_settlements s ON s.journey_id = c.journey_id
     LEFT JOIN ledger_settlement_transfers t ON t.settlement_id = s.id
     LEFT JOIN ledger_settlement_payments p ON p.transfer_id = t.id
     WHERE c.journey_id = ?`,
    journeyId,
  );
  const members = new Map<string, string>();
  for (const row of statement.lineage) {
    for (const balance of row.balances)
      members.set(balance.memberId, balance.displayNameSnapshot);
  }
  return {
    privateValues: privateRows
      .flatMap((row) => [row.userId, row.notes, row.evidenceAssetId])
      .filter((value): value is string => Boolean(value && value.length > 2)),
    linkableValues: [...members.entries()]
      .flatMap(([id, name]) => [id, name])
      .filter((value) => value.length > 2),
  };
}

function hash(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}
