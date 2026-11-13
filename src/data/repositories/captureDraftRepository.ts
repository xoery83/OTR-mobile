import { File, Directory, Paths } from "expo-file-system";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { z } from "zod";
import { randomUUID } from "expo-crypto";
import {
  importOriginalUri,
  readImportOriginal,
  retainImportOriginal,
} from "@/data/files/importOriginalFileStore";
import type {
  CaptureDraftOwner,
  CaptureDraftSnapshot,
  CaptureDraftItem,
  CaptureSelection,
} from "@/features/capture/captureStaging";

const ownerSchema = z.object({ accountId: z.uuid(), tripPrior: z.uuid().nullable() });
const originalSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteCount: z
    .number()
    .int()
    .min(1)
    .max(12 * 1024 * 1024),
});
const itemSchema = z.object({
  stagingId: z.number().int().positive(),
  source: z.enum(["files", "photos", "camera", "magic_input", "clipboard"]),
  text: z
    .string()
    .max(1024 * 1024)
    .optional(),
  name: z.string().max(1024).nullable().optional(),
  typeHint: z.string().max(128).nullable().optional(),
  original: originalSchema.optional(),
});
const draftSchema = z.object({
  version: z.literal(1),
  owner: ownerSchema,
  editorText: z.string().max(1024 * 1024),
  tripTarget: z
    .object({ id: z.uuid(), name: z.string().max(1024) })
    .nullable()
    .optional(),
  items: z.array(itemSchema).max(100),
});

function record(owner: CaptureDraftOwner) {
  ownerSchema.parse(owner);
  const directory = new Directory(Paths.document, "import-drafts", owner.accountId);
  return {
    directory,
    file: new File(directory, `${owner.tripPrior ?? "unassigned"}.json`),
    previous: new File(directory, `${owner.tripPrior ?? "unassigned"}.previous`),
  };
}

// Use the existing bounded original store, not a second file-custody system.
export async function retainCaptureDraftSelection(
  accountId: string,
  selection: CaptureSelection,
): Promise<CaptureSelection> {
  if (!selection.temporaryUri?.startsWith("file://")) return selection;
  const file = new File(selection.temporaryUri);
  if (!file.exists || file.size < 1 || file.size > 12 * 1024 * 1024)
    throw Error("CAPTURE_DRAFT_FILE_UNAVAILABLE");
  const bytes = await file.bytes();
  const digest = bytesToHex(sha256(bytes));
  await retainImportOriginal(accountId, digest, bytes);
  return {
    ...selection,
    temporaryUri: importOriginalUri(accountId, digest),
    size: bytes.length,
    draftOriginal: { sha256: digest, byteCount: bytes.length },
  };
}

export function saveCaptureDraft(
  owner: CaptureDraftOwner,
  snapshot: CaptureDraftSnapshot,
) {
  const { directory, file, previous } = record(owner);
  const value = draftSchema.parse({
    version: 1,
    owner,
    editorText: snapshot.editorText,
    tripTarget: snapshot.tripTarget,
    items: snapshot.items.map((item) =>
      item.source === "magic_input"
        ? { stagingId: item.stagingId, source: item.source, text: item.text }
        : {
            stagingId: item.stagingId,
            source: item.source,
            name: item.name,
            typeHint: item.typeHint,
            original: item.source !== "clipboard" ? item.draftOriginal : undefined,
          },
    ),
  });
  directory.create({ idempotent: true, intermediates: true });
  const pending = new File(directory, `.pending-${randomUUID()}`);
  try {
    pending.create({ overwrite: false });
    pending.write(JSON.stringify(value));
    if (!snapshot.items.length && !snapshot.editorText) {
      // Clear All must not resurrect the prior draft through the fallback.
      pending.copySync(previous, { overwrite: true });
    } else if (file.exists) {
      // Expo overwrite removes its destination first. Keep the last valid roster.
      let prior;
      try {
        prior = draftSchema.parse(JSON.parse(file.textSync()));
      } catch {
        /* Retain the existing fallback. */
      }
      if (
        prior?.owner.accountId === owner.accountId &&
        prior.owner.tripPrior === owner.tripPrior
      )
        file.copySync(previous, { overwrite: true });
    }
    pending.moveSync(file, { overwrite: true });
  } finally {
    if (pending.exists && pending.uri !== file.uri) pending.delete();
  }
}

