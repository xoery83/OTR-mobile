# PNG original command proposals and continuation — local software, 31 October 2026

Status: IMPLEMENTED / LOCAL_PASS only. No Backend, SQL, Host, runtime flag, Source
registration, decoder, Storage or model execution is installed by this slice.

The existing binary-original proposal builder is extracted into
`sourceBinaryOriginalCommands.ts`; both adapters retain the existing canonical
Source command/result hash tuples and schemas. PDF remains on
`otr.universal.pdf-preparation/1`, with all six IDs/keys and derivative requests
unchanged. Before extraction, a deterministic synthetic PDF proposal's complete
JSON bytes were frozen at SHA256
`a7817f27ecee69361d0355d4bfffbc730a8e0eaccc6100c3a4b20b5a99bdf801`.
The same assertion passes after extraction, including output field ordering.

PNG uses `otr.universal.png-preparation/1` and `png-prepare:`, `png-upload:`,
`png-verify:` operation keys. Only PREPARE_REPRESENTATION, UPLOAD_ORIGINAL and
VERIFY_REPRESENTATION are proposed. No PDF producer profile, derivative, text
registration, seal or decoder fingerprint is issued.

`prepareAdmittedPngOriginal` accepts an optional explicit
`PngOriginalPreparationPort`. Missing port is closed. Its lookup/execute/reconcile
methods exchange the existing Source operation reply. Execute is called only for
an absent operation; existing nonfinal operations are reconciled by the same IDs
and are never re-sent for upload by Native. An unresolved reply stops before the
next command. A verified final receipt must pass canonical digest, identity,
material/row pins and state checks and a final owning lookup of the same result.
Account/view/cancel checks surround awaits; actual retained binding/bytes are
copied and validated before any port call.

The concrete server port must own normal Auth/Trip checks, canonical attempts,
actual bounded decoder PARSE_PASS, Storage no-upsert/independent GET evidence,
UNKNOWN reconciliation and protected Source finalization. The interface creates
none of those authorities. Synthetic test receipts are not server acceptance or
independent readback. The Owner's 42,630-byte PNG was not registered or interpreted
by this work; x64 decoder qualification remains Root-owned. No old ARM fingerprint
is substituted.

Tests cover frozen PDF output, namespace separation, substituted acquisition/
receipt/state rejection, no-port closure, original bytes, three-command recovery,
UNKNOWN with no repeated execute, foreign operation replies, unavailable final
lookup and late cancellation. Existing PDF continuation and transport tests are
included; there is still no Photo Vision or formal Save E2E claim.

Final local validation: six suites74 tests PASS, full typecheck PASS,
changed-code ESLint with max-warnings=0 PASS, diff-check PASS. The complete PDF
byte-freeze assertion was run before and after extraction. No UI files changed.
