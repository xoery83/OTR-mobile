# Capture C4 local evidence

Status: isolated candidate. C3 `INPUT_VALIDATED` is the prerequisite for a C4 per-input `CAPTURE_LOCAL_INTERPRET` operation in the existing Account-scoped `sync_operations` queue. The existing Capture foreground timer runs both kinds; the generic sync worker excludes both. SQLite67 retains append-only C4 events and one immutable result per Input, pinned to the C3-validated original hash and byte count.

The Native bridge receives only verified original bytes. PDFKit yields text with exact page offsets; Vision yields ordered text and boxes. The reference Flight line grammar is factored into a pure Input/text parser, and its Import adapter still supplies real Source/Trip identities. C4 stores local observations with exact text spans and their page/box support, plus any separately marked advisory local-model observations. It creates no Source, Trip assignment, Core event, review decision, or remote request. Extraction or grammar gaps remain visible partial results; a model failure never erases deterministic evidence.

Automatic scheduling remains behind the existing null-by-default DEV Batch configuration. Production can read retained C4 results but does not enqueue new C4 work from this package.

Cloud custody is selective by Document Role. This slice neither uploads originals nor requires Hosted custody; transient local evidence and canonical fact/provenance sync remain distinct. Remote inference is separate from long-term document retention. C2 forced two-file QA upload does not enable production upload behavior.

The same local queue accepts retained TEXT as exact UTF-8 (at most 262144 bytes),
without requiring a Native extraction bridge. PDFKit/Vision extraction stays unchanged.
The Account-fenced `localResults` read adds `flightInterpretation`: the existing
Flight parser's items validated by the owning typed items schema, Input-only
fragments, unsupported deferred dimensions and ignored spans. This read projection
also works for immutable schema67 results; it does not rewrite their stored fields
or imply a Source-bound InterpretationResponse. Optional Apple observations remain
separate advisory evidence. Formal Flight Candidate interpretation still requires
real admitted Trip/Source/Representation/catalog/Run bindings; these are not inferred
from an unassigned local Batch.
