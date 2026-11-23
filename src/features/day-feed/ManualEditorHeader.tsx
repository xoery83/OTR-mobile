import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { SheetHeader } from "@/components/SheetHeader";

export type ManualEditorHeaderProps = ComponentProps<typeof SheetHeader>;
export const HostedManualEditorContext = createContext<((props: ManualEditorHeaderProps) => ReactNode) | null>(null);

export function ManualEditorHeader(props: ManualEditorHeaderProps) {
  const renderHosted = useContext(HostedManualEditorContext);
  return renderHosted ? renderHosted(props) : <SheetHeader {...props} />;
}
