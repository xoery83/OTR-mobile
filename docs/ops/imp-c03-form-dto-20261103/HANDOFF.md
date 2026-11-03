# IMP-C03 current-main P3 DTO compatibility

Base: main `0a1cfbb9`; Native fixed candidate `10c34c51`.
Main already contains its three Import P3 dependencies and the Capture submission
deps export through `f15ff0ab`. No duplicate adapter, Backend endpoint, parser or
Native mount is needed. The three P3 implementation hashes match Native's fixed handoff. Current main
also retains the same submission deps getter; its unrelated job-list reads were
subsequently serialized by `dc8d04b1`, so that whole file is intentionally not
replaced with the older Native validation overlay.

The one incremental fix rejects an interpretation whose Task Actor differs from
the Form Account in the existing output runtime schema. The raw Source interpreter
already enforces this normal-Account relationship; the independent DTO boundary
must enforce it too. Projection ends by validating that same schema, so both paths
reject a mutually consistent foreign-Actor Task/result pair. This only denies an
invalid advisory response; it grants no Source, Provider, Save or Account authority.

Interface remains `otr.import.p3-form-interpretation/1` and the existing four-arg
Source interpreter `(context, signal, selections, getCurrentContext)`. Existing
Source/Representation/Task/request hashes and field evidence remain intact; no
clears, automatic candidate selection or Save are introduced. The default adapter
still supports TXT-only or enabled single PDF, one frozen material intent per Form.
Existing Backend gates, not this DTO, decide actual execution authorization.

Validation: foreign-Actor regression RED on the base; after the one-line schema
guard, five DTO/interpreter/Native-consumer/default-composition/submission suites
pass (80 checks). Scoped strict types, scoped ESLint, formatting and diff check pass.
No Provider/Host/SQL/device execution or paid/Native E2E claim. Status: LOCAL_PASS.
Writer: only the owning DTO `.ts`/`.test.ts` and this concise handoff/current-state
entry. Native Form/Navigation/Manual Save and shared Backend files remain unchanged.
