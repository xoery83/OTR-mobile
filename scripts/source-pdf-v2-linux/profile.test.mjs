import { test } from "node:test";
import assert from "node:assert/strict";
import { qpdfWarnings } from "./extract.mjs";
const warning = (id = "12 0") => ({
  status: 3,
  stderr: `WARNING: /tmp/original.pdf (object ${id}): object has offset 0\nqpdf: operation succeeded with warnings\n`,
});
const data = () => ({ qpdf: [{}, { "obj:12 0 R": { value: null } }] });
test("only unreferenced null zero-offset objects are tolerated", () => {
  assert.deepEqual(qpdfWarnings(warning(), data()), ["12 0 R"]);
  assert.deepEqual(qpdfWarnings({ status: 0, stderr: "" }, data()), []);
});
test("a reference to the zero-offset object anywhere is rejected", () => {
  const metadata = data();
  metadata.qpdf[0].target = { child: ["12 0 R"] };
  assert.throws(() => qpdfWarnings(warning(), metadata), /PDF_V2_ZERO_OFFSET_REFERENCED/);
});
test("non-null, missing, malformed, extra warnings and errors fail closed", () => {
  for (const metadata of [
    {},
    { qpdf: [{}, {}] },
    { qpdf: [{}, { "obj:12 0 R": { value: {} } }] },
  ])
    assert.throws(() => qpdfWarnings(warning(), metadata), /PDF_V2_ZERO_OFFSET_NOT_NULL/);
  for (const result of [
    { status: 2, stderr: "error" },
    { status: 0, stderr: "warning" },
    { status: 3, stderr: "warning" },
    { ...warning(), stderr: warning().stderr.replace("offset 0", "offset 1") },
    { ...warning(), stderr: "WARNING: repaired\n" + warning().stderr },
  ])
    assert.throws(() => qpdfWarnings(result, data()), /PDF_V2_/);
});
