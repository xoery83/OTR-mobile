# OTR Terminology Glossary

Normative · Owner Decisions v2 · 2026-10-03 (Pacific/Auckland).

Canonical terminology source for user-facing OTR product language.
Read alongside [UI Foundation](ui-foundation.md) before editing copy/localization.
Owner approved these mappings; they do not redefine models, permissions or financial
policy. Catalog keys are display adapters. Persisted enums/IDs, user names/titles,
filenames, currency codes, notes and remote evidence remain original data.

## Canonical product/domain vocabulary

| English concept     | Canonical Simplified Chinese |
| ------------------- | ---------------------------- |
| Trip                | 旅行                         |
| Journey             | 行程                         |
| Participant         | 参与者                       |
| Member              | 成员                         |
| User                | 用户                         |
| Organizer           | 组织者                       |
| Owner               | 所有者                       |
| Traveller           | 旅行成员                     |
| Creator             | 创建者                       |
| Payer               | 付款人                       |
| Ledger              | 账本                         |
| Expense             | 支出                         |
| Spending            | 消费                         |
| Share (allocation)  | 份额                         |
| Split               | 分摊                         |
| Sharing             | 分摊                         |
| Share (file action) | 分享                         |
| Settlement          | 结算                         |
| Payment             | 付款                         |
| Transfer            | 转账                         |
| Paid                | 已付                         |
| Received            | 已收                         |
| Review              | 审核                         |
| Finding             | 待处理事项                   |
| Category            | 类别                         |
| Attachment          | 附件                         |
| Receipt             | 收据                         |
| Currency            | 币种                         |
| Journey Currency    | 行程结算币种                 |
| Journey Value       | 行程币种金额                 |
| Display Currency    | 显示币种                     |
| Exchange Rate       | 汇率                         |
| Reference Rate      | 参考汇率                     |
| Agreed Rate         | 约定汇率                     |
| Actual payer cost   | 实际付款金额                 |
| Balance             | 余额                         |
| You owe             | 你应付                       |
| You are owed        | 你应收                       |
| Confirm             | 确认                         |
| Finalized           | 已完成最终结算               |
| Correction          | 更正                         |
| Restore             | 恢复                         |
| Sync                | 同步                         |
| Offline             | 离线                         |
| Mine                | 我的                         |
| Group               | 团队                         |
| Everyone            | 所有人                       |

## Allowed contextual phrasing

| Context                                      | Allowed phrasing                                         | Boundary                                                                             |
| -------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Active account / active Journey              | 当前 / 进行中                                            | Different objects.                                                                   |
| Today root tab / search-date prose           | 今日 / 今天                                              | Natural contextual wording.                                                          |
| Split section-action / explicit method label | 分摊 / 分摊方式                                          | A method label can qualify the canonical term.                                       |
| Share allocation / file action               | 份额 / 分享                                              | Allocation is not file sharing.                                                      |
| Paid by {name}                               | 付款人：{name}, 由 {name} 付款, or natural 已付 phrasing | Preserve Payer and identity.                                                         |
| Review workflow / generic check              | 审核 / 检查                                              | Check latest values/connectivity/readiness can use 检查; product workflow uses 审核. |
| Expense / ordinary fee-cost prose            | 支出 / 费用 or 成本                                      | Bank fees and other costs are not automatically Expense entities.                    |
| Receipt / user document data                 | 收据 / original data                                     | Do not translate filenames, image pixels or remote evidence.                         |

Plural/grammar/action phrasing can vary naturally. Pending needs an object such as
待同步、待处理、待发布; no universal financial Pending state is introduced.

## Prohibited semantic conflations

- Trip names the product/module; Journey the scoped container/context. Distinguish
  旅行/行程 in UI without renaming schema trip_id or routes.
- Participant is Expense participation; Member is Journey membership; User is
  account identity. Linked/unlinked membership remains unchanged.
- Organizer, Creator and Payer are independent roles/facts. Owner/所有者 primarily names domain/legacy ownership. It is not Organizer,
  does not replace Organizer in current UI and implies no permission equivalence.
- Traveller/旅行成员 is generic user-facing traveller wording, distinct from
  Journey Member/成员, authenticated User/用户 and per-Expense Participant/参与者.
- Expense/支出 and Spending/消费 remain distinct. EXCLUDED Expenses can still
  appear in Spending; wording never changes inclusion rules.
- Share allocation/份额, Split-Sharing/分摊 and file Share/分享 remain distinct.
- Payment record-event/付款 and Transfer plan-obligation/转账 remain distinct.
  Paid and Received are separate bilateral states, not one completed state.
- Review/审核 is a workflow; Finding/待处理事项 a record. Optional member Looks
  good does not finalize settlement or accept FX.
- Journey Currency/行程结算币种 is distinct from Display Currency/显示币种;
  original Expense currency remains original.
- Reference Rate, Agreed Rate and Actual payer cost evidence are distinct.
  Actual payer cost is an amount, not an independently defined Actual Rate.
- Confirm is an action; Finalized is 已完成最终结算. Correction/更正 preserves
  history; Restore/恢复 is different. No lifecycle/mutation rule changes.

## Final owner decisions and concept limits

- Owner → 所有者 primarily describes domain/legacy ownership. No new product
  role/label is added merely to fill the catalog; Organizer remains 组织者.
- Traveller → 旅行成员 is the preferred generic label. Sharing Chinese characters
  with 成员 does not merge Traveller wording with Journey membership, authenticated
  User or Expense participation.
- Journey Value → 行程币种金额 is the Expense amount expressed in Journey
  Currency. It may result from reference-rate, agreed-rate, actual payer-cost
  evidence or same-currency valuation. It is not generally 行程估值 and does not
  inherently mean a provisional estimate. Use 预估 only for a particular genuinely
  provisional/estimated value; no valuation policy or calculation changes.
- Actual Rate is not a canonical product term. Actual payer cost remains
  实际付款金额, an amount/cost, not a rate. Any future explicitly displayed derived
  effective rate needs a separately approved precise term.
- Final has no standalone canonical Chinese lifecycle label or new state.
  Translate contextually: final amounts → 最终金额; final settlement → 最终结算.
  Finalized remains 已完成最终结算.

No material core owner-review terminology decisions remain after these directions.
Absence of a standalone catalog Owner/User/Creator label does not establish a
visible translation defect; do not invent product UI, states or domain identifiers.

## Guard and exceptions

Runnable validation checks catalog parity/parameters and obvious canonical conflicts
where English identifies the concept. It does not inspect user data or reject unrelated
Chinese prose globally. Account Active, Today, generic checks and explicit Split method
phrasing remain allowed. Any bypass must name one exact key, English context and a
rationale; no whole-namespace allowance or new terminology baseline. No CI claim.

Current exact-key exceptions:

| Key                     | Rule    | Rationale                                                        |
| ----------------------- | ------- | ---------------------------------------------------------------- |
| health.idle             | review  | Account data health inspection; not Review workflow.             |
| ui.checkTheReviewFields | review  | 检查 is the imperative; 审核 names the fields.                   |
| reviewFlow.label20      | expense | 支出 names Expense; 同一笔消费 describes Spending counted twice. |

Terminology gate accepted; owner authorized Phase D and confirmed its device
visual gate PASS on 2026-10-03. Future user-facing copy must follow this glossary.
