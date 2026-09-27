export const MAX_EXPENSE_ATTACHMENTS = 3;

export function assertExpenseAttachmentDrafts(ids: readonly string[]) {
  if (ids.length > MAX_EXPENSE_ATTACHMENTS)
    throw new Error(`Maximum ${MAX_EXPENSE_ATTACHMENTS} attachments per expense.`);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate attachment draft id.");
}
