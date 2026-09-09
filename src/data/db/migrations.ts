export type Migration = {
  id: number;
  name: string;
  sql: string;
};

export const migrations: Migration[] = [
  {
    id: 1,
    name: "foundation_sync_tables",
    sql: `
      CREATE TABLE IF NOT EXISTS sync_operations (
        id TEXT PRIMARY KEY NOT NULL,
        trip_id TEXT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        base_version INTEGER,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    id: 2,
    name: "expense_create_vertical_slice",
    sql: `
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        trip_id TEXT NOT NULL,
        title TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        currency_code TEXT NOT NULL,
        paid_by_member_id TEXT,
        occurred_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL,
        sync_version INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS expenses_trip_id_created_at
        ON expenses (trip_id, created_at DESC);
    `,
  },
  {
    id: 3,
    name: "itinerary_create_vertical_slice",
    sql: `
      CREATE TABLE IF NOT EXISTS itinerary_items (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        trip_id TEXT NOT NULL,
        title TEXT NOT NULL,
        scheduled_date TEXT NOT NULL,
        start_time TEXT,
        location TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL,
        sync_version INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS itinerary_items_trip_id_scheduled_date
        ON itinerary_items (trip_id, scheduled_date ASC, created_at ASC);
    `,
  },
  {
    id: 4,
    name: "repair_itinerary_create_vertical_slice",
    sql: `
      CREATE TABLE IF NOT EXISTS itinerary_items (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        trip_id TEXT NOT NULL,
        title TEXT NOT NULL,
        scheduled_date TEXT NOT NULL,
        start_time TEXT,
        location TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL,
        sync_version INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS itinerary_items_trip_id_scheduled_date
        ON itinerary_items (trip_id, scheduled_date ASC, created_at ASC);
    `,
  },
];
