// Offline proof over the original text returned by a disposable protected SQL root.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEventJson } from "../../src/domain/trip/eventIntentJson";
import { publicationCatalogBody } from "../../backend/src/tripPublicationCatalogRead";
const raw = readFileSync(process.argv[2], "utf8");
const parsed = parseEventJson(raw, 4194304) as Record<string, any>;
const body = publicationCatalogBody(parsed, parsed.actor_account_id, parsed.trip_id);
assert.equal(Object.values(parsed).filter(Array.isArray).length, 13);
assert.equal(
  Object.values(parsed)
    .filter(Array.isArray)
    .every((r) => r.length > 0),
  true,
);
assert.equal(JSON.parse(body).actor_account_id, parsed.actor_account_id);
const corrupt = [
  '{"actor_account_id":"' + parsed.actor_account_id + '",' + raw.trim().slice(1),
  raw.replace(/"row_revision":\s*1/, '"row_revision":2,"row_revision":1'),
  raw.replace(/"version":\s*1/, '"version":1.0000000000000001'),
  raw.replace(/"version":\s*1/, '"version":9007199254740993'),
  raw.replace(/"version":\s*1/, '"version":1e0'),
];
for (const source of corrupt) {
  assert.notEqual(source, raw);
  assert.throws(() => parseEventJson(source, 4194304));
}
console.log(
  "Actual complete SQL text admitted; five original-text corruption cases rejected.",
);
