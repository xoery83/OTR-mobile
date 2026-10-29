# Mixed input partial processing — approved product slice

Reuse existing Source preparation's selected plans/unhandledInputIds and immutable
full C3 submission. The current running Source profile supports TEXT and UTF8 FILE.
Known unsupported input metadata (IMAGE, or non-text FILE) may remain outside the
processing Run; no Source/Task input or Candidate identity is invented for it.
All supported text inputs remain required; missing/changed text, foreign inputs,
Account/Trip mismatch and incomplete intake still fail closed. Actual format
validation and all existing Source/Admission/Core checks remain unchanged.

Results list the omitted input filenames separately as not processed, without
creating a Review unit or claiming original/cloud availability or Save. Whole
C3 identity/originals remain unchanged; completed Task recovery never recharges
or silently adds newly supported inputs. All-unsupported batches create no Task.
This does not authorize PDF/OCR processing or widen Source authority.
