import { requireNativeModule } from "expo";
import { Platform } from "react-native";
import type { DictationNative } from "@/features/capture/localDictation";

const phases = new Set([
  "capability",
  "speech_permission",
  "microphone_permission",
  "application",
  "audio_category",
  "audio_activation",
  "audio_format",
  "audio_engine",
  "recognition",
  "transcript_limit",
  "lifecycle",
  "deadline",
  "finish_deadline",
]);
const domains = new Set([
  "NONE",
  "OTHER",
  "kAFAssistantErrorDomain",
  "kLSRErrorDomain",
  "SFSpeechErrorDomain",
  "AVFoundationErrorDomain",
  "AVAudioSessionErrorDomain",
  "NSOSStatusErrorDomain",
  "NSCocoaErrorDomain",
]);
export type LocalDictationDiagnostic = {
  phase: string;
  domain: string;
  code?: number;
  sampleRateValid?: boolean;
  channelCountValid?: boolean;
};
export function parseLocalDictationDiagnostic(
  value: unknown,
): LocalDictationDiagnostic | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  if (
    typeof d.phase !== "string" ||
    !phases.has(d.phase) ||
    typeof d.domain !== "string" ||
    !domains.has(d.domain)
  )
    return null;
  return {
    phase: d.phase,
    domain: d.domain,
    ...(typeof d.code === "number" &&
    Number.isInteger(d.code) &&
    d.code >= -2147483648 &&
    d.code <= 2147483647
      ? { code: d.code }
      : {}),
    ...(typeof d.sampleRateValid === "boolean"
      ? { sampleRateValid: d.sampleRateValid }
      : {}),
    ...(typeof d.channelCountValid === "boolean"
      ? { channelCountValid: d.channelCountValid }
      : {}),
  };
}

export function readLocalDictation(
  options: { onDiagnostic?(diagnostic: LocalDictationDiagnostic): void } = {},
): DictationNative {
  if (Platform.OS !== "ios")
    throw Object.assign(new Error("Local dictation unavailable"), {
      code: "unavailable",
    });
  const native = requireNativeModule<DictationNative>("OTRLocalDictation");
  const ownSessions = new Set<string>();
  return {
    async start(id, locale) {
      ownSessions.add(id);
      try {
        await native.start(id, locale);
      } catch (error) {
        ownSessions.delete(id);
        throw error;
      }
    },
    stop: (id) => native.stop(id),
    async cancel(id) {
      ownSessions.delete(id);
      await native.cancel(id);
    },
    addListener(event, listener) {
      return native.addListener(event, (value) => {
        if (event === "state" && value && typeof value === "object") {
          const state = value as Record<string, unknown>;
          if (typeof state.sessionId === "string" && ownSessions.has(state.sessionId)) {
            const diagnostic = parseLocalDictationDiagnostic(state.diagnostic);
            if (state.status === "error" && diagnostic) {
              try {
                options.onDiagnostic?.(diagnostic);
              } catch {
                /* Diagnostics never interrupt dictation cleanup. */
              }
            }
            if (state.status === "error" || state.status === "stopped")
              ownSessions.delete(state.sessionId);
          }
        }
        listener(value);
      });
    },
  };
}
