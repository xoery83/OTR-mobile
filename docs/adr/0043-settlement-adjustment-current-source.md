# ADR 0043: Settlement updates use one current source cutoff

Date: 2026-09-25
Status: Approved for the source-range repair

An Adjustment confirming ordinary post-Final changes uses the current Settlement
Preview's explicit `throughTimestamp`, not the root Settlement's historical cutoff.
The Adjustment Preview returns that cutoff; confirmation carries it through the
durable queue and the Backend recomputes the same canonical source under the
lineage lock. It also rejects a newly changed current source before insertion.

The new immutable Adjustment stores its own cutoff and complete current inputs.
The root's cutoff, inputs, valuation evidence, payments and audit remain frozen.
The existing root-cutoff source remains available for the separate correction
successor path; this decision does not redesign that flow.
