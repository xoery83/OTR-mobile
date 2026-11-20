import {
  inChatHiddenSchema,
  type InChatContext,
} from "../api/mcpInChatConfirmationContracts";
// This bridge never puts component-only capability into model messages or widget state.
export function createMcpInChatBridge(
  onContext: (value: InChatContext) => void,
  onUnavailable: () => void,
) {
  let origin: string | undefined,
    closed = false,
    cancelled = false,
    next = 0;
  const requests = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: () => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  function post(value: unknown) {
    if (!closed)
      window.parent.postMessage(value, origin && origin !== "null" ? origin : "*");
  }
  function rpc(method: string, params: unknown): Promise<any> {
    if (closed) return Promise.reject(Error("IN_CHAT_CLOSED"));
    const id = ++next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        requests.delete(id);
        reject(Error("IN_CHAT_BRIDGE_TIMEOUT"));
      }, 10000);
      requests.set(id, {
        resolve,
        reject: () => reject(Error("IN_CHAT_BRIDGE_ERROR")),
        timer,
      });
      post({ jsonrpc: "2.0", id, method, params });
    });
  }
  function receiveContext(result: any) {
    const candidates = [
      result?._meta,
      result?.call_tool_result?._meta,
      result?.mcp_tool_result?._meta,
      result,
    ];
    for (const meta of candidates) {
      const parsed = inChatHiddenSchema.safeParse(meta?.["otr/confirmation"]);
      if (parsed.success) {
        onContext(parsed.data);
        return;
      }
    }
  }
  function message(event: MessageEvent) {
    if (
      closed ||
      event.source !== window.parent ||
      (origin !== undefined && event.origin !== origin)
    )
      return;
    const v = event.data;
    if (!v || v.jsonrpc !== "2.0") return;
    if (v.method === "ui/notifications/tool-result") {
      origin ??= event.origin;
      receiveContext(v.params);
      return;
    }
    if (
      ["ui/notifications/tool-cancelled", "ui/notifications/resource-teardown"].includes(
        v.method,
      )
    ) {
      cancelled = true;
      onUnavailable();
      return;
    }
    const pending = requests.get(v.id);
    if (!pending) return;
    origin ??= event.origin;
    clearTimeout(pending.timer);
    requests.delete(v.id);
    v.error ? pending.reject() : pending.resolve(v.result);
  }
  window.addEventListener("message", message);
  const compatibility = () => {
    const openai = (window as any).openai;
    if (typeof openai?.callTool !== "function") return false;
    receiveContext(openai.toolResponseMetadata);
    return true;
  };
  const globals = () => compatibility();
  window.addEventListener("openai:set_globals", globals);
  const ready = rpc("ui/initialize", {
    protocolVersion: "2026-01-26",
    appInfo: { name: "OTR in-chat confirmation", version: "0.1.0" },
    appCapabilities: {},
  })
    .then(() =>
      post({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }),
    )
    .catch(() => {
      if (!compatibility()) onUnavailable();
    });
  let trustedAt = 0;
  const gesture = (event: MouseEvent) => {
    if (event.isTrusted) trustedAt = performance.now();
  };
  document.addEventListener("click", gesture, true);
  return {
    ready,
    async decide(context: InChatContext, decision: "APPROVE" | "DECLINE") {
      if (closed || cancelled) throw Error("IN_CHAT_CLOSED");
      if (!trustedAt || performance.now() - trustedAt > 1000)
        throw Error("IN_CHAT_TRUSTED_CLICK_REQUIRED");
      trustedAt = 0;
      const args = {
        handle: context.handle,
        operationId: context.preview.operationId,
        previewDigest: context.previewDigest,
        decision,
      };
      const result =
        origin !== undefined
          ? await rpc("tools/call", {
              name: "otr_in_chat_confirmation_decide",
              arguments: args,
            })
          : await (window as any).openai.callTool(
              "otr_in_chat_confirmation_decide",
              args,
            );
      if (result?.isError || !result?.structuredContent)
        throw Error("IN_CHAT_DECISION_REJECTED");
      return result.structuredContent;
    },
    close() {
      closed = true;
      window.removeEventListener("message", message);
      window.removeEventListener("openai:set_globals", globals);
      document.removeEventListener("click", gesture, true);
      for (const p of requests.values()) {
        clearTimeout(p.timer);
        p.reject();
      }
      requests.clear();
    },
  };
}
