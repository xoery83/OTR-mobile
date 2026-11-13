# Expense and Item links — local planning adapter

Use existing `createLedgerExpenseRequestSchema`/`updateLedgerExpenseRequestSchema`
for complete command drafts. `prepareExpensePlan` also checks unique participants,
matching split identities and exact original-minor total. Backend is still final
authority for money, valuation, permissions and allocation. Default-closed domain adapters now use the existing typed POST/PUT and validate
actual owning receipts; high-level create/edit tools build their envelopes.
No financial write is activated by this local candidate.

`reviewMoney` distinguishes TOTAL/QUOTE/DEPOSIT/BALANCE/PAYMENT/REFUND and existing
Expenses. Equal total evidence is not another Expense; total/deposit/balance are
not additive consumption. Unknown payer/splits require input; price does not prove
payment. Existing total can propose NO_CHANGE + separate pending LINK.

The scoped Expense fixture is an MCP projection, not a new Backend schema:
`arrangement_key` represents a client/source correlation to be confirmed, not an
existing Ledger identity column or identity proof. The actual scoped list reader maps canonical Expense DTOs without inventing a
booking correlation (server:<expense-id> is only a candidate key). Matching
title/date/amount is a question, not identity proof. The adapter preserves original
currency/minor units, payer, participants, splits and revisions. Link visibility
is not complete, so an empty list is not proof a link is missing. No projection
or raw outcome supplied by a model is trusted as an actual saved Expense.

Trusted recovery must return a verified immutable receipt or a durable first-send
reservation. No binding means no Expense write tools; UNKNOWN never permits a new
POST. Multi-currency quotes/refunds are not automatically converted or netted.
Many Item associations retain separate outcomes from the Expense.

LINK/UNLINK intent names exact Trip/Expense/Item/operation/revisions. Always BLOCKED
until Core/Ledger owning capability is qualified. Never write expense_links from
MCP. Object receipts and link receipt remain separate. Tests cover prior Expense,
seven-person/multi-night total, deposit/balance/quote and false link success.

Expense recovery must return the persisted original actor/client/resource/Trip/
command/request-digest binding with either receipt or first-send reservation.
The adapter compares it to the pinned request; a same-ID different-intent or
foreign binding remains UNKNOWN and never causes a new POST. A host must not
echo a new caller digest over a previously stored receipt.
