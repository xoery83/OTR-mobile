# MCP-C02 auxiliary — Ledger interface readiness

3 November 2026. Local source inspection only; no financial write, Hosted
activation, new permission or consumer acceptance. This is preparation for a
later Golden Slice and does not block Full-field P3 Create/Edit.

## Existing implementation versus missing integration

| User task                             | Existing owning interface and MCP reuse                                                                                                                                                                   | Current result / next requirement                                                                                                                                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find existing Expense                 | `GET /v2/trips/:tripId/expenses`, owning `ledgerExpenseListResponseSchema`; MCP `list_expenses` validates Trip, page size and cursor and preserves original Money                                         | Adapter implemented, opt-in/default-off. Activate only under lawful financial read permission; follow all pages before interpreting a complete inventory. A failed reader is not an empty ledger.                                                             |
| Create Expense                        | Typed `POST /v2/trips/:tripId/expenses`, `expenseCommandRequestSchema`; MCP `create_expense {trip_id,request_id,expense,mode,preview_digest}` constructs the existing envelope                            | Adapter implemented. No independent Ledger writer needed. Real activation requires trusted recovery binding and explicit user confirmation.                                                                                                                   |
| Edit Expense                          | Typed `PUT /v2/trips/:tripId/expenses/:expenseId`; MCP `update_expense {trip_id,request_id,expense_id,base_expense,patch,audit_reason,mode,preview_digest}` pins the observed canonical revision and base | Adapter implemented. Retain untouched field groups, use real conflict handling; no silent rebase, payment inference or settlement mutation.                                                                                                                   |
| Recover original Create/Edit          | Owning commands have idempotency and canonical receipts; MCP accepts an injected `expenseRecovery` port                                                                                                   | **Not connected/qualified:** durable original identity/intent binding plus receipt or first-send reservation. Missing port keeps Expense write tools undiscoverable. Existing Expense contents alone do not establish whether the original command committed. |
| Link Expense to Trip Item             | Core declares `LINK_EXPENSE` / `UNLINK_EXPENSE`; MCP has typed `expenseLinkIntent` and a BLOCKED planner                                                                                                  | **Missing executable owning capability:** current manual Core mutation throws `OWNING_CAPABILITY_REQUIRED`. Need authorized complete relationship read, association mutation and immutable receipt/status. Do not treat a Notes reference as a link.          |
| Keep receipt/booking/payment evidence | Existing distinct Ledger receipt and payment/valuation contracts; Source/Document admission belongs to Import                                                                                             | Not part of current MCP Expense Create/Edit activation. A hotel price is not proof of payment, and an attachment in chat is not admitted permanent Source.                                                                                                    |

Sources: `mcp/domainAdapter.ts`, `mcp/domainToolRegistry.ts`,
`mcp/peopleExpenseAdapter.ts`, `src/data/api/ledgerMutationContracts.ts`,
`src/data/api/ledgerReadContracts.ts`, `backend/src/app.ts`,
`src/domain/trip/tripCoreV2Commands.ts`,
`src/domain/trip/tripCoreV2Mutation.ts`.

## Exact recovery port required before Expense write activation

Reuse `DomainBinding` and `ExpenseRecovery` in `mcp/domainAdapter.ts`:

- Persist the original Account, OAuth client/resource, Trip, command ID and
  canonical intent digest before the first dispatch.
- Return either `{state: "RECEIPT", binding, response}` with the original typed
  canonical response; `{state: "FIRST_SEND_RESERVED", binding}` authorizing only
  the reserved first dispatch; or `{state: "UNKNOWN"}`.
- After response loss or process restart, return the persisted original binding.
  Never echo a new caller's digest over an old receipt/reservation. A consumed
  reservation must not grant a second dispatch.
- Foreign identity, changed same-ID intent, unavailable receipt, timeout and
  not-visible state remain UNKNOWN with no automatic new POST or new request ID.

This is an integration/owning recovery gap, not absence of Expense Create/Edit.
Existing MCP adapter tests simulate response loss and verify receipt recovery,
no second dispatch and rejection of changed/foreign binding
(`mcp/domainAdapter.test.ts`). Those tests do not qualify a real durable host port.

## Exact Item–Expense association boundary

Request: explicit Trip, Expense and Item identities, both observed revisions,
stable association operation ID, LINK/UNLINK action, and trusted confirmation.
Owning code must validate current access to both objects and preserve existing
object state. Response: association identity and operation receipt/status, plus
legal relationship readback. A complete authorized relationship reader must
separate absent link from unavailable/redacted links.

`docs/ledger/LEDGER_2_0_API_CONTRACT.md` lists
`POST /v2/trips/:tripId/expenses/:expenseId/links`; this declaration alone is not
runtime evidence. The inspected `backend/src/app.ts` evidence dispatcher handles
`payment-records|valuations`, not this Item-link route; current Core LINK/UNLINK
explicitly rejects manual execution. Receipt-to-Expense links implemented under
`/receipts/:id/links` and personal-payment attachment links are different
relationships and must not be substituted.

If object creation succeeds but linking fails, retain its original Expense/Item
ID and receipt and report the relationship BLOCKED/UNKNOWN independently. Never
recreate the Expense to repair the link, and never report object APPLIED as link
APPLIED.

## Minimum later financial Golden Slice

1. Obtain normal, explicitly authorized financial read/write and qualified
   recovery binding; leave settlement, payment, receipts and Source tools closed.
2. Read roster and existing Expenses; resolve payer, allocation and identity.
3. Preview one synthetic Expense with integer minor units, explicit ISO currency
   and exact splits. Distinguish quote, total, deposit, balance and payment;
   repeated confirmation material is not another consumption.
4. Confirm, submit once, obtain canonical receipt and independent same-ID readback.
5. Edit one descriptive field using the same canonical base/revision; confirm,
   verify receipt and preservation. Exercise original-ID recovery after response
   loss/process restart without a second dispatch or new ID.
6. Qualify Item-link capability as a separate step: authorized complete read,
   confirm/link/receipt/readback, foreign denial and partial-success recovery.

No new financial policy decision is required for this preparation. Ambiguous
payer, refund nature or allocation remains a precise user question. Native
Expense/link downstream and actual ChatGPT/Claude financial behavior remain
NOT_TESTED.

## Scope and verification

Documentation-only source audit; no implementation files changed, so no tests or
build were rerun. Existing gap-register B adapters and C recovery/link gaps are
consistent with the inspected code. No Hosted state, money, real Nelson data or
original Notes QA Item was read or modified by this task.
