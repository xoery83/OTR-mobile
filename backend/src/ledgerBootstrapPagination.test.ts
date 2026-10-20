import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readAllJourneyExpenses } from "./supabaseGateway";

describe("Journey bootstrap pagination", () => {
  it("reads every Expense beyond the PostgREST row cap", async () => {
    const rows = Array.from({ length: 1_203 }, (_, index) => ({ id: String(index) }));
    const service = {
      from: () => ({
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        range(from: number, to: number) {
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      }),
    } as unknown as SupabaseClient;
    const result = await readAllJourneyExpenses(service, "journey");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1_203);
    expect(result.data?.[1_202].id).toBe("1202");
  });
});
