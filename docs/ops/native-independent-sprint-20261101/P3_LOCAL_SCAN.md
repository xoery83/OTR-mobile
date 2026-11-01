# P3 synthetic scan consumer

Golden Slice: DEV Form preview → fixed synthetic suggestions → select fields from one candidate → Apply to the current Draft → unchanged normal Manual Save. Same editor/repository for Create and Edit; the original repository draft object is never cloned or replaced. Name maps to both title and property name; raw address remains text and clears pending Apple Place provenance. No Person, Contact, Instructions, booking or evidence identities are inferred.

The scan consumer is absent by default. Synthetic values are explicitly labelled. Each candidate keeps its own field selections, but Apply targets one current draft only; this is not multi-object batch save. Wrong-target Edit suggestions reject. Any manual mutation increments an in-memory revision even if the user restores the previous bytes. A new Form instance rejects prior results. Suggestions are not persisted, so cold restore cannot mistake them for saved facts.

Validation: 2 suites / 33 tests PASS, scoped TypeScript PASS, scoped ESLint PASS, UI guard PASS. Includes original Save receiving the same draft, Cancel invalidating retained Apply callbacks, edit-away-and-back invalidation, field validation/date order, wrong Edit target and candidate separation. No device visual or real OCR/DeepSeek/Hosted E2E claim. Independent review of new scan/mount batch pending.

Local logs: `/private/tmp/otr-p3-full-suggestions-{tests,types,lint,ui-guard}.log`.
