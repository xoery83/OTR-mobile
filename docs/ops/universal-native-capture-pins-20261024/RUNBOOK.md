# AD5 normal Capture → real local pin proposal

Preparation only. No GUI/device/DEV/Provider action was executed by this Writer. Use after Coordinator releases the Trip/P1 GUI lease. Keep all Universal SQL/Provider scopes and runtime capabilities CLOSED while collecting local pins. Existing Source/Task/Admission authority is unchanged.

## Shortest normal UI sequence

1. Make the two fixed `.txt` originals available in the simulator's **Files** app: `universal-mixed-bookings-utf8.txt` (1598B) and `lodging-supplement.txt` (433B). Do not use Photos/addmedia, relabel the PDF, edit SQLite or create Sources by copying files into database tables. The current app config does not promise UIFileSharing for arbitrary App/Documents copies.
2. Optional normal Files transfer: run `python3 scripts/import/serve-fixed-qa-originals.py --packet docs/ops/universal-dev-execution-20261024/EXECUTION_PACKET.proposed.json`. The server binds loopback127.0.0.1 only, serves exactly the two fixed hash-checked synthetic originals as inline text files, rejects arbitrary paths/uploads and expires after600s (maximum900). Open the printed URLs in **simulator Safari**, use Safari Share → Save to Files (the inline disposition avoids the simulator attachment/View loop), keeping their exact filenames, then select them through OTR's Files picker. No persistent QA transfer server was started here. A one-second isolated loopback test verified normal download, then expiry with an idle client still connected: the child exits, its socket closes and new connections fail. Threaded daemon handlers, socket timeout and response deadline share the finite lifetime. This transfers originals only; it never registers Source/Batch or proves authorization.
3. In the ordinary dedicated synthetic QA Account/Trip, use lower-right `+ → Import Travel Plans`, select that legitimate QA Trip, `+ → Files`, and select both originals (DocumentPicker already supports multiple). Paste the exact172-byte Root `submitted-user-text.txt` content into the composer, including its final newline. Submit **once**. `prepareSubmit()` retains the actual editor text; it does not trim it. Normal C3v2 must show3 accepted inputs in one Batch. Keep its retained order; the pin reader matches the three originals without assuming picker ordering.
4. Before a model-capability Gate exists, the first explicit `capture.ai.process` button (`UniversalCaptureResults → useUniversalCapture.start`) can only encounter the closed/missing context. The approved consumer invokes normal Source local preparation only on exact503 `UNIVERSAL_IMPORT_CLOSED`/`UNIVERSAL_CONTEXT_UNAVAILABLE`; it reuses existing Source binding/queue and does not mint Task/Run. Closed Source registration remains unavailable, which is expected. Do not repeatedly tap, enable a global queue, use historical pending data or open paid Provider gates. Source-local operation IDs are enough for the proposal; registration is still unproven.

Current exact dependency: Source preparation obtains the existing sealed Native catalog receiver before admitting local Source intents. If that capability is unavailable, or Backend context returns404/network/Auth failure rather than the exact prerequisite503, **no Source operations are generated**. The pin tool reports SOURCE_OPERATION_NOT_PREPARED; it cannot bypass this, generate IDs or install a proof. Root must close the concrete normal Host/capability/configuration prerequisite, not populate fake pins.

## Read-only extraction

Use Root's previously verified AD5 `otr-mobile.db` path in its existing App container (resolve with `xcrun simctl get_app_container <AD5 UUID> com.xoery.otrmobile data` only when the GUI/device lease permits). Do not copy the App DB or Session into Backend/Workbench. This local tool opens the original SQLite file with `readOnly:true` and `PRAGMA query_only=ON`; its write/ID functions throw. It does not read Auth/Keychain or call the network. Explicit QA Actor/Trip are local read-scope pins, **not normal Auth verification**.

