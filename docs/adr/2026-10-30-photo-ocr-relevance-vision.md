# Photo OCR relevance followed by original-image vision

Status: Owner-approved product direction,30 October2026; implementation pending
PDF closure and actual scoped qualification.

Reuse Native Apple Vision for cheap conservative relevance only. Formal Universal
interpretation receives original-image pixels or a qualified full-layout derivative;
OCR may be supporting context but never replaces that image. No local P1–P6 parser,
new media platform, Source/Task/Activity system or Core mutation is introduced.

Use RELEVANT / IRRELEVANT / UNCERTAIN. OCR absence/quality problems do not prove
irrelevance. UNCERTAIN waits for explicit Continue or Skip. Explicit image-analysis
intent may bypass relevance screening, never Auth/Source/provider/budget gates.
Decisions remain per original input and recover through existing lifecycle ownership;
completed Tasks/calls remain immutable and are not resent to append a new image.

The existing image request and region-validation ports are reusable. Their existence
is not formal image Source eligibility or Admission: current minimal Save still
requires text material/spans. Qualify image regions through the existing owning
Review/Admission boundary before claiming Photo Save. See the bounded Photo Delta.
