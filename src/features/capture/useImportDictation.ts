import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalDictationDiagnostic } from "@/native/localDictation";
import { createLocalDictation, type DictationState } from "./localDictation";

export function useImportDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>({ status: "idle" });
  const [diagnostic, setDiagnostic] = useState<LocalDictationDiagnostic | null>(null);
  const currentText = useRef(onText);
  useEffect(() => {
    currentText.current = onText;
  }, [onText]);
  const controller = useRef<ReturnType<typeof createLocalDictation> | null>(null);
  useEffect(() => {
    let active = true;
    const owner = createLocalDictation({
      load: async () =>
        (await import("@/native/localDictation")).readLocalDictation({
          onDiagnostic: (value) => {
            if (
              active &&
              ((typeof __DEV__ !== "undefined" && __DEV__) ||
                process.env.EXPO_PUBLIC_OTR_DICTATION_DIAGNOSTICS === "1")
            )
              setDiagnostic(value);
          },
        }),
      onText: (text) => currentText.current(text),
      onState: setState,
    });
    controller.current = owner;
    return () => {
      active = false;
      controller.current = null;
      owner.dispose();
    };
  }, []);
  return {
    state,
    diagnostic,
    busy:
      state.status === "starting" ||
      state.status === "listening" ||
      state.status === "finishing",
    start: (text: string, locale: string) => {
      setDiagnostic(null);
      void controller.current?.start(text, locale);
    },
    stop: () => {
      void controller.current?.stop();
    },
    cancel: () => controller.current?.cancel(),
    close: useCallback(() => controller.current?.end(), []),
  };
}
