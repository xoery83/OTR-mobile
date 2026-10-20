# Source-owned PDF derivative seal /1

Date: 2026-10-12. Status: scoped CLOSED implementation; Owner integration pending.

PDFKit extraction metadata does not establish owning Source conversion authority.
Reuse the existing Source representations, Run/Input pins, Publisher2 and Core writer.
Add a private immutable seal satellite for already admitted PDF/TEXT representations.

The first accepted conversion profile is OTR_PDF_LITERAL_TEXT_V1: a finite, fully
reconstructed PDF1.4 grammar, without another parser dependency or execution service.
The Source backend reads actual custody bytes and independently decodes every page.
Core binds its private candidate digest to that exact seal and verifies the complete
single-original/single-derived closure. Fresh admission checks current custody/CAS;
historical receipt recovery never grants fresh admission. ORIGINAL TEXT is unchanged.

This deliberately excludes general supplier/Quartz PDFs. Extending the grammar,
trusted producer or custody provisioning requires a separate reviewed profile.
The migration gate is CHECK-CLOSED; no route/startup/principal activation is included.
Agent A composes actual custody/transport; Agent B consumes Source-admitted output.
Shared DTO/trust ownership remains Agent 3. Contract:
../trip/contracts/CP_FLIGHT_PDF_DERIVATIVE_AUTHORITY_V1.md.