export async function readCaptureDraft(
  owner: CaptureDraftOwner,
): Promise<CaptureDraftSnapshot | null> {
  const { file, previous } = record(owner);
  let value: z.infer<typeof draftSchema> | undefined;
  let failure: unknown;
  for (const candidate of [file, previous]) {
    if (!candidate.exists) continue;
    try {
      if (candidate.size > 48 * 1024 * 1024) throw Error("CAPTURE_DRAFT_INVALID");
      const parsed = draftSchema.parse(JSON.parse(await candidate.text()));
      if (
        parsed.owner.accountId !== owner.accountId ||
        parsed.owner.tripPrior !== owner.tripPrior
      )
        throw Error("CAPTURE_DRAFT_OWNER_MISMATCH");
      value = parsed;
      break;
    } catch (error) {
      failure = error;
    }
  }
  if (!value) {
    if (failure) throw failure;
    return null;
  }
  if (new Set(value.items.map((item) => item.stagingId)).size !== value.items.length)
    throw Error("CAPTURE_DRAFT_INVALID");
  const items: CaptureDraftItem[] = [];
  for (const item of value.items) {
    if (item.source === "magic_input") {
      if (item.text === undefined) throw Error("CAPTURE_DRAFT_INVALID");
      items.push({ source: item.source, stagingId: item.stagingId, text: item.text });
    } else if (item.source === "clipboard") {
      // Native paste tokens are session-only. Keep a visible placeholder, never a stale capability.
      items.push({
        source: "clipboard",
        stagingId: item.stagingId,
        token: "",
        temporaryUri: "",
        name: null,
        typeHint: item.typeHint ?? "",
        size: 0,
        availability: "unavailable",
      });
    } else {
      let available = false;
      if (item.original) {
        try {
          available = !!(await readImportOriginal(
            owner.accountId,
            item.original.sha256,
            item.original.byteCount,
          ));
        } catch {
          /* Keep missing/corrupt originals visible for reselection. */
        }
      }
      items.push({
        source: item.source,
        stagingId: item.stagingId,
        name: item.name ?? null,
        typeHint: item.typeHint ?? null,
        temporaryUri: available
          ? importOriginalUri(owner.accountId, item.original!.sha256)
          : null,
        draftOriginal: item.original,
        size: item.original?.byteCount,
        availability: available ? "unverified" : "unavailable",
      });
    }
  }
  return {
    editorText: value.editorText,
    tripTarget: value.tripTarget,
    items,
    selecting: false,
    error: null,
  };
}

export async function readCaptureDraftPreview(accountId: string, item: CaptureDraftItem) {
  if (item.source === "magic_input") return { text: item.text };
  if (!item.temporaryUri?.startsWith("file://") || item.availability === "unavailable")
    throw Error("CAPTURE_DRAFT_FILE_UNAVAILABLE");
  const file = new File(item.temporaryUri);
  if (!file.exists || file.size < 1 || file.size > 12 * 1024 * 1024)
    throw Error("CAPTURE_DRAFT_FILE_UNAVAILABLE");
  const bytes =
    item.source !== "clipboard" && item.draftOriginal
      ? await readImportOriginal(
          accountId,
          item.draftOriginal.sha256,
          item.draftOriginal.byteCount,
        )
      : await file.bytes();
  if (!bytes) throw Error("CAPTURE_DRAFT_FILE_UNAVAILABLE");
  if (item.typeHint === "text/plain")
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  return {
    bytes,
    document: {
      sha256: bytesToHex(sha256(bytes)),
      byteCount: bytes.length,
      originalFilename: item.name,
    },
  };
}
