import { test } from "node:test";
import assert from "node:assert/strict";
import { runBridge, selectTarget, safeReceipt } from "./capture-c2-once.mjs";
const target = {
  deviceName: "OTR CP02 Native Host Recovery",
  appId: "com.xoery.otrmobile",
  webSocketDebuggerUrl:
    "ws://[::1]:8081/inspector/debug?device=synthetic&page=1",
};
test("only unique exact device/app and local Inspector accepted", () => {
  assert.equal(selectTarget([target]), target.webSocketDebuggerUrl);
  for (const targets of [
    [],
    [target, target],
    [{ ...target, deviceName: "Experience" }],
    [{ ...target, appId: "other" }],
    [
      {
        ...target,
        webSocketDebuggerUrl: "ws://example.test:8081/inspector/debug",
      },
    ],
  ])
    assert.throws(() => selectTarget(targets));
});
test("missing hook refuses before any invocation", async () => {
  const sent = [];
  class Socket {
    constructor() {
      this.handlers = {};
      queueMicrotask(() => this.handlers.open());
    }
    addEventListener(name, fn) {
      this.handlers[name] = fn;
    }
    send(raw) {
      const msg = JSON.parse(raw);
      sent.push(msg);
      queueMicrotask(() =>
        this.handlers.message({
          data: JSON.stringify({ id: 1, result: { result: { value: false } } }),
        }),
      );
    }
    close() {}
  }
  await assert.rejects(
    runBridge({
      execute: true,
      fetchImpl: async () => ({
        ok: true,
        text: async () => JSON.stringify([target]),
      }),
      WebSocketImpl: Socket,
    }),
  );
  assert.equal(sent.length, 1);
  assert.equal(
    sent[0].params.expression,
    'typeof globalThis.__OTR_C2_ONCE__ === "function"',
  );
});
test("unknown receipt refuses rather than printing untrusted values", () => {
  assert.throws(() => safeReceipt({ token: "synthetic" }));
});

test("IPv6 qualification does not accept IPv4 or another loopback endpoint", () => {
  for (const url of [
    "ws://127.0.0.1:8081/inspector/debug",
    "ws://[::1]:8082/inspector/debug",
    "ws://[::1]:8081/other",
    "ws://[::2]:8081/inspector/debug",
  ])
    assert.throws(() =>
      selectTarget([{ ...target, webSocketDebuggerUrl: url }]),
    );
});
test("discovery is fixed IPv6 and has no fallback on failure", async () => {
  const seen = [];
  await assert.rejects(
    runBridge({
      fetchImpl: async (url, options) => {
        seen.push(url);
        assert.equal(options.redirect, "error");
        return { ok: false };
      },
      WebSocketImpl: class {
        constructor() {
          assert.fail("must not connect");
        }
      },
    }),
  );
  assert.deepEqual(seen, ["http://[::1]:8081/json/list"]);
});
