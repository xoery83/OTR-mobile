# Native pin exporter — independent bounded review

Fixed `9ac1e3ae447f0a1c288f674ae59d28d2221f3eff`: **HOLD — two P2 boundary gaps**, no P0/P1 finding.

1. **P2_NATIVE_PINS_01**, `read-native-capture-pins.ts:39–54`: --expected-inputs accepts any three shape-valid tuples. The actual bundled CLI test succeeds with Original0/1.txt and arbitrary text, outside the approved three QA originals. Thus the CLI is caller-selected, not a fixed QA allowlist, and can export unrelated batch metadata/pins. Pin approved tuple content or expected-file hash before DB open; keep generic repo function reusable. Add replacement whitelist rejection test.
2. **P2_NATIVE_PINS_02**, `serve-fixed-qa-originals.py:37–41`: idle client blocks synchronous HTTPServer request parsing. Independent actual loopback test with --seconds1 still runs at2s and exits only after client closes. Timer.shutdown cannot guarantee finite expiry or stop a late response. Use independent hard deadline/active socket closure or bounded threaded handlers; test idle and partial request sockets. Reproduction cleaned up all reviewer resources.

Independent6 scoped tests /2 files PASS, including actual bundled readOnly CLI, actual SQLite unchanged-file hash and Account/Trip rejection. No implicit product write, source preparation, scheduling, ID generation or network in pin export; no raw content/session/token exported. Missing bindings remain null and output is explicitly not Source Proof. Loopback serves only hash-checked synthetic originals and no upload/listing.

No DEV/Provider/Native GUI operation. Optional actual loopback fixture only; actual Native pin acquisition remains Root work.
