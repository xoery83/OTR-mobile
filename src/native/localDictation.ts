import { requireNativeModule } from "expo";
import { Platform } from "react-native";
import type { DictationNative } from "@/features/capture/localDictation";

const phases = new Set([
  "unknown",
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

// Treat the observed local recognizer initialization diagnostic as unavailable.
function isLocalRecognizerUnavailable(diagnostic: LocalDictationDiagnostic | null) {
  return (
    diagnostic?.phase === "recognition" &&
    diagnostic.domain === "kLSRErrorDomain" &&
    diagnostic.code === 300
  );
}

export function readLocalDictation(
  options: { onDiagnostic?(diagnostic: LocalDictationDiagnostic): void } = {},
): DictationNative {
  if (Platform.OS !== "ios")
    throw Object.assign(new Error("Local dictation unavailable"), {
      code: "unavailable",
    });
  const native = requireNativeModule<
    Omit<DictationNative, "start"> & {
      start(id: string, locale: string): Promise<unknown>;
    }
  >("OTRLocalDictation");
  const failures = new Set([
    "permission",
    "unavailable",
    "interrupted",
    "failed",
    "timeout",
  ]);
  const ownSessions = new Map<string, { diagnosed: boolean }>();
  const publish = (id: string, diagnostic: LocalDictationDiagnostic | null) => {
    const session = ownSessions.get(id);
    if (!session || session.diagnosed || !diagnostic) return;
    session.diagnosed = true;
    try {
      options.onDiagnostic?.(diagnostic);
    } catch {
      /* Diagnostics never interrupt dictation cleanup. */
    }
  };
  return {
    async start(id, locale) {
      const session = { diagnosed: false };
      ownSessions.set(id, session);
      let diagnostic: LocalDictationDiagnostic | null = null;
      try {
        const result = await native.start(id, locale);
        if (result != null) {
          const envelope =
            typeof result === "object" ? (result as Record<string, unknown>) : {};
          const known =
            typeof envelope.error === "string" && failures.has(envelope.error);
          diagnostic = known ? parseLocalDictationDiagnostic(envelope.diagnostic) : null;
          const failure =
            known && typeof envelope.error === "string" ? envelope.error : "failed";
          const code =
            failure === "failed" && isLocalRecognizerUnavailable(diagnostic)
              ? "unavailable"
              : failure;
          throw Object.assign(new Error(code), { code });
        }
      } catch (error) {
        if (ownSessions.get(id) === session) {
          publish(id, diagnostic ?? { phase: "unknown", domain: "OTHER" });
          ownSessions.delete(id);
        }
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
            if (state.status === "error") {
              publish(state.sessionId, diagnostic);
              if (state.error === "failed" && isLocalRecognizerUnavailable(diagnostic)) {
                ownSessions.delete(state.sessionId);
                listener({ ...state, error: "unavailable" });
                return;
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
