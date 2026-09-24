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
  {
    id: 10,
    name: "ledger_2_stage_5_2_receipt_assets",
    sql: `
      CREATE TABLE ledger_receipt_assets (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        journey_id TEXT NOT NULL,
        expense_id TEXT,
        local_uri TEXT,
        mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
        sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
        object_path TEXT,
        upload_status TEXT NOT NULL CHECK (upload_status IN ('PENDING', 'UPLOADING', 'UPLOADED', 'FAILED')),
        ocr_status TEXT NOT NULL CHECK (ocr_status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
        ocr_suggestion_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX ledger_receipt_assets_journey_expense
        ON ledger_receipt_assets (journey_id, expense_id, created_at DESC);

      CREATE TABLE ledger_asset_operations (
        id TEXT PRIMARY KEY NOT NULL,
        journey_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        operation_type TEXT NOT NULL CHECK (operation_type IN ('UPLOAD_RECEIPT', 'OCR_RECEIPT', 'LINK_RECEIPT')),
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'RETRYABLE', 'FAILED', 'COMPLETED')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        last_error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (asset_id, operation_type)
      );
      CREATE INDEX ledger_asset_operations_pending
        ON ledger_asset_operations (status, created_at);
    `,
  },
  {
    id: 11,
    name: "ledger_2_stage_6_reporting",
    sql: `
      ALTER TABLE ledger_journeys ADD COLUMN title TEXT;
      ALTER TABLE ledger_journeys ADD COLUMN start_date TEXT;
      ALTER TABLE ledger_journeys ADD COLUMN end_date TEXT;

      CREATE TABLE ledger_preferences (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        selected_journey_id TEXT,
        updated_at TEXT NOT NULL
      );

      DROP TABLE ledger_my_journey_summaries;
      CREATE TABLE ledger_my_journey_summaries (
        journey_id TEXT NOT NULL,
        period_key TEXT NOT NULL,
        from_at TEXT,
        to_at TEXT,
        title TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        currency TEXT NOT NULL,
        scale INTEGER NOT NULL,
        my_spend_minor INTEGER NOT NULL,
        paid_minor INTEGER NOT NULL,
        position_minor INTEGER NOT NULL,
        unvalued_count INTEGER NOT NULL,
        conflict_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (journey_id, period_key)
      );

      CREATE INDEX ledger_expense_participants_member
        ON ledger_expense_participants (member_id, expense_id);
      CREATE INDEX ledger_receipt_assets_expense
        ON ledger_receipt_assets (expense_id);
    `,
  },
  {
    id: 12,
    name: "ledger_2_stage_7_1_settlement_finalization",
    sql: `
      CREATE TABLE ledger_settlements (
        id TEXT PRIMARY KEY NOT NULL,
        journey_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('FINALIZED', 'SUPERSEDED')),
        through_timestamp TEXT NOT NULL,
        settlement_currency TEXT NOT NULL,
        settlement_scale INTEGER NOT NULL,
        settings_revision INTEGER NOT NULL,
        algorithm_version TEXT NOT NULL,
        input_digest TEXT NOT NULL,
        revision INTEGER NOT NULL,
        finalized_by TEXT NOT NULL,
        finalized_at TEXT NOT NULL,
        UNIQUE (journey_id, input_digest)
      );
      CREATE INDEX ledger_settlements_journey_finalized
        ON ledger_settlements (journey_id, finalized_at DESC);

      CREATE TABLE ledger_settlement_inputs (
        settlement_id TEXT NOT NULL,
        expense_id TEXT NOT NULL,
        expense_revision INTEGER NOT NULL,
        normalized_snapshot_json TEXT NOT NULL,
        PRIMARY KEY (settlement_id, expense_id)
      );

      CREATE TABLE ledger_settlement_member_balances (
        settlement_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        display_name_snapshot TEXT NOT NULL,
        paid_minor INTEGER NOT NULL,
        owed_minor INTEGER NOT NULL,
        transferred_minor INTEGER NOT NULL,
        net_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        scale INTEGER NOT NULL,
        PRIMARY KEY (settlement_id, member_id)
      );

      CREATE TABLE ledger_settlement_transfers (
        id TEXT PRIMARY KEY NOT NULL,
        settlement_id TEXT NOT NULL,
        from_member_id TEXT NOT NULL,
        to_member_id TEXT NOT NULL,
        obligation_amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        scale INTEGER NOT NULL,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL
      );
      CREATE INDEX ledger_settlement_transfers_settlement
        ON ledger_settlement_transfers (settlement_id, id);

      CREATE TABLE ledger_settlement_audit_events (
        id TEXT PRIMARY KEY NOT NULL,
        settlement_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        actor_user_id TEXT NOT NULL,
        actor_member_id TEXT NOT NULL,
        reason TEXT,
        settlement_revision INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX ledger_settlement_audit_events_settlement
        ON ledger_settlement_audit_events (settlement_id, settlement_revision, created_at);
    `,
  },
  {
    id: 13,
    name: "ledger_2_stage_7_2a_payment_lifecycle",
    sql: `
      ALTER TABLE ledger_settlements RENAME TO ledger_settlements_v12;
      CREATE TABLE ledger_settlements (
        id TEXT PRIMARY KEY NOT NULL,
        journey_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (
          status IN ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED', 'SUPERSEDED')
        ),
        through_timestamp TEXT NOT NULL,
        settlement_currency TEXT NOT NULL,
        settlement_scale INTEGER NOT NULL,
        settings_revision INTEGER NOT NULL,
        algorithm_version TEXT NOT NULL,
        input_digest TEXT NOT NULL,
        revision INTEGER NOT NULL,
        finalized_by TEXT NOT NULL,
        finalized_at TEXT NOT NULL,
        UNIQUE (journey_id, input_digest)
      );
      INSERT INTO ledger_settlements SELECT * FROM ledger_settlements_v12;
      DROP TABLE ledger_settlements_v12;
      CREATE INDEX ledger_settlements_journey_finalized
        ON ledger_settlements (journey_id, finalized_at DESC);

      CREATE TABLE ledger_repayment_valuation_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        transfer_id TEXT NOT NULL,
        decimal_rate TEXT NOT NULL,
        source TEXT NOT NULL,
        source_label TEXT NOT NULL,
        effective_at TEXT NOT NULL,
        reason TEXT
      );

      CREATE TABLE ledger_settlement_payments (
        id TEXT PRIMARY KEY NOT NULL,
        transfer_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN (
          'AWAITING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'DISPUTED', 'CORRECTED'
        )),
        payment_amount_minor INTEGER NOT NULL,
        payment_currency TEXT NOT NULL,
        payment_scale INTEGER NOT NULL,
        asserted_discharge_minor INTEGER NOT NULL,
        settlement_currency TEXT NOT NULL,
        settlement_scale INTEGER NOT NULL,
        repayment_valuation_snapshot_id TEXT,
        fee_amount_minor INTEGER,
        fee_currency TEXT,
        fee_scale INTEGER,
        fee_borne_by TEXT,
        reported_by_user_id TEXT,
        reported_by_member_id TEXT,
        reporting_authority TEXT NOT NULL,
        reporting_reason TEXT,
        paid_at TEXT NOT NULL,
        evidence_asset_id TEXT,
        notes TEXT,
        supersedes_payment_id TEXT,
        revision INTEGER NOT NULL,
        sync_status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX ledger_settlement_payments_transfer
        ON ledger_settlement_payments (transfer_id, created_at, id);

      CREATE TABLE ledger_settlement_payment_discharges (
        id TEXT PRIMARY KEY NOT NULL,
        payment_id TEXT NOT NULL UNIQUE,
        amount_minor INTEGER NOT NULL,
        settlement_currency TEXT NOT NULL,
        settlement_scale INTEGER NOT NULL,
        confirmation_authority TEXT NOT NULL,
        confirmed_by_user_id TEXT NOT NULL,
        confirmed_by_member_id TEXT NOT NULL,
        reason TEXT,
        confirmed_at TEXT NOT NULL
      );

      ALTER TABLE ledger_settlement_audit_events ADD COLUMN transfer_id TEXT;
      ALTER TABLE ledger_settlement_audit_events ADD COLUMN payment_id TEXT;
      ALTER TABLE ledger_settlement_audit_events ADD COLUMN discharge_id TEXT;
      ALTER TABLE ledger_settlement_audit_events ADD COLUMN authority TEXT;
      ALTER TABLE ledger_actor_context ADD COLUMN user_id TEXT;
    `,
  },
  {
    id: 14,
    name: "ledger_2_stage_7_2b_settlement_adjustments",
    sql: `
      ALTER TABLE ledger_settlements RENAME TO ledger_settlements_v13;
      CREATE TABLE ledger_settlements (
        id TEXT PRIMARY KEY NOT NULL,
        journey_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (
          status IN ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED', 'SUPERSEDED')
        ),
        through_timestamp TEXT NOT NULL,
        settlement_currency TEXT NOT NULL,
        settlement_scale INTEGER NOT NULL,
        settings_revision INTEGER NOT NULL,
        algorithm_version TEXT NOT NULL,
        input_digest TEXT NOT NULL,
        revision INTEGER NOT NULL,
        finalized_by TEXT NOT NULL,
        finalized_at TEXT NOT NULL,
        settlement_kind TEXT NOT NULL DEFAULT 'ROOT',
        root_settlement_id TEXT,
        parent_adjustment_id TEXT,
        lineage_sequence INTEGER NOT NULL DEFAULT 0,
        prior_input_digest TEXT,
        adjustment_reason TEXT,
        eligibility_version TEXT NOT NULL DEFAULT 'ledger-settlement-eligibility-v1',
        adjustment_state TEXT,
        lineage_head_id TEXT,
        outstanding_balances_json TEXT
      );
      INSERT INTO ledger_settlements (
        id, journey_id, status, through_timestamp, settlement_currency,
        settlement_scale, settings_revision, algorithm_version, input_digest,
        revision, finalized_by, finalized_at
      ) SELECT
        id, journey_id, status, through_timestamp, settlement_currency,
        settlement_scale, settings_revision, algorithm_version, input_digest,
        revision, finalized_by, finalized_at
      FROM ledger_settlements_v13;
      DROP TABLE ledger_settlements_v13;
      CREATE INDEX ledger_settlements_journey_finalized
        ON ledger_settlements (journey_id, finalized_at DESC);
      CREATE UNIQUE INDEX ledger_settlement_root_per_journey
        ON ledger_settlements (journey_id)
        WHERE settlement_kind = 'ROOT' AND status <> 'SUPERSEDED';
      CREATE UNIQUE INDEX ledger_settlement_adjustment_sequence
        ON ledger_settlements (root_settlement_id, lineage_sequence)
        WHERE settlement_kind = 'ADJUSTMENT';

      CREATE TABLE ledger_settlement_adjustment_deltas (
        settlement_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        display_name_snapshot TEXT NOT NULL,
        delta_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        scale INTEGER NOT NULL,
        PRIMARY KEY (settlement_id, member_id)
      );
    `,
  },
  {
    id: 15,
    name: "ledger_2_stage_7_3_export_manifest",
    sql: `
      CREATE TABLE ledger_settlement_exports (
        statement_digest TEXT NOT NULL,
        journey_id TEXT NOT NULL,
        root_settlement_id TEXT NOT NULL,
        head_settlement_id TEXT NOT NULL,
        export_schema_version INTEGER NOT NULL,
        privacy_mode TEXT NOT NULL CHECK (privacy_mode IN ('MEMBER', 'DE_IDENTIFIED')),
        format TEXT NOT NULL CHECK (format IN ('PDF', 'CSV')),
        file_uri TEXT NOT NULL,
        file_sha256 TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        PRIMARY KEY (statement_digest, privacy_mode, format)
      );
      CREATE INDEX ledger_settlement_exports_journey_generated
        ON ledger_settlement_exports (journey_id, generated_at DESC);
    `,
  },
  {
    id: 16,
    name: "ledger_2_stage_8_review_and_operations",
    sql: `
      ALTER TABLE sync_operations ADD COLUMN claim_owner TEXT;
      ALTER TABLE sync_operations ADD COLUMN lease_expires_at TEXT;
      ALTER TABLE ledger_asset_operations ADD COLUMN claim_owner TEXT;
      ALTER TABLE ledger_asset_operations ADD COLUMN lease_expires_at TEXT;

      CREATE TABLE ledger_review_findings (
        id TEXT PRIMARY KEY NOT NULL,
        journey_id TEXT NOT NULL,
        expense_id TEXT,
        settlement_id TEXT,
        layer TEXT NOT NULL CHECK (layer IN ('DETERMINISTIC', 'HEURISTIC')),
        finding_type TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'BLOCKING')),
        confidence REAL,
        evidence_codes_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'RESOLVED', 'STALE')),
        ruleset_version TEXT NOT NULL,
        entity_revision INTEGER,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX ledger_review_findings_journey_status
        ON ledger_review_findings (journey_id, status, severity, updated_at DESC);

      CREATE TABLE ledger_review_finding_actions (
        id TEXT PRIMARY KEY NOT NULL,
        finding_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('ACKNOWLEDGED', 'DISMISSED')),
        actor_user_id TEXT NOT NULL,
        actor_member_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        reason TEXT NOT NULL,
        finding_revision INTEGER NOT NULL,
        entity_revision INTEGER,
        ruleset_version TEXT NOT NULL,
        operation_id TEXT NOT NULL UNIQUE,
        sync_status TEXT NOT NULL CHECK (sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX ledger_review_actions_finding
        ON ledger_review_finding_actions (finding_id, created_at);
    `,
  },
  {
    id: 17,
    name: "ledger_2_settlement_participation",
    sql: `
      ALTER TABLE ledger_expenses ADD COLUMN settlement_participation TEXT NOT NULL
        DEFAULT 'INCLUDED' CHECK (settlement_participation IN ('INCLUDED', 'EXCLUDED'));
    `,
  },
  {
    id: 18,
    name: "ledger_ui_preferences",
    sql: `
      ALTER TABLE ledger_preferences ADD COLUMN default_currency TEXT NOT NULL DEFAULT 'NZD';
      ALTER TABLE ledger_preferences ADD COLUMN debug_mode INTEGER NOT NULL DEFAULT 0
        CHECK (debug_mode IN (0, 1));
    `,
  },
  {
    id: 19,
    name: "account_switching_local_isolation",
    sql: `
      ALTER TABLE ledger_actor_context RENAME TO ledger_actor_context_v18;
      CREATE TABLE ledger_actor_context (
        user_id TEXT,
        journey_id TEXT NOT NULL,
        member_id TEXT,
        role TEXT,
        capabilities_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, journey_id)
      );
      INSERT INTO ledger_actor_context (
        user_id, journey_id, member_id, role, capabilities_json, updated_at
      ) SELECT user_id, journey_id, member_id, role, capabilities_json, updated_at
        FROM ledger_actor_context_v18;
      DROP TABLE ledger_actor_context_v18;
      CREATE INDEX ledger_actor_context_journey
        ON ledger_actor_context (journey_id, user_id);

      ALTER TABLE ledger_my_journey_summaries
        RENAME TO ledger_my_journey_summaries_v18;
      CREATE TABLE ledger_my_journey_summaries (
        user_id TEXT,
        journey_id TEXT NOT NULL,
        period_key TEXT NOT NULL,
        from_at TEXT,
        to_at TEXT,
        title TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        currency TEXT NOT NULL,
        scale INTEGER NOT NULL,
        my_spend_minor INTEGER NOT NULL,
        paid_minor INTEGER NOT NULL,
        position_minor INTEGER NOT NULL,
        unvalued_count INTEGER NOT NULL,
        conflict_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, journey_id, period_key)
      );
      INSERT INTO ledger_my_journey_summaries (
        user_id, journey_id, period_key, from_at, to_at, title, start_date,
        end_date, currency, scale, my_spend_minor, paid_minor, position_minor,
        unvalued_count, conflict_count, updated_at
      ) SELECT NULL, journey_id, period_key, from_at, to_at, title, start_date,
        end_date, currency, scale, my_spend_minor, paid_minor, position_minor,
        unvalued_count, conflict_count, updated_at
        FROM ledger_my_journey_summaries_v18;
      DROP TABLE ledger_my_journey_summaries_v18;
      CREATE INDEX ledger_my_journey_summaries_user_period
        ON ledger_my_journey_summaries (user_id, period_key, updated_at DESC);

      ALTER TABLE ledger_sync_cursors RENAME TO ledger_sync_cursors_v18;
      CREATE TABLE ledger_sync_cursors (
        user_id TEXT,
        journey_id TEXT NOT NULL,
        cursor TEXT,
        server_time TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, journey_id)
      );
      INSERT INTO ledger_sync_cursors (
        user_id, journey_id, cursor, server_time, updated_at
      ) SELECT NULL, journey_id, cursor, server_time, updated_at
        FROM ledger_sync_cursors_v18;
      DROP TABLE ledger_sync_cursors_v18;

      ALTER TABLE sync_operations ADD COLUMN owner_user_id TEXT;
      CREATE INDEX sync_operations_owner_pending
        ON sync_operations (owner_user_id, status, next_attempt_at, created_at);

      ALTER TABLE ledger_asset_operations ADD COLUMN owner_user_id TEXT;
      CREATE INDEX ledger_asset_operations_owner_pending
        ON ledger_asset_operations (owner_user_id, status, next_attempt_at, created_at);

      CREATE TABLE account_local_state (
        user_id TEXT PRIMARY KEY NOT NULL,
        selected_journey_id TEXT,
        default_currency TEXT NOT NULL DEFAULT 'NZD',
        updated_at TEXT NOT NULL
      );

      ALTER TABLE ledger_expenses ADD COLUMN local_owner_user_id TEXT;
      ALTER TABLE expenses ADD COLUMN local_owner_user_id TEXT;
      ALTER TABLE itinerary_items ADD COLUMN local_owner_user_id TEXT;
      ALTER TABLE ledger_receipt_assets ADD COLUMN local_owner_user_id TEXT;
    `,
  },
  {
    id: 20,
    name: "ledger_review_v2_engine_foundation",
    sql: `
      ALTER TABLE ledger_review_findings ADD COLUMN rule_id TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN rule_version INTEGER;
      ALTER TABLE ledger_review_findings ADD COLUMN rule_category TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN rule_input_fingerprint TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN comparison_fingerprint TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN observation_context_json TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN lifecycle TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN observation_generation INTEGER;
      ALTER TABLE ledger_review_findings ADD COLUMN resolved_at TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN resolution_reason TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN superseded_at TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN superseded_by_finding_id TEXT;
      CREATE INDEX ledger_review_v2_active ON ledger_review_findings
        (journey_id, lifecycle, rule_id);
    `,
  },
  {
    id: 21,
    name: "ledger_review_v2_personal_decisions",
    sql: `
      CREATE TABLE ledger_review_visibility (
        user_id TEXT NOT NULL,
        finding_id TEXT NOT NULL,
        journey_id TEXT NOT NULL,
        PRIMARY KEY (user_id, finding_id)
      );
      CREATE INDEX ledger_review_visibility_journey ON ledger_review_visibility
        (user_id, journey_id);
      CREATE TABLE ledger_review_decisions (
        user_id TEXT NOT NULL,
        finding_id TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('ACKNOWLEDGED', 'DISMISSED')),
        revision INTEGER NOT NULL CHECK (revision >= 0),
        last_action_id TEXT,
        acted_at TEXT,
        PRIMARY KEY (user_id, finding_id)
      );
      INSERT OR IGNORE INTO ledger_review_decisions
        (user_id, finding_id, decision, revision, last_action_id, acted_at)
      SELECT actor_user_id, finding_id, action, 1, id, created_at
      FROM ledger_review_finding_actions
      WHERE sync_status = 'PENDING';
    `,
  },
  {
    id: 22,
    name: "ledger_expense_economic_date",
    sql: `
      ALTER TABLE ledger_expenses ADD COLUMN economic_date TEXT
        CHECK (economic_date IS NULL OR
          (economic_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND
           date(economic_date) = economic_date));
    `,
  },
  {
    id: 23,
    name: "ledger_historical_rate_candidates",
    sql: `
      ALTER TABLE ledger_rate_quotes ADD COLUMN economic_date TEXT;
      ALTER TABLE ledger_rate_quotes ADD COLUMN reference_date TEXT;
      ALTER TABLE ledger_rate_quotes ADD COLUMN policy_version TEXT;
      ALTER TABLE ledger_rate_quotes ADD COLUMN source_reference TEXT;
      CREATE INDEX ledger_rate_quotes_b2_lookup ON ledger_rate_quotes
        (journey_id, economic_date, quote_currency, base_currency, policy_version);
    `,
  },
  {
    id: 24,
    name: "ledger_accepted_reference_provenance",
    sql: `ALTER TABLE ledger_valuation_snapshots ADD COLUMN reference_evidence_json TEXT;`,
  },
  {
    id: 25,
    name: "settlement_2_personal_payment_local_foundation",
    sql: `
      CREATE TABLE ledger_personal_payment_records (
        id TEXT NOT NULL,
        projection_user_id TEXT NOT NULL,
        journey_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        owner_member_id TEXT NOT NULL,
        counterparty_member_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('PAID', 'RECEIVED')),
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        currency TEXT NOT NULL,
        scale INTEGER NOT NULL CHECK (scale BETWEEN 0 AND 4),
        occurred_at TEXT NOT NULL,
        note TEXT,
        recorded_equivalent_minor INTEGER,
        recorded_equivalent_currency TEXT,
        recorded_equivalent_scale INTEGER,
        reference_rate_decimal TEXT,
        reference_rate_date TEXT,
        reference_source TEXT,
        reference_provenance_json TEXT,
        server_revision INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL CHECK (sync_status IN (
          'SYNCED', 'PENDING_CREATE', 'PENDING_UPDATE', 'PENDING_DELETE',
          'SYNCING', 'CONFLICT', 'FAILED'
        )),
        last_synced_at TEXT,
        last_error_code TEXT,
        CHECK (
          (recorded_equivalent_minor IS NULL AND recorded_equivalent_currency IS NULL
            AND recorded_equivalent_scale IS NULL) OR
          (recorded_equivalent_minor > 0 AND recorded_equivalent_currency IS NOT NULL
            AND recorded_equivalent_scale BETWEEN 0 AND 4)
        ),
        PRIMARY KEY (projection_user_id, id)
      );
      CREATE INDEX ledger_personal_payments_owner_journey_occurred
        ON ledger_personal_payment_records
        (projection_user_id, journey_id, occurred_at DESC, id);
      CREATE INDEX ledger_personal_payments_owner_sync
        ON ledger_personal_payment_records
        (projection_user_id, sync_status, updated_at DESC);

      CREATE TABLE ledger_personal_payment_sync_cursors (
        user_id TEXT NOT NULL,
        journey_id TEXT NOT NULL,
        cursor TEXT,
        server_time TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, journey_id)
      );
    `,
  },
  {
    id: 26,
    name: "settlement_2_personal_payment_evidence",
    sql: `
      ALTER TABLE ledger_receipt_assets ADD COLUMN personal_payment_id TEXT;
      ALTER TABLE ledger_receipt_assets ADD COLUMN personal_payment_link_status TEXT
        CHECK (personal_payment_link_status IN ('ACTIVE', 'DELETE_PENDING'));
      CREATE INDEX ledger_receipt_assets_personal_payment
        ON ledger_receipt_assets (personal_payment_id, created_at DESC);
    `,
  },
  {
    id: 27,
    name: "settlement_2_human_review_findings",
    sql: `
      ALTER TABLE ledger_review_findings ADD COLUMN origin TEXT NOT NULL DEFAULT 'SYSTEM';
      ALTER TABLE ledger_review_findings ADD COLUMN author_user_id TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN author_member_id TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN target_type TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN target_member_id TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN personal_payment_id TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN target_source_revision INTEGER;
      ALTER TABLE ledger_review_findings ADD COLUMN human_note TEXT;
      ALTER TABLE ledger_review_findings ADD COLUMN origin_operation_id TEXT;
      CREATE INDEX ledger_review_human_target ON ledger_review_findings
        (journey_id, origin, target_type, expense_id, personal_payment_id);
    `,
  },
  {
    id: 28,
    name: "settlement_2_personal_review_checkpoint",
    sql: `
      CREATE TABLE ledger_personal_settlement_review_state (
        user_id TEXT NOT NULL,
        journey_id TEXT NOT NULL,
        statement_json TEXT NOT NULL,
        statement_fingerprint TEXT NOT NULL,
        checkpoint_json TEXT,
        delta_json TEXT,
        sync_status TEXT NOT NULL CHECK (sync_status IN (
          'SYNCED', 'PENDING', 'SYNCING', 'CONFLICT', 'FAILED'
        )),
        pending_operation_id TEXT,
        last_error_code TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, journey_id)
      );
    `,
  },
  {
    id: 29,
    name: "settlement_2_review_coverage_cache",
    sql: `ALTER TABLE ledger_personal_settlement_review_state
      ADD COLUMN coverage_json TEXT NOT NULL DEFAULT '[]';`,
  },
  {
    id: 30,
    name: "settlement_2_correction_version_lineage",
    sql: `
      ALTER TABLE ledger_settlements ADD COLUMN correction_source_expense_id TEXT;
      ALTER TABLE ledger_settlements ADD COLUMN correction_successor_expense_id TEXT;
    `,
  },
  {
    id: 31,
    name: "settlement_review_three_state",
    sql: `ALTER TABLE ledger_personal_settlement_review_state
      ADD COLUMN pending_review_state TEXT CHECK (
        pending_review_state IN ('LOOKS_GOOD', 'STILL_CHECKING')
      );`,
  },
  {
    id: 32,
    name: "ledger_fx_reference_snapshot_cache",
    sql: `
      CREATE TABLE ledger_fx_reference_snapshots (
        account_id TEXT NOT NULL,
        provider TEXT NOT NULL CHECK (provider = 'ECB'),
        policy_version TEXT NOT NULL,
        reference_date TEXT NOT NULL,
        base_currency TEXT NOT NULL CHECK (base_currency = 'EUR'),
        rates_json TEXT NOT NULL,
        source_reference TEXT NOT NULL,
        provider_reference TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (account_id, provider, policy_version, reference_date)
      );
      CREATE INDEX ledger_fx_reference_snapshots_lookup
        ON ledger_fx_reference_snapshots (
          account_id, provider, policy_version, reference_date DESC
        );
    `,
  },
  {
    id: 33,
    name: "personal_payment_fx_projections",
    sql: `
      ALTER TABLE ledger_personal_payment_records ADD COLUMN economic_date TEXT;
      UPDATE ledger_personal_payment_records
      SET economic_date = date(occurred_at)
      WHERE economic_date IS NULL;
      CREATE TABLE ledger_personal_payment_fx_projections (
        projection_user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        payment_id TEXT NOT NULL,
        journey_id TEXT NOT NULL,
        target_currency TEXT NOT NULL,
        target_scale INTEGER NOT NULL,
        policy_version TEXT NOT NULL,
        source_payment_revision INTEGER NOT NULL,
        input_digest TEXT NOT NULL,
        economic_date TEXT NOT NULL,
        original_amount_minor INTEGER NOT NULL,
        original_currency TEXT NOT NULL,
        original_scale INTEGER NOT NULL,
        state TEXT NOT NULL,
        equivalent_minor INTEGER,
        decimal_rate TEXT,
        rate_quote_id TEXT,
        reference_date TEXT,
        provider TEXT,
        provider_reference TEXT,
        source_reference TEXT,
        failure_category TEXT,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (projection_user_id, id),
        UNIQUE (projection_user_id, payment_id, target_currency, policy_version)
      );
      CREATE INDEX ledger_personal_payment_fx_projection_lookup
        ON ledger_personal_payment_fx_projections
        (projection_user_id, journey_id, payment_id, target_currency, policy_version);
    `,
  },
  {
    id: 34,
    name: "personal_payment_economic_date_provenance",
    sql: `
      ALTER TABLE ledger_personal_payment_records ADD COLUMN economic_date_source TEXT
        CHECK (economic_date_source IS NULL OR economic_date_source IN (
          'EXPLICIT', 'LEGACY_DERIVED_UTC'
        ));
    `,
  },
  {
    id: 35,
    name: "data_health_phase_a_failure_fidelity",
    sql: `
      ALTER TABLE sync_operations ADD COLUMN failure_category TEXT;
      ALTER TABLE sync_operations ADD COLUMN last_attempt_at TEXT;
      ALTER TABLE sync_operations ADD COLUMN first_failed_at TEXT;
      ALTER TABLE sync_operations ADD COLUMN dependency_operation_id TEXT;
      ALTER TABLE sync_operations ADD COLUMN last_request_id TEXT;
      CREATE INDEX sync_operations_owner_due ON sync_operations
        (owner_user_id, status, next_attempt_at, created_at);
      CREATE INDEX sync_operations_entity_causal ON sync_operations
        (owner_user_id, entity_type, entity_id, created_at);
      CREATE INDEX sync_operations_dependency ON sync_operations
        (owner_user_id, dependency_operation_id, status);
      CREATE INDEX sync_operations_long_lived_failure ON sync_operations
        (owner_user_id, failure_category, first_failed_at, status);

      ALTER TABLE ledger_asset_operations ADD COLUMN failure_category TEXT;
      ALTER TABLE ledger_asset_operations ADD COLUMN last_error_message TEXT;
      ALTER TABLE ledger_asset_operations ADD COLUMN last_attempt_at TEXT;
      ALTER TABLE ledger_asset_operations ADD COLUMN first_failed_at TEXT;
      ALTER TABLE ledger_asset_operations ADD COLUMN dependency_operation_id TEXT;
      ALTER TABLE ledger_asset_operations ADD COLUMN last_request_id TEXT;
      CREATE INDEX ledger_asset_operations_dependency ON ledger_asset_operations
        (owner_user_id, dependency_operation_id, status);
      CREATE INDEX ledger_asset_operations_long_lived_failure ON ledger_asset_operations
        (owner_user_id, failure_category, first_failed_at, status);

      UPDATE sync_operations SET next_attempt_at = NULL
      WHERE status = 'RETRYABLE'
        AND failure_category IN ('UNKNOWN', 'RESPONSE_INVALID');
      UPDATE ledger_asset_operations SET next_attempt_at = NULL
      WHERE status = 'RETRYABLE'
        AND failure_category IN ('UNKNOWN', 'RESPONSE_INVALID');
    `,
  },
];
