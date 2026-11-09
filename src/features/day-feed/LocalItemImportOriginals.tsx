import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { localItemImportOriginals } from "@/data/operations/localItemImportOriginals";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

type Reader = Awaited<ReturnType<typeof localItemImportOriginals>>;
type Document = Awaited<ReturnType<Reader["list"]>>[number];

export function LocalItemImportOriginals(props: {
  tripId: string;
  itemId: string;
  generation: number;
  revision?: number;
}) {
  const { tripId, itemId, generation, revision } = props;
  return (
    <ItemOriginals
      key={`${tripId}:${itemId}:${generation}:${revision ?? ""}`}
      {...props}
    />
  );
}

function ItemOriginals({
  tripId,
  itemId,
  generation,
}: Parameters<typeof LocalItemImportOriginals>[0]) {
  useUiLocale();
  const current = useRef<symbol | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [reader, setReader] = useState<Reader | null>(null);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const token = Symbol();
      current.current = token;
      const active = () =>
        current.current === token && generation === getAccountGeneration();
      void (async () => {
        try {
          const [{ localItemImportOriginals }, { isImportOriginalPreviewAvailable }] =
            await Promise.all([
              import("@/data/operations/localItemImportOriginals"),
              import("@/native/importOriginalPreview"),
            ]);
          if (!active()) return;
          const scoped = await localItemImportOriginals(tripId, itemId, generation);
          const available = await scoped.list();
          if (!active()) return;
          setReader(scoped);
          const preview = isImportOriginalPreviewAvailable();
          setDocuments(
            available.filter(({ mediaType }) => mediaType === "text/plain" || preview),
          );
        } catch {
          if (active()) setDocuments([]);
        }
      })();
      return () => {
        current.current = null;
        setReader(null);
        setDocuments([]);
        setOriginalText(null);
        setOpening(false);
        setFailed(false);
      };
    }, [tripId, itemId, generation]),
  );

  async function open(document: Document) {
    const token = current.current;
    const active = () =>
      token !== null &&
      current.current === token &&
      generation === getAccountGeneration();
    if (!active() || !reader || opening) return;
    setOpening(true);
    setFailed(false);
    setOriginalText(null);
    try {
      const original = await reader.original(document.id);
      if (!active()) return;
      if (!original) throw Error("IMPORT_ORIGINAL_UNAVAILABLE");
      if (original.document.mediaType === "text/plain") {
        const bytes = original.bytes;
        const encoding =
          bytes[0] === 0xff && bytes[1] === 0xfe
            ? "utf-16le"
            : bytes[0] === 0xfe && bytes[1] === 0xff
              ? "utf-16be"
              : "utf-8";
        setOriginalText(new TextDecoder(encoding, { fatal: true }).decode(bytes));
      } else {
        const { previewImportOriginal } = await import("@/native/importOriginalPreview");
        await previewImportOriginal(original, active);
      }
    } catch {
      if (active()) {
        setDocuments((entries) => entries.filter(({ id }) => id !== document.id));
        setFailed(true);
      }
    } finally {
      if (active()) setOpening(false);
    }
  }

  if (generation !== getAccountGeneration() || (!documents.length && !failed))
    return null;
  return (
    <UiSection title={t("fidelity.attachmentsTitle")}>
      {documents.map((document) => (
        <UiButton
          key={document.id}
          label={document.title}
          variant="text"
          disabled={opening}
          onPress={() => void open(document)}
        />
      ))}
      {originalText !== null ? (
        <>
          <UiText>{originalText}</UiText>
          <UiButton
            variant="text"
            label={t("common.close")}
            onPress={() => setOriginalText(null)}
          />
        </>
      ) : null}
      {failed ? (
        <UiText accessibilityRole="alert">
          {t("importDocuments.originalUnavailable")}
        </UiText>
      ) : null}
    </UiSection>
  );
}
