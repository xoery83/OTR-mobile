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
  {
    id: 5,
    name: "ledger_2_local_aggregate_foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS ledger_journeys (
        journey_id TEXT PRIMARY KEY NOT NULL,
        settlement_currency TEXT NOT NULL,
        settlement_scale INTEGER NOT NULL,
        valuation_policy TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_members (
        id TEXT PRIMARY KEY NOT NULL,
        journey_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT,
        status TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE (journey_id, id)
      );

      CREATE TABLE IF NOT EXISTS ledger_households (
        id TEXT PRIMARY KEY NOT NULL,
        journey_id TEXT NOT NULL,
        name TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        UNIQUE (journey_id, name)
      );

      CREATE TABLE IF NOT EXISTS ledger_household_members (
        household_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        journey_id TEXT NOT NULL,
        share_units INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (household_id, member_id)
      );

      CREATE TABLE IF NOT EXISTS ledger_expenses (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        journey_id TEXT NOT NULL,
        creator_member_id TEXT,
        payer_member_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        original_amount_minor INTEGER NOT NULL,
        original_currency TEXT NOT NULL,
        original_scale INTEGER NOT NULL,
        business_status TEXT NOT NULL,
        revision INTEGER NOT NULL,
        server_revision INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        sync_status TEXT NOT NULL,
        last_synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS ledger_expenses_journey_occurred
        ON ledger_expenses (journey_id, occurred_at DESC, id);
      CREATE INDEX IF NOT EXISTS ledger_expenses_journey_sync
        ON ledger_expenses (journey_id, sync_status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS ledger_expense_participants (
        expense_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        display_name_snapshot TEXT NOT NULL,
        household_id_snapshot TEXT,
        display_order INTEGER NOT NULL,
        PRIMARY KEY (expense_id, member_id)
      );

      CREATE TABLE IF NOT EXISTS ledger_expense_splits (
        expense_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        split_method TEXT NOT NULL,
        original_amount_minor INTEGER NOT NULL,
        settlement_amount_minor INTEGER,
        weight_units INTEGER,
        percentage_units INTEGER,
        rounding_adjustment_minor INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (expense_id, member_id)
      );

      CREATE TABLE IF NOT EXISTS ledger_valuation_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        expense_id TEXT NOT NULL,
        expense_revision INTEGER NOT NULL,
        policy TEXT NOT NULL,
        original_amount_minor INTEGER NOT NULL,
        original_currency TEXT NOT NULL,
        original_scale INTEGER NOT NULL,
        settlement_amount_minor INTEGER NOT NULL,
        settlement_currency TEXT NOT NULL,
        settlement_scale INTEGER NOT NULL,
        rate_snapshot_id TEXT,
        payment_record_id TEXT,
        reason TEXT,
        is_active INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ledger_valuation_one_active_per_expense
        ON ledger_valuation_snapshots (expense_id) WHERE is_active = 1;

      CREATE TABLE IF NOT EXISTS ledger_payment_records (
        id TEXT PRIMARY KEY NOT NULL,
        expense_id TEXT NOT NULL,
        instrument_label TEXT,
        authorization_amount_minor INTEGER,
        authorization_currency TEXT,
        authorization_scale INTEGER,
        posted_amount_minor INTEGER,
        posted_currency TEXT,
        posted_scale INTEGER,
        posted_at TEXT,
        fee_amount_minor INTEGER,
        fee_currency TEXT,
        fee_scale INTEGER,
        supersedes_payment_record_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_expense_audit_events (
        id TEXT PRIMARY KEY NOT NULL,
        expense_id TEXT NOT NULL,
        expense_revision INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        reason TEXT,
        after_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (expense_id, expense_revision, event_type)
      );

      CREATE TABLE IF NOT EXISTS ledger_correction_requests (
        id TEXT PRIMARY KEY NOT NULL,
        expense_id TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        proposed_aggregate_json TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_by_member_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_sync_cursors (
        journey_id TEXT PRIMARY KEY NOT NULL,
        cursor TEXT,
        server_time TEXT,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    id: 6,
    name: "ledger_2_stage_3_read_cache",
    sql: `
      CREATE TABLE IF NOT EXISTS ledger_my_journey_summaries (
        journey_id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        reporting_currency TEXT NOT NULL,
        currency TEXT NOT NULL,
        paid_minor INTEGER NOT NULL,
        owed_minor INTEGER NOT NULL,
        receivable_minor INTEGER NOT NULL,
        net_minor INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_deferred_server_changes (
        journey_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (journey_id, entity_type, entity_id, revision)
      );
    `,
  },
  {
    id: 7,
    name: "ledger_2_stage_4b_audit_cache",
    sql: `
      ALTER TABLE ledger_expense_audit_events ADD COLUMN server_id TEXT;
      ALTER TABLE ledger_expense_audit_events ADD COLUMN actor_user_id TEXT;
      ALTER TABLE ledger_expense_audit_events ADD COLUMN actor_member_id TEXT;
      ALTER TABLE ledger_expense_audit_events ADD COLUMN changed_groups_json TEXT;
      CREATE INDEX IF NOT EXISTS ledger_expense_audit_events_expense_revision
        ON ledger_expense_audit_events (expense_id, expense_revision DESC, created_at DESC);
    `,
  },
  {
    id: 8,
    name: "ledger_2_stage_4c_conflicts_and_corrections",
    sql: `
      CREATE TABLE ledger_expense_audit_events_v8 (
        id TEXT PRIMARY KEY NOT NULL,
        expense_id TEXT NOT NULL,
        expense_revision INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        reason TEXT,
        after_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        server_id TEXT,
        actor_user_id TEXT,
        actor_member_id TEXT,
        changed_groups_json TEXT
      );
      INSERT INTO ledger_expense_audit_events_v8
      SELECT id, expense_id, expense_revision, event_type, reason, after_json,
        created_at, server_id, actor_user_id, actor_member_id, changed_groups_json
      FROM ledger_expense_audit_events;
      DROP TABLE ledger_expense_audit_events;
      ALTER TABLE ledger_expense_audit_events_v8 RENAME TO ledger_expense_audit_events;
      CREATE INDEX ledger_expense_audit_events_expense_revision
        ON ledger_expense_audit_events (expense_id, expense_revision DESC, created_at DESC);

      CREATE TABLE ledger_expense_conflicts (
        conflict_id TEXT PRIMARY KEY NOT NULL,
        journey_id TEXT NOT NULL,
        expense_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        current_revision INTEGER NOT NULL,
        base_snapshot_json TEXT NOT NULL,
        submitted_snapshot_json TEXT NOT NULL,
        canonical_snapshot_json TEXT NOT NULL,
        changed_groups_json TEXT NOT NULL,
        audit_summaries_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED', 'SUPERSEDED')),
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX ledger_expense_conflicts_expense_status
        ON ledger_expense_conflicts (expense_id, status, created_at DESC);

      ALTER TABLE ledger_correction_requests ADD COLUMN journey_id TEXT;
      ALTER TABLE ledger_correction_requests ADD COLUMN server_id TEXT;
      ALTER TABLE ledger_correction_requests ADD COLUMN requested_by_user_id TEXT;
      ALTER TABLE ledger_correction_requests ADD COLUMN resolved_by_user_id TEXT;
      ALTER TABLE ledger_correction_requests ADD COLUMN resolved_by_member_id TEXT;
      ALTER TABLE ledger_correction_requests ADD COLUMN resolution_reason TEXT;
      ALTER TABLE ledger_correction_requests ADD COLUMN resulting_expense_revision INTEGER;
      ALTER TABLE ledger_correction_requests ADD COLUMN server_revision INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ledger_correction_requests ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'SYNCED';
      ALTER TABLE ledger_correction_requests ADD COLUMN last_synced_at TEXT;
      CREATE INDEX ledger_correction_requests_expense_status
        ON ledger_correction_requests (expense_id, status, updated_at DESC);

      CREATE TABLE ledger_actor_context (
        journey_id TEXT PRIMARY KEY NOT NULL,
        member_id TEXT,
        role TEXT,
        capabilities_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    id: 9,
    name: "ledger_2_stage_5_1_financial_evidence",
    sql: `
      CREATE TABLE ledger_rate_quotes (
        id TEXT PRIMARY KEY NOT NULL,
        journey_id TEXT NOT NULL,
        quote_currency TEXT NOT NULL,
        base_currency TEXT NOT NULL,
        decimal_rate TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_reference TEXT,
        expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX ledger_rate_quotes_pair_observed
        ON ledger_rate_quotes (journey_id, quote_currency, base_currency, observed_at DESC);

      CREATE TABLE ledger_exchange_rate_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        expense_id TEXT NOT NULL,
        expense_revision INTEGER NOT NULL,
        quote_currency TEXT NOT NULL,
        base_currency TEXT NOT NULL,
        decimal_rate TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_reference TEXT,
        manual_reason TEXT,
        staleness_state TEXT NOT NULL,
        supersedes_rate_snapshot_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX ledger_exchange_rate_snapshots_expense_revision
        ON ledger_exchange_rate_snapshots (expense_id, expense_revision DESC);

      ALTER TABLE ledger_payment_records ADD COLUMN expense_revision INTEGER;
      ALTER TABLE ledger_payment_records ADD COLUMN payer_member_id TEXT;
      ALTER TABLE ledger_payment_records ADD COLUMN authorized_at TEXT;
      ALTER TABLE ledger_payment_records ADD COLUMN bank_fx_rate TEXT;
      ALTER TABLE ledger_payment_records ADD COLUMN source TEXT;
      ALTER TABLE ledger_payment_records ADD COLUMN notes TEXT;
      ALTER TABLE ledger_payment_records ADD COLUMN server_id TEXT;
      ALTER TABLE ledger_payment_records ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE ledger_payment_records ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'SYNCED';
      ALTER TABLE ledger_payment_records ADD COLUMN last_synced_at TEXT;
      CREATE INDEX ledger_payment_records_expense_created
        ON ledger_payment_records (expense_id, created_at ASC);

      ALTER TABLE ledger_valuation_snapshots ADD COLUMN decimal_rate TEXT;
      ALTER TABLE ledger_valuation_snapshots ADD COLUMN server_id TEXT;
      ALTER TABLE ledger_valuation_snapshots ADD COLUMN rounding_mode TEXT NOT NULL DEFAULT 'HALF_UP';
      ALTER TABLE ledger_valuation_snapshots ADD COLUMN effective_at TEXT;
      ALTER TABLE ledger_valuation_snapshots ADD COLUMN supersedes_valuation_id TEXT;
      ALTER TABLE ledger_exchange_rate_snapshots ADD COLUMN server_id TEXT;
    `,
  },
];
