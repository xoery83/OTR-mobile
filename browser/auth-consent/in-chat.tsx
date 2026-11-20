import { createRoot } from "react-dom/client";
import { McpInChatConfirmation } from "../../src/features/auth/McpInChatConfirmation";
import { resolveUiLocale, setUiLocale } from "../../src/ui/locale";
setUiLocale(resolveUiLocale(navigator.language));
createRoot(document.getElementById("root")!).render(<McpInChatConfirmation />);
