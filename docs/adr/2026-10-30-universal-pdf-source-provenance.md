# Universal PDF Source provenance — implementation candidate

The frozen interpretation/lifecycle material contract binds text bytes and their
hash to the owning Input representation. A PDF original cannot be relabeled as
TEXT or used as a text-span pin: `readP1SourceSnapshot` and lifecycle validation
correctly reject that mismatch.

Reuse the existing sealed DERIVED TEXT representation as the interpretation and
lifecycle Input material. Keep the existing PDF ORIGINAL, parent relation, V2 seal
and page map; no new Source, Task, custody or admission system. The existing Task
transform pin carries the derivative's transform-options hash. An optional
`pdfSource` provenance object in owning manifests/results preserves the original
representation/hash/size separately from interpreted text and its existing hash.
Native matches retained originals using that original identity and byte count.

This metadata is not Source proof or authority. Owning SQL must qualify the exact
retained parent/derived/seal under normal Actor/Trip scope before returning it.
Current SQL eligibility and runtime preparation remain closed. Source normalization,
Core material qualification, scoped authority and isolated Host execution must be
validated before any real PDF Task/Save. Existing TEXT bodies and hashes stay exact;
no prompt, provider or interpreter redesign and no OCR profile is included.
