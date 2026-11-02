# First Photo cold503 — bounded recovery candidate

Historical Nov1 first failure stays OPEN_UNPROVEN. FIRST_FAILURE_RECONCILIATION.json
pins original receipts and the deployed-source assembly; it distinguishes the
BINDING/FAILED event from Nov3's independently proven expired binary read failure.
The original sanitizer removed requestId values and underlying error details.
The logged route bucket does not distinguish context GET from per-Task Results.
No duration or neighboring request is promoted to a root cause.

Current main9eef omitted the already-accepted b9e394dc/c555a4fa continuous503
uncertainty guard. Two directed tests first fail against unchanged production;
restore the same minimal !continuous condition. Continuous503 now throws the same
error without preparing Sources/resuming/executing; next recover uses the same
Batch/Task and no new Provider operation. Existing owning404 and legacy first-start
behavior remain. This repairs a reproducible client error, not the historical503.

45 focused checks pass (42 consumer +3 network-none owning-host fixtures), scoped
strict and lint pass. Host injection checks one binding failure then same-ID accepted
read with unchanged operation and one synthetic send total. No actual paid call,
Hosted/SQL/device/main/authority action. Root independent review/merge remains
pending; no broader Backend, Parser or Source permission change is proposed.
