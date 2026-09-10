import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { DevBackendGateway, StoredCreate } from "./app";

const approvedDevProjectRef = "tuqigdxrvrerfewsxqgm";

export type SupabaseDevConfig = {
  url: string;
  publishableKey: string;
  secretKey: string;
};

function assertApprovedDevUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.hostname !== `${approvedDevProjectRef}.supabase.co`) {
    throw new Error("The backend may connect only to the approved Supabase Dev project.");
  }
}

function client(url: string, key: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rowToStoredCreate(row: Record<string, unknown>): StoredCreate {
  return {
    id: String(row.id),
    tripId: String(row.journey_id ?? row.trip_id),
    createdByUserId: String(row.created_by_user_id ?? row.created_by),
    updatedAt: String(row.updated_at),
  };
}

async function requireData<T>(result: {
  data: T | null;
  error: { code?: string } | null;
}) {
  if (result.error || !result.data) throw new Error("Supabase Dev operation failed.");
  return result.data;
}

async function findOne(
  service: SupabaseClient,
  table: "ledger_entries" | "itinerary_events",
  id: string,
) {
  const columns =
    table === "ledger_entries"
      ? "id, journey_id, created_by_user_id, updated_at"
      : "id, trip_id, created_by, updated_at";
  const result = await service.from(table).select(columns).eq("id", id).maybeSingle();
  if (result.error) throw new Error("Supabase Dev lookup failed.");
  return result.data ? rowToStoredCreate(result.data) : null;
}

export function createSupabaseDevGateway(config: SupabaseDevConfig): DevBackendGateway {
  assertApprovedDevUrl(config.url);
  const auth = client(config.url, config.publishableKey);
  const service = client(config.url, config.secretKey);

  return {
    async validateAccessToken(token) {
      const { data, error } = await auth.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },

    async canWriteTrip(userId, tripId) {
      const [creator, legacyMember, journeyMember] = await Promise.all([
        service
          .from("trips")
          .select("id")
          .eq("id", tripId)
          .eq("created_by", userId)
          .limit(1),
        service
          .from("trip_members")
          .select("id")
          .eq("trip_id", tripId)
          .eq("user_id", userId)
          .limit(1),
        service
          .from("journey_members")
          .select("id")
          .eq("trip_id", tripId)
          .eq("user_id", userId)
          .eq("status", "linked")
          .in("role", ["owner", "group_member"])
          .limit(1),
      ]);

      if (creator.error || legacyMember.error || journeyMember.error) {
        throw new Error("Supabase Dev authorization lookup failed.");
      }
      return Boolean(
        creator.data.length || legacyMember.data.length || journeyMember.data.length,
      );
    },

    findExpense(id) {
      return findOne(service, "ledger_entries", id);
    },

    async createExpense(id, tripId, userId, input) {
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
      const amount = (input.amountMinor / 100).toFixed(2);
      const result = await service
        .from("ledger_entries")
        .insert({
          id,
          journey_id: tripId,
          title: input.title,
          expense_date: occurredAt.toISOString().slice(0, 10),
          original_amount: amount,
          original_currency: input.currencyCode,
          base_amount: amount,
          base_currency: input.currencyCode,
          exchange_rate: 1,
          payer_member_id: input.paidByMemberId,
          created_by_user_id: userId,
        })
        .select("id, journey_id, created_by_user_id, updated_at")
        .single();

      if (result.error?.code === "23505") {
        const existing = await findOne(service, "ledger_entries", id);
        if (existing) return existing;
      }
      return rowToStoredCreate(await requireData(result));
    },

    findItineraryItem(id) {
      return findOne(service, "itinerary_events", id);
    },

    async createItineraryItem(id, tripId, userId, input) {
      const time = input.startTime ?? "00:00";
      const result = await service
        .from("itinerary_events")
        .insert({
          id,
          trip_id: tripId,
          title: input.title,
          description: input.notes,
          location_name: input.location,
          location_text: input.location,
          planned_start: `${input.scheduledDate}T${time}:00.000Z`,
          is_estimated_time: input.startTime === null,
          created_by: userId,
        })
        .select("id, trip_id, created_by, updated_at")
        .single();

      if (result.error?.code === "23505") {
        const existing = await findOne(service, "itinerary_events", id);
        if (existing) return existing;
      }
      return rowToStoredCreate(await requireData(result));
    },
  };
}
