export class RequestBoundaryError extends Error {
  constructor(
    public readonly code:
      | "REQUEST_CANCELED"
      | "REQUEST_TIMEOUT"
      | "BODY_LIMIT"
      | "STREAM_UNAVAILABLE"
      | "INVALID_RESPONSE",
  ) {
    super(code);
  }
}

export function createRequestBoundary(
  timeoutMs: number,
  parent?: AbortSignal,
  check?: () => void,
) {
  const controller = new AbortController();
  const expires = Date.now() + timeoutMs;
  // Native AbortController implementations may discard reason or reject fetch with undefined.
  // The boundary, not the platform signal, owns the first terminal cause.
  let terminalReason: RequestBoundaryError | undefined;
  const stop = (code: "REQUEST_CANCELED" | "REQUEST_TIMEOUT") => {
    if (terminalReason) return;
    terminalReason = new RequestBoundaryError(code);
    controller.abort(terminalReason);
  };
  const cancel = () => stop("REQUEST_CANCELED");
  parent?.addEventListener("abort", cancel, { once: true });
  if (parent?.aborted) cancel();
  const timer = setTimeout(() => stop("REQUEST_TIMEOUT"), timeoutMs);
  function assertCurrent() {
    if (Date.now() >= expires && !terminalReason) stop("REQUEST_TIMEOUT");
    if (terminalReason) throw terminalReason;
    if (controller.signal.aborted) throw new RequestBoundaryError("REQUEST_CANCELED");
    check?.();
  }
  return {
    signal: controller.signal,
    assertCurrent,
    async run<T>(work: () => Promise<T>): Promise<T> {
      assertCurrent();
      let abort!: () => void;
      try {
        const stopped = new Promise<never>((_, reject) => {
          abort = () =>
            reject(terminalReason ?? new RequestBoundaryError("REQUEST_CANCELED"));
          controller.signal.addEventListener("abort", abort, { once: true });
        });
        const value = await Promise.race([work(), stopped]);
        assertCurrent();
        return value;
      } catch (error) {
        // A Native fetch rejection can win the race with an undefined platform reason.
        assertCurrent();
        throw error;
      } finally {
        controller.signal.removeEventListener("abort", abort);
      }
    },
    close() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", cancel);
    },
  };
}
export type RequestBoundary = ReturnType<typeof createRequestBoundary>;

export async function readBoundedBytes(
  response: Pick<Response, "body">,
  maximum: number,
  boundary: RequestBoundary,
): Promise<Uint8Array> {
  boundary.assertCurrent();
  const reader = response.body?.getReader?.();
  if (!reader) throw new RequestBoundaryError("STREAM_UNAVAILABLE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await boundary.run(() => reader.read());
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new RequestBoundaryError("BODY_LIMIT");
      chunks.push(value.slice());
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    boundary.assertCurrent();
    return bytes;
  } catch (error) {
    // Cancellation is best effort; an abort-ignoring stream cannot regain admission.
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* A canceled read may still be pending. */
    }
  }
}

export async function readBoundedJson(
  response: Response,
  maximum: number,
  boundary: RequestBoundary,
  parseText: (text: string) => unknown = JSON.parse,
): Promise<unknown> {
  const bytes = await readBoundedBytes(response, maximum, boundary);
  try {
    return parseText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestBoundaryError("INVALID_RESPONSE");
  }
}
