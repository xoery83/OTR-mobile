// Temporary, bounded C2 gate tool. No arbitrary target, URL, expression or payload input.
import { pathToFileURL } from "node:url";
const DEVICE = "OTR CP02 Native Host Recovery";
const APP = "com.xoery.otrmobile";
const HOOK = "__OTR_C2_ONCE__";
const EXPECTED = {
  batchId: "e046f37a-61ac-444a-b05b-0a991d59e006",
  jobId: "d9fc69ea-9fe1-4c62-8c65-359ac737a9d7",
  inputs: [
    {
      inputId: "88bb7049-5cac-4b4a-a6e0-9f9ceee131d7",
      sha256:
        "dd8c0250c01682d5960e05ef8b4316692151fb20b461b1f4ee1c8fb2caaf12b3",
      byteCount: 2943032,
    },
    {
      inputId: "06bf88b6-633d-463e-af0a-21fa6efb3773",
      sha256:
        "f239e149de28012443fe45382aa7c0ea0f236ee51feec8e9d9ff77783030baa1",
      byteCount: 226541,
    },
  ],
};
const fail = () => {
  throw new Error("C2_TARGET_OR_RESULT_UNQUALIFIED");
};
export function selectTarget(targets) {
  if (!Array.isArray(targets)) return fail();
  const matches = targets.filter(
    (t) => t?.deviceName === DEVICE && t?.appId === APP,
  );
  if (matches.length !== 1) return fail();
  const url = new URL(matches[0].webSocketDebuggerUrl);
  if (
    url.protocol !== "ws:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "8081" ||
    url.pathname !== "/inspector/debug" ||
    url.username ||
    url.password ||
    url.hash
  )
    return fail();
  return url.href;
}
export function safeReceipt(value) {
  if (
    !value ||
    value.batchId !== EXPECTED.batchId ||
    value.jobId !== EXPECTED.jobId ||
    !Array.isArray(value.inputs) ||
    value.inputs.length !== 2
  )
    return fail();
  const inputs = EXPECTED.inputs.map((expected) => {
    const actual = value.inputs.find(
      (input) => input?.inputId === expected.inputId,
    );
    if (
      !actual ||
      actual.sha256 !== expected.sha256 ||
      actual.byteCount !== expected.byteCount
    )
      return fail();
    return { ...expected };
  });
  return { batchId: EXPECTED.batchId, jobId: EXPECTED.jobId, inputs };
}
export async function runBridge({
  execute = false,
  fetchImpl = fetch,
  WebSocketImpl = WebSocket,
} = {}) {
  const response = await fetchImpl("http://127.0.0.1:8081/json/list", {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return fail();
  const raw = await response.text();
  if (raw.length > 65536) return fail();
  const url = selectTarget(JSON.parse(raw));
  const socket = new WebSocketImpl(url);
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      let phase = 1;
      const stop = () => reject(new Error("C2_TARGET_OR_RESULT_UNQUALIFIED"));
      timer = setTimeout(stop, 15000);
      socket.addEventListener("error", stop);
      socket.addEventListener("close", stop);
      socket.addEventListener("open", () =>
        socket.send(
          JSON.stringify({
            id: 1,
            method: "Runtime.evaluate",
            params: {
              expression: `typeof globalThis.${HOOK} === "function"`,
              returnByValue: true,
            },
          }),
        ),
      );
      socket.addEventListener("message", (event) => {
        try {
          if (typeof event.data !== "string" || event.data.length > 8192)
            return stop();
          const result = JSON.parse(event.data);
          if (result.id !== 1 && result.id !== 2) return;
          if (result.id !== phase) return stop();
          if (result.error || result.result?.exceptionDetails) return stop();
          if (result.id === 1) {
            if (result.result?.result?.value !== true) return stop();
            if (!execute)
              return resolve({
                status: "TARGET_AND_HOOK_PRESENT_NOT_EXECUTED",
              });
            phase = 2;
            socket.send(
              JSON.stringify({
                id: 2,
                method: "Runtime.evaluate",
                params: {
                  expression: `globalThis.${HOOK}()`,
                  awaitPromise: true,
                  returnByValue: true,
                },
              }),
            );
          } else resolve(safeReceipt(result.result?.result?.value));
        } catch {
          stop();
        }
      });
    });
  } finally {
    clearTimeout(timer);
    socket.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (
      process.argv.length > 3 ||
      (process.argv[2] && process.argv[2] !== "--execute")
    )
      fail();
    console.log(
      JSON.stringify(
        await runBridge({ execute: process.argv[2] === "--execute" }),
      ),
    );
  } catch {
    console.error("C2_TARGET_OR_RESULT_UNQUALIFIED");
    process.exitCode = 1;
  }
}
