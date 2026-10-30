# Photo relevance software slice — 30 October 2026

Status: IMPLEMENTED / LOCAL_PASS, explicit read-only adapter only. Base411c5317.
No default UI caller, durable Photo decision installation, Source/Task dispatch,
Provider call, DEV change, Native OCR execution or Photo Save E2E is included.

## Implemented

- `photoImportRelevance.ts` emits only relevance/reason, never P1–P6 fields or
  candidates. Readable travel clues may return RELEVANT. Empty, malformed,
  low-quality, unrecognized or inconclusive OCR remains UNCERTAIN.
- Automatic IRRELEVANT is deliberately **not reachable** from these OCR-only
  observations: they cannot prove no useful visual travel content exists. The
  three-state value contract can represent independently confirmed unrelated
  content; no such classifier/issuer is installed. Skip remains an explicit
  user choice, not an OCR verdict. A textless everyday photo is UNCERTAIN.
- Continue/Skip is a serializable, exact-original-bound value. Continue returns
  only QUALIFY_ORIGINAL_IMAGE, never execution/Admission permission. No OCR text
  is returned as model material. Existing real request-builder tests additionally
  verify exact image pixels/data URL/hash and unchanged one-image/4MiB limits;
  they do not invoke the Provider. Skip retains the original. Account, Batch,
  input ID/order, Capture revision, payload, hash, size and MIME are pinned.
- The byte-bound screener reuses the existing Apple Vision extraction interface;
  it validates hash/size and JPEG/PNG signature and rejects original mismatches.
  OCR failure remains uncertain; cancellation withholds the late result.
- `screenUniversalPhotoInput` reads through existing submissions.reopen and
  captures.getForSourceHandoff, rechecks normal Account/generation and exact
  current original after OCR, and never writes or assigns a Capture. Other
  mixed-Batch inputs need not be ready and are left untouched.

## Next owning integration, without a second lifecycle

1. Existing C3 accepted input facts are immutable and have no Photo decision slot.
   Existing capture_local_interpretation_results is the historical local Flight
   diagnostic result, not a Photo user-decision store. Do not write Photo state
   there. Add the smallest approved input-keyed relevance/choice extension to the
   owning Capture lifecycle, with current Account generation, exact pin CAS and
   existing retention/reopen semantics. This slice does not install that schema.
2. The Import-owned UI may call screenUniversalPhotoInput explicitly and display
   the existing Continue/Skip controls after their canonical copy is integrated
   by the designated Writer. Do not edit shared Navigation/Session/DayFeed/Sync.
   The current software value roundtrip test is not cold-restart persistence.
3. Before dispatch, resolve the persisted choice against a fresh original pin,
   then use existing Source image preparation/qualification. Current normal
   Universal input predicate still excludes IMAGE. Do not simply flip it.
4. Qualify IMAGE in the existing Task/Attempt selection and real scoped Provider
   configuration. Existing buildUniversalDeepSeekRequest already supports inline
   original-image data with byte hashes; it is not called here. Keep at least
   original pixels or a qualified full-layout image, never OCR-only material.
5. Existing minimal Source Review/Admission currently accepts text spans; legal
   image-region evidence needs its owning bridge and any protected authorization.
   Reuse existing Source/Task/Receipt/Core and immutable completed/UNKNOWN recovery.
   No automatic replay of successful or UNKNOWN calls to append waiting images.

## Validation and boundaries

Four new suites44 tests PASS; four existing OCR/Capture/Profile/output-contract
suites54 tests PASS. Typecheck, changed-code lint and UI guard PASS. Tests use
synthetic bytes and mocked OCR; none proves Apple Vision on-device or paid Vision.
No dependency, model/Secret/budget, Schema/RLS/GRANT/Role or default runtime change.
The parent Delivery Owner retains PDF/DEV/main integration ownership.
