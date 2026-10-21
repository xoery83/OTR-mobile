import React, { type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { ImagePasteInput } from "./imagePaste";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReactNode): string;
};
const bridge = vi.hoisted(() => ({
  available: true,
  supportsInputPaste: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  releaseUnclaimed: vi.fn(),
}));
vi.mock("expo", () => ({
  requireOptionalNativeModule: () => (bridge.available ? bridge : null),
  requireNativeView:
    () =>
    ({ children }: { children?: React.ReactNode }) =>
      React.createElement("native-paste-input", null, children),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
beforeEach(() => {
  vi.clearAllMocks();
  bridge.available = true;
  bridge.supportsInputPaste.mockReturnValue(true);
});
function render() {
  return renderToStaticMarkup(
    React.createElement(
      ImagePasteInput,
      { requestId: "request-1", enabled: true, onImages: () => {}, onFailure: () => {} },
      React.createElement("input", {
        "aria-label": "plans",
        defaultValue: "Existing draft",
      }),
    ),
  );
}
it("keeps the existing editable input inside the native paste host with no separate control", () => {
  const html = render();
  expect(html).toContain("<native-paste-input>");
  expect(html).toContain('value="Existing draft"');
  expect(html).not.toContain("<button");
});
it.each(["absent", "old-host"])("retains ordinary text entry on %s", (version) => {
  bridge.available = version !== "absent";
  bridge.supportsInputPaste.mockReturnValue(false);
  const html = render();
  expect(html).toContain('value="Existing draft"');
  expect(html).not.toContain("native-paste-input");
});
