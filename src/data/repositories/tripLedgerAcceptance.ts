import type { LedgerReadDatabase } from "./ledgerReadRepository";

// Called only inside the owning Trip receipt transaction, before queue completion.
export async function mapLocalTripLedgerPerson(
  database: LedgerReadDatabase,
  accountId: string,
  tripId: string,
  operationId: string,
  ownerPersonId: string,
) {
  const binding = await database.getFirstAsync<{ person_id: string }>(
    "SELECT person_id FROM local_trip_ledger_bindings WHERE account_id=? AND trip_id=? AND create_operation_id=? AND authority='LOCAL_CREATOR'",
    accountId,
    tripId,
    operationId,
  );
  if (!binding) throw new Error("TRIP_LEDGER_LOCAL_BINDING_MISSING");
  const localPersonId = binding.person_id;
  const unsafe = await database.getFirstAsync<{ found: number }>(
    `SELECT 1 AS found WHERE
      EXISTS (SELECT 1 FROM ledger_expenses WHERE journey_id=?
        AND (server_id IS NOT NULL OR server_revision<>0 OR local_owner_user_id IS NOT ?))
      OR EXISTS (SELECT 1 FROM ledger_expense_commands command
        JOIN ledger_expenses expense ON expense.id=command.expense_id
        WHERE expense.journey_id=? AND (command.account_id<>? OR command.bound_request_json IS NOT NULL OR command.observed_server_revision<>0))
      OR EXISTS (SELECT 1 FROM sync_operations WHERE trip_id=? AND entity_type LIKE 'ledger_%'
        AND (owner_user_id<>? OR entity_type<>'ledger_expense' OR attempt_count<>0 OR status<>'DEPENDENCY_BLOCKED'))
      OR EXISTS (SELECT 1 FROM ledger_settlements WHERE journey_id=?)
      OR EXISTS (SELECT 1 FROM ledger_personal_payment_records WHERE journey_id=?)
      OR EXISTS (SELECT 1 FROM ledger_actor_context WHERE journey_id=?
        AND (user_id IS NOT ? OR member_id IS NULL OR member_id NOT IN (?,?)))`,
    tripId,
    accountId,
    tripId,
    accountId,
    tripId,
    accountId,
    tripId,
    tripId,
    tripId,
    accountId,
    localPersonId,
    ownerPersonId,
  );
  if (unsafe) throw new Error("TRIP_LEDGER_MAPPING_REQUIRES_REVIEW");
  const local = await database.getFirstAsync<{ id: string }>(
    "SELECT id FROM ledger_members WHERE id=? AND journey_id=? AND status='local' AND participation_revision IS NULL",
    localPersonId,
    tripId,
  );
  const existing = await database.getFirstAsync<{ journey_id: string; status: string }>(
    "SELECT journey_id,status FROM ledger_members WHERE id=? AND id<>?",
    ownerPersonId,
    localPersonId,
  );
  if (
    !local ||
    (existing && (existing.journey_id !== tripId || existing.status !== "linked"))
  )
    throw new Error("TRIP_LEDGER_PERSON_MAPPING_MISMATCH");
  if (localPersonId === ownerPersonId) return;
  const mapJson = (text: string) =>
    JSON.stringify(
      JSON.parse(text, (key, value) =>
        ["memberId", "payerMemberId", "creatorMemberId"].includes(key) &&
        value === localPersonId
          ? ownerPersonId
          : value,
      ),
    );
  const operations = await database.getAllAsync<{ id: string; payload_json: string }>(
    "SELECT id,payload_json FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND entity_type='ledger_expense'",
    accountId,
    tripId,
  );
  for (const operation of operations)
    await database.runAsync(
      "UPDATE sync_operations SET payload_json=? WHERE id=? AND owner_user_id=?",
      mapJson(operation.payload_json),
      operation.id,
      accountId,
    );
  const commands = await database.getAllAsync<{
    operation_id: string;
    intent_json: string;
    projection_json: string;
    observed_base_json: string | null;
  }>(
    `SELECT command.operation_id,command.intent_json,command.projection_json,command.observed_base_json
     FROM ledger_expense_commands command JOIN ledger_expenses expense ON expense.id=command.expense_id
     WHERE command.account_id=? AND expense.journey_id=?`,
    accountId,
    tripId,
  );
  for (const command of commands)
    await database.runAsync(
      "UPDATE ledger_expense_commands SET intent_json=?,projection_json=?,observed_base_json=? WHERE account_id=? AND operation_id=? AND bound_request_json IS NULL",
      mapJson(command.intent_json),
      mapJson(command.projection_json),
      command.observed_base_json ? mapJson(command.observed_base_json) : null,
      accountId,
      command.operation_id,
    );
  await database.runAsync(
    `UPDATE ledger_expenses SET creator_member_id=CASE WHEN creator_member_id=? THEN ? ELSE creator_member_id END,
       payer_member_id=CASE WHEN payer_member_id=? THEN ? ELSE payer_member_id END
     WHERE journey_id=? AND local_owner_user_id=?`,
    localPersonId,
    ownerPersonId,
    localPersonId,
    ownerPersonId,
    tripId,
    accountId,
  );
  for (const table of ["ledger_expense_participants", "ledger_expense_splits"])
    await database.runAsync(
      `UPDATE ${table} SET member_id=? WHERE member_id=? AND expense_id IN (SELECT id FROM ledger_expenses WHERE journey_id=? AND local_owner_user_id=?)`,
      ownerPersonId,
      localPersonId,
      tripId,
      accountId,
    );
  await database.runAsync(
    "UPDATE ledger_payment_records SET payer_member_id=? WHERE payer_member_id=? AND expense_id IN (SELECT id FROM ledger_expenses WHERE journey_id=? AND local_owner_user_id=?)",
    ownerPersonId,
    localPersonId,
    tripId,
    accountId,
  );
  await database.runAsync(
    "UPDATE ledger_household_members SET member_id=? WHERE journey_id=? AND member_id=?",
    ownerPersonId,
    tripId,
    localPersonId,
  );
  await database.runAsync(
    "UPDATE ledger_actor_context SET member_id=? WHERE user_id=? AND journey_id=? AND member_id=?",
    ownerPersonId,
    accountId,
    tripId,
    localPersonId,
  );
  // Original local UUID remains in the binding/audit; owner_person_id records its receipt mapping.
  if (existing)
    // A real bootstrap won the race: retain its member/capabilities, retire only the remapped provisional mirror.
    await database.runAsync(
      "DELETE FROM ledger_members WHERE id=? AND journey_id=? AND status='local'",
      localPersonId,
      tripId,
    );
  else
    await database.runAsync(
      "UPDATE ledger_members SET id=? WHERE id=? AND journey_id=? AND status='local'",
      ownerPersonId,
      localPersonId,
      tripId,
    );
}
