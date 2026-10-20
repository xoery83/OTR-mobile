import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type {
  SettlementExportFormat,
  SettlementExportManifest,
} from "@/data/repositories/ledgerExportRepository";
import type { SettlementExportPrivacy } from "@/domain/ledger/settlementExport";
import { resolveSettlementExportUri } from "./settlementExportPath";

type ExportIdentity = Pick<
  SettlementExportManifest,
  "rootSettlementId" | "headSettlementId" | "statementDigest"
> & { privacyMode: SettlementExportPrivacy };

export function createSettlementExportFileStore() {
  return {
    async writeCsv(identity: ExportIdentity, csv: string) {
      const uri = await destination(identity, "CSV");
      if (!(await FileSystem.getInfoAsync(uri)).exists) {
        if (!FileSystem.cacheDirectory)
          throw new Error("Temporary export storage is unavailable.");
        const temporary = `${FileSystem.cacheDirectory}${Crypto.randomUUID()}.csv`;
        await FileSystem.writeAsStringAsync(temporary, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await FileSystem.moveAsync({ from: temporary, to: uri });
      }
      return { uri, sha256: await fileSha256(uri) };
    },

    async writePdf(identity: ExportIdentity, html: string) {
      const uri = await destination(identity, "PDF");
      if (!(await FileSystem.getInfoAsync(uri)).exists) {
        const temporary = await Print.printToFileAsync({ html });
        await FileSystem.moveAsync({ from: temporary.uri, to: uri });
      }
      return { uri, sha256: await fileSha256(uri) };
    },

    async exists(uri: string) {
      return (await FileSystem.getInfoAsync(currentUri(uri))).exists;
    },

    async verify(uri: string, sha256: string) {
      const current = currentUri(uri);
      return (
        (await FileSystem.getInfoAsync(current)).exists &&
        (await fileSha256(current)) === sha256
      );
    },

    async share(uri: string, format: SettlementExportFormat) {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("System sharing is unavailable on this device.");
      await Sharing.shareAsync(currentUri(uri), {
        mimeType: format === "PDF" ? "application/pdf" : "text/csv",
        UTI: format === "PDF" ? "com.adobe.pdf" : "public.comma-separated-values-text",
      });
    },
  };
}

function currentUri(storedUri: string) {
  if (!FileSystem.documentDirectory)
    throw new Error("Durable app document storage is unavailable.");
  return resolveSettlementExportUri(storedUri, FileSystem.documentDirectory);
}

async function destination(identity: ExportIdentity, format: SettlementExportFormat) {
  if (!FileSystem.documentDirectory)
    throw new Error("Durable app document storage is unavailable.");
  const root = safe(identity.rootSettlementId);
  const head = safe(identity.headSettlementId);
  const digest = safe(identity.statementDigest);
  const privacy = identity.privacyMode.toLowerCase();
  const directory = `${FileSystem.documentDirectory}settlement-exports/${root}/${head}/${digest}/${privacy}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  return `${directory}statement.${format.toLowerCase()}`;
}

function safe(value: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(value))
    throw new Error("Export identity contains an unsafe path component.");
  return value;
}

async function fileSha256(uri: string) {
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    await new File(uri).bytes(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
