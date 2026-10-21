import { useCallback, useEffect, useRef, useState } from "react";
import { createLocalDictation, type DictationState } from "./localDictation";

export function useImportDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>({ status: "idle" });
  const currentText = useRef(onText);
  useEffect(() => {
    currentText.current = onText;
  }, [onText]);
  const controller = useRef<ReturnType<typeof createLocalDictation> | null>(null);
  useEffect(() => {
    const owner = createLocalDictation({
      load: async () => (await import("@/native/localDictation")).readLocalDictation(),
      onText: (text) => currentText.current(text),
      onState: setState,
    });
    controller.current = owner;
    return () => {
      controller.current = null;
      owner.dispose();
    };
  }, []);
  return {
    state,
    busy:
      state.status === "starting" ||
      state.status === "listening" ||
      state.status === "finishing",
    start: (text: string, locale: string) => {
      void controller.current?.start(text, locale);
    },
    stop: () => {
      void controller.current?.stop();
    },
    cancel: () => controller.current?.cancel(),
    close: useCallback(() => controller.current?.end(), []),
  };
}
