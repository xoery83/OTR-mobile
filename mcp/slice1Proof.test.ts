import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { contentDigest, sha } from "./mutation";
import { verifySlice1Proof } from "./slice1Proof";

// Synthetic proof events test the comparator; they are never consumer evidence.
function fixture() {
  const quotes = JSON.parse(
    readFileSync(
      new URL(
        "../docs/mcp/chatgpt-notes/WINDOW_8F4_CONSUMER_QUOTED_RESULTS.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  quotes.editBaseRequest = {
    trip_id: quotes.editBase.item.tripId,
    item_id: quotes.editBase.item.itemId,
  };
  const context = {
    windowId: "b".repeat(32),
    startsAt: "2026-11-02T07:00:00Z",
    normalCloseAt: "2026-11-02T07:20:00Z",
    baseRequestId: "11111111-1111-4111-8111-111111111111",
    previewRequestId: "22222222-2222-4222-8222-222222222222",
    logsSHA256: "",
  };
  const logs = {
    status: "CAPTURED",
    evidence: "BOUNDED_TAIL_NOT_COMMIT_PROOF",
    events: [
      {
        event: "MCP_QA_REQUEST",
        requestId: context.baseRequestId,
        status: 200,
        durationMs: 2,
        tool: "get_trip_item_edit_base",
        dockerTimestamp: "2026-11-02T07:01:00Z",
        responseProof: {
          version: "otr.mcp.response-proof/1",
          kind: "EDIT_BASE",
          inputSHA256: contentDigest(quotes.editBaseRequest),
          outputSHA256: contentDigest(quotes.editBase),
        },
      },
      {
        event: "MCP_QA_REQUEST",
        requestId: context.previewRequestId,
        status: 200,
        durationMs: 2,
        tool: "update_trip_item",
        dockerTimestamp: "2026-11-02T07:02:00Z",
        responseProof: {
          version: "otr.mcp.response-proof/1",
          kind: "PREVIEW",
          inputSHA256: contentDigest(quotes.previewRequest),
          outputSHA256: contentDigest(quotes.previewResult),
          previewDigest: quotes.previewResult.preview_digest,
        },
      },
    ],
  };
  return { quotes, context, logs };
}
const verify = (f: ReturnType<typeof fixture>) => {
  const text = JSON.stringify(f.logs);
  return verifySlice1Proof(text, f.quotes, { ...f.context, logsSHA256: sha(text) });
};
it("compares exact original277 handler hashes offline without claiming Apply authority", () => {
  const f = fixture();
  expect(verify(f)).toMatchObject({
    status: "MATCHED_HANDLER_OUTPUT_NOT_APPLY_AUTHORITY",
    revision: 2,
    businessSubmissions: 0,
  });
  f.quotes.editBaseRequest = {
    item_id: f.quotes.editBaseRequest.item_id,
    trip_id: f.quotes.editBaseRequest.trip_id,
  };
  expect(verify(f).status).toBe("MATCHED_HANDLER_OUTPUT_NOT_APPLY_AUTHORITY");
});
it.each([
  "missing request",
  "quote mismatch",
  "duplicate id",
  "no proof",
  "wrong kind",
  "error",
  "wrong tool",
  "outside window",
  "reversed sequence",
  "bad digest",
  "extra private proof",
  "apply mode",
  "wrong CAS",
  "wrong person",
  "denied canEdit",
  "changed Notes",
  "context same ids",
  "window too long",
  "source hash mismatch",
])("rejects %s without upgrading old quotations to proof", (failure) => {
  const f = fixture();
  switch (failure) {
    case "missing request":
      delete f.quotes.editBaseRequest;
      break;
    case "quote mismatch":
      f.quotes.editBase.item.title += " changed";
      break;
    case "duplicate id":
      f.logs.events.push(f.logs.events[0]);
      break;
    case "no proof":
      delete (f.logs.events[0] as { responseProof?: unknown }).responseProof;
      break;
    case "wrong kind":
      f.logs.events[0].responseProof.kind = "PREVIEW";
      break;
    case "error":
      Object.assign(f.logs.events[0], { errorCode: "AUTH_REQUIRED" });
      break;
    case "wrong tool":
      f.logs.events[0].tool = "get_trip_item";
      break;
    case "outside window":
      f.logs.events[0].dockerTimestamp = "2026-11-02T06:59:59Z";
      break;
    case "reversed sequence":
      f.logs.events[0].dockerTimestamp = "2026-11-02T07:03:00Z";
      break;
    case "bad digest":
      f.logs.events[1].responseProof.previewDigest = "c".repeat(64);
      break;
    case "extra private proof":
      Object.assign(f.logs.events[0].responseProof, { notes: "private" });
      break;
    case "apply mode":
      f.quotes.previewRequest.mode = "APPLY";
      break;
    case "wrong CAS":
      f.quotes.previewRequest.expected_revision = 3;
      break;
    case "wrong person":
      f.quotes.editBase.record.body.owner_account_id = f.context.baseRequestId;
      break;
    case "denied canEdit":
      f.quotes.editBase.item.capabilities.canEdit = false;
      break;
    case "changed Notes":
      f.quotes.previewRequest.change.notes += "extra";
      break;
    case "context same ids":
      f.context.previewRequestId = f.context.baseRequestId;
      break;
    case "window too long":
      f.context.normalCloseAt = "2026-11-02T07:31:00Z";
      break;
    case "source hash mismatch":
      expect(() =>
        verifySlice1Proof(JSON.stringify(f.logs), f.quotes, {
          ...f.context,
          logsSHA256: "a".repeat(64),
        }),
      ).toThrow();
      return;
  }
  expect(() => verify(f)).toThrow();
});
it("does not silently normalize an omitted mode when comparing original input hashes", () => {
  const f = fixture();
  delete f.quotes.previewRequest.mode;
  expect(() => verify(f)).toThrow();
  f.logs.events[1].responseProof.inputSHA256 = contentDigest(f.quotes.previewRequest);
  expect(verify(f).status).toBe("MATCHED_HANDLER_OUTPUT_NOT_APPLY_AUTHORITY");
});