The operator accepts only the approved `EXPECTED_INPUTS.json` exact bytes (SHA256 `318dac3f8ed0a2153f097fdc80411d34bae25adb8f1ecadb6c91ec4bed92cdc6`), checked before opening SQLite. A replacement 2 FILE + 1 TEXT whitelist is rejected in both list and job modes without an output file. The general Repository projection remains reusable.

Build once:

```sh
npx esbuild scripts/import/read-native-capture-pins.ts --bundle --platform=node --target=node24 --format=esm --alias:@=./src --external:react-native --external:expo-* --outfile=/private/tmp/otr-read-capture-pins.mjs --banner:js='import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'
```

Find only matching real QA jobs, then explicitly choose the actual job ID:

```sh
node /private/tmp/otr-read-capture-pins.mjs --sqlite "$QA_DB" --account "$QA_ACTOR" --trip "$QA_TRIP" --list --expected-inputs docs/ops/universal-native-capture-pins-20261024/EXPECTED_INPUTS.json
node /private/tmp/otr-read-capture-pins.mjs --sqlite "$QA_DB" --account "$QA_ACTOR" --trip "$QA_TRIP" --job "$REAL_JOB_ID" --expected-inputs docs/ops/universal-native-capture-pins-20261024/EXPECTED_INPUTS.json --out /private/tmp/otr-real-c3-pin-proposal.json
```

The output contains real C3 Batch/job/input/order/provenance/original filename/byte hashes and canonical submission SHA, plus **only already-existing** Source/Representation/Operation/key/SHA/queue pins. It independently re-reads retained original bytes and checks the existing command/binding correlation. Missing Source binding produces null pins; no ID is generated, no Source/Task/Run is created and no queue is dispatched. No source text, raw bytes, token or private response is exported. Output is explicitly LOCAL_C3_AND_EXISTING_COMMANDS_ONLY_NOT_SOURCE_PROOF. Real authenticated owning acquire/receipt/catalog and later Run/Task remain required by the execution Gate.

Do not use `listDefaultCaptureJobs`/`reopenDefaultCaptureJob` for this tool: they call withLocalProcessing and may schedule work. The tool uses the underlying owning Repository list/reopen/read methods only. It rejects unsupported profile, Account/Trip mismatch or a different QA-original set. Its output file is exclusive mode0600; it never overwrites an earlier receipt.

## Local evidence / next action

Four actual SQLite tests include missing-source/no-write, exact prepared pins and cold read, Account/Trip rejection, and the **actual bundled operator reading the same existing SQLite file with its file hash unchanged**. The bundled CLI positive uses the three approved originals; substitution negatives cover both list/job modes and unchanged database bytes. Combined existing Source tests11 PASS; TS/lint PASS. No Native UI/real Auth/Source/AI PASS is claimed. Root can now collect actual inputs, attach the pin proposal to the fixed Gate, qualify normal Auth/readers/provider/current service preimages and seal the reviewed finite watchdog plan. Original Sources are not registered by this runbook or exporter.

## Actual Coordinator checkpoint

Normal AD5 Files picker + exact172-byte text submitted one real Batch3665f191… / Jobe8085c43…; all3 originals accepted with independent retained-byte hashes ([receipt](receipts/ACTUAL_NATIVE_C3_RECEIPT.json), [pins](receipts/ACTUAL_C3_LOCAL_PINS.json)). File originals were seeded exclusively into Files local storage, not OTR tables; this prepares originals only. Prior failed Batch and its normal continuation remain retained. No functional file-reader patch is claimed: fresh full intake passed, initial transient READER_FAILURE cause remains unconfirmed.

The readonly exporter now checks the actual App schema_migrations journal (migration73 exactname), because native PRAGMA user_version is0. Its fixture now uses the same journal and leaves PRAGMA0;4 scoped tests and actual readonly export PASS. This changes no App schema/Source/Sync authority. Source pins remain null until approved closed Context/normal local preparation.
