import { useLayoutEffect, type ReactNode } from "react";
import { Modal } from "react-native";

// The type chooser expands its existing native sheet; existing direct editor callers keep theirs.
export function ManualEditorPresentation({
  embedded,
  registerDismissHandler,
  onClose,
  children,
}: {
  embedded: boolean;
  registerDismissHandler?: (handler: () => void) => () => void;
  onClose(): void;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    if (embedded) return registerDismissHandler?.(onClose);
  }, [embedded, registerDismissHandler, onClose]);
  return embedded ? (
    children
  ) : (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {children}
    </Modal>
  );
}
