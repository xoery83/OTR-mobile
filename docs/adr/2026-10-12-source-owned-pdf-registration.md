# Source-owned finite PDF custody and derivative registration

Status: scoped CLOSED implementation for Owner Review, 2026-10-12.

CP-FLIGHT-PDF-SOURCE-02 authorizes closing Backend-01 missing owning operations,
not a storage/provider or producer redesign. Reuse VERIFY_REPRESENTATION operations,
immutable result receipts and attempt finalization for ORIGINAL custody; reuse the
accepted Source-owned finite PDF decoder/producer and seal trust boundary. Add a
private immutable derivative registration receipt satellite in Source scope because
the finite existing Source operations cannot register DERIVED rows. Do not reinterpret
PREPARE_REPRESENTATION or replace legacy command codecs/operation guards.

A forward migration narrowly admits only verified ORIGINAL state update through an
existing VERIFY attempt and exact DERIVED TEXT insert backed by registration. All
other Source mutation denial remains. Both gates and NOLOGIN principals remain CLOSED.
No public DML or raw attempt helpers. Root/member/revision column grants plus lock-only
UPDATE RLS allow serialization, with WITH CHECK(false) denying actual writes.

Registration is provenance, never Canonical qualification. Independent existing seal
rereads bytes and verifies the complete derivative; Core repeats epoch/custody/whole-
Source/airport/purpose/temporal checks. Ordinary Quartz/general PDFs remain unsupported.
No HTTP, uploader, private provider, Native bridge, scheduler or execution journal is
added. Future runtime activation must review exact ACL/guard hashes and owning custody
composition; this migration does not update/authorize Hosted activation inventories.
Shared DTO/interface and acceptance limits are in
`../trip/contracts/CP_FLIGHT_PDF_SOURCE_REGISTRATION_V1.md`.
