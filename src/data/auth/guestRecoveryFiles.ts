import { coreUuid } from "@/domain/trip/tripCoreV2";
import { createUuid } from "@/domain/localId";
import type {
  GuestRecoveryCheckpoint,
  GuestRecoveryFiles,
} from "./guestAdoptionRecovery";

const checkpoints = new Set<GuestRecoveryCheckpoint>([
  "prepared",
  "publish-requested",
  "cancelled",
  "cancellation-receipt",
]);

export function createGuestRecoveryFiles(
  sourceGuestLocalId: string,
  filesystem?: Pick<typeof import("expo-file-system"), "Directory" | "File" | "Paths">,
): GuestRecoveryFiles {
  coreUuid.parse(sourceGuestLocalId);
  // No filesystem module or directory creation until the Guest boundary is opened.
  const native =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    filesystem ?? (require("expo-file-system") as typeof import("expo-file-system"));
  const { Directory, File, Paths } = native;
  const root = new Directory(Paths.document, "auth-guest-adoption", sourceGuestLocalId);
  function validateDirectory(directory: InstanceType<typeof Directory>) {
    if (!directory.exists) return;
    if (
      directory
        .list()
        .some(
          (entry) =>
            !(entry instanceof File) ||
            !(
              [...checkpoints].some((name) => entry.name === `${name}.json`) ||
              (entry.name.startsWith(".pending-") &&
                coreUuid.safeParse(entry.name.slice(9)).success)
            ),
        )
    )
      throw Error("GUEST_ADOPTION_CHECKPOINT_DIRECTORY_INVALID");
  }
  function location(adoptionId: string, checkpoint: GuestRecoveryCheckpoint) {
    coreUuid.parse(adoptionId);
    if (!checkpoints.has(checkpoint)) throw Error("GUEST_ADOPTION_CHECKPOINT_NAME");
    const directory = new Directory(root, adoptionId);
    return { directory, file: new File(directory, `${checkpoint}.json`) };
  }
  return {
    async listAttempts() {
      if (!root.exists) return [];
      const entries = root.list();
      if (
        entries.some(
          (entry) =>
            !(entry instanceof Directory) || !coreUuid.safeParse(entry.name).success,
        )
      )
        throw Error("GUEST_ADOPTION_RECOVERY_DIRECTORY_INVALID");
      for (const entry of entries)
        validateDirectory(entry as InstanceType<typeof Directory>);
      return entries.map((entry) => entry.name).sort();
    },
    async read(adoptionId, checkpoint) {
      const { file, directory } = location(adoptionId, checkpoint);
      validateDirectory(directory);
      return file.exists ? file.text() : null;
    },
    async create(adoptionId, checkpoint, text) {
      const { directory, file } = location(adoptionId, checkpoint);
      directory.create({ intermediates: true, idempotent: true });
      const temporary = new File(directory, `.pending-${createUuid()}`);
      temporary.create({ overwrite: false });
      temporary.write(text);
      if ((await temporary.text()) !== text)
        throw Error("GUEST_ADOPTION_CHECKPOINT_WRITE_FAILED");
      // Native overwrite=true removes the old file first; immutable move avoids that gap.
      await temporary.move(file, { overwrite: false });
    },
  };
}
