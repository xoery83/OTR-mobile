# PDF /2 Linux producer and registration — local implementation candidate

Status: **ENGINEERING CANDIDATE / NOT DEPLOYED / NOT HOSTED-APPROVED**.
Owner permits local implementation/tests and preparation of the exact protected
package. This document does not activate a new Source format or authority gate.
It does not change Flight Admission or the missing-service Review requirement.

## Executable selected profile

`OTR_PDF_QPDF_POPPLER_V2`, producer `otr-source-pdf-qpdf-poppler/2`, is implemented
in `scripts/source-pdf-v2-linux/`. It uses existing Node24 bookworm image
`sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`,
Debian qpdf `11.3.0-1+deb12u1`, Poppler `22.12.0-2+deb12u3`, linux/amd64.
The locally built worker is pinned to
`sha256:d27ddd7b09410b0a3b220b2768c0f6b2b25c32da528a42041bc50ea19eefc1b7`.
Full profile digest: `ca5a7b63bda8ed5c5b9018b82fbbd14c1a01f054a37b1c2ed76445152b36539c`.

The worker reads only stdin bytes and its fixed ephemeral `/tmp/original.pdf`.
Its caller uses no network, read-only root, UID65534, no capabilities/privilege
gain, 256MiB memory/swap, one CPU, CPU15s, wall20s, PIDs16, FD32, file16MiB,
tmp32MiB and bounded stdout. A Docker-client timeout does not establish worker
termination: removal and absence confirmation are required before returning.
No secrets, host directories, Docker socket or account material enter the worker.
These are measured implementation limits, not requirements for every future PDF
producer. Image dependency versions are fixed; the image digest pins transitive
runtime libraries as built. It is a separate component, not an npm dependency in
Mobile. qpdf and Poppler are chosen because neither reimplements the supplier's
business parser and both run on the existing DEV Linux architecture.

qpdf must validate the current PDF structure. Encrypted files, unsupported active
content/embedded attachments, malformed input, resource failure and all unknown
warnings fail closed. The sole tolerated warning class is an object with xref
offset0 **only when** the object is null and is not referenced anywhere in qpdf's
full bounded JSON graph. Both check and JSON passes must report the same set.
No `--warning-exit-0`, rewriting/repairing original bytes, or vendor rule is used.
The profile does not claim universal ISO/security certification or that every
unreferenced stream is semantically meaningful. The isolated runtime is necessary
because decoder validation does not remove native-parser risk.

Original bounds10MiB/pages32/text256KiB inherit the existing local /2 candidate.
Poppler `-layout -enc UTF-8 -nopgbrk` extracts each page separately; exact text,
including whitespace/newlines, is retained, pages joined by one LF, UTF-8 byte
spans hashed. It is `qpdf-poppler/1` extraction, never `apple-pdfkit/1`.
Different bytes require a different Derived representation and newly parsed
Field/Evidence IDs. Existing PDFKit original observations remain separate.

## Owning code and proof boundaries

- `sourcePdfV2LinuxVerifier.ts`: fixed worker, exact owning-reader scope and hash/
  byte pins, fresh second original read, shared strict UTF-8/page validation.
- `sourcePdfV2Registration.ts` / `sourcePdfV2Authority.ts`: real versioned SQL
  Verify/Register/Seal adapters, full existing access/CAS/receipt identities,
  distinct /2 hash domains and immutable replay checks. No caller text, decoder,
  image, URL or authority flag. No route/startup binding.
- `sourcePdfV2CoreProof.ts`: ordinary Core proof reader dispatches only an actual
  stored version2 seal. Checks fixed profile, current revisions/gate, retained
  exact Original key, Derived parent/text/hash/page map and /2 seal digest. It
  relies on the protected independently produced seal, not a fake re-encoding
  of a supplier PDF from extracted text. Historical reads keep existing fences.
- `captureFlightNativeRepository.ts`: accepts a separate Linux Derived TEXT only
  with the same original/Source identity and exact catalog text/hash/count. It
  does not make it authoritative; publication still needs the Backend proof.
- `referenceFlightExtractor.ts` adapter4: generic aligned Departure/Arrival
  columns reuse the same field normalization and real original text-byte spans.
  No source text reordering, new supplier-specific parser or Admission change.

All /1 DTOs, producer, registration/seal SQL functions and limits remain unchanged.
The old Core proof path only gains version2 dispatch; its /1 branch is preserved.

## Prepared protected difference

`docs/ops/source-pdf-v2-linux-20261017/registration-authority-candidate.sql` adds
nine version2 functions using existing tables/roles/gates. Only the existing
Derived mutation guard gains the exact version2 transform branch. No new role,
RLS policy, table or gate activation. Candidate was tested in a disposable,
network-isolated Server84 clone, not Hosted. Existing authority/registration
security checks and function fingerprints pass; source/pdf gates remain CLOSED.

This SQL is only the registration/seal portion. **It is not an executable full
Import deployment package**: initial Capture→Source acquisition/upload profile,
a formally bound restricted worker executor, Source-backed Booking-purpose
certification and normal owning Review/confirmation remain separate concrete
dependencies. The current DEV Backend has no bound restricted Linux worker port;
its ordinary container must not gain a Docker socket to run this local adapter.
The existing PNG parser lifecycle is a reusable pattern, not proof of a current
Backend PDF worker binding. Keep composition CLOSED until a reviewed existing
worker execution channel or a precise bounded deployment binding is approved.
