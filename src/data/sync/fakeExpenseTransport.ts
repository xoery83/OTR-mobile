import type { ExpenseCreateTransport } from "./expenseSyncWorker";

export type FakeExpenseTransport = ExpenseCreateTransport & {
  failNextCreate(): void;
};

export function createFakeExpenseTransport(): FakeExpenseTransport {
  let shouldFailNextCreate = false;

  return {
    failNextCreate() {
      shouldFailNextCreate = true;
    },

    async createExpense({ expense }) {
      if (shouldFailNextCreate) {
        shouldFailNextCreate = false;
        throw new Error("Phase 2A fake transport failure.");
      }

      return { serverId: `fake_server_${expense.id}` };
    },
  };
}
