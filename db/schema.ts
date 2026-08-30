import { SQLiteDatabase } from 'expo-sqlite';

export async function initDB(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');

  // Fresh schema for V1 offline-first architecture.
  // Tables use TEXT PRIMARY KEY (UUIDs) and include sync metadata.

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users_table (
      id TEXT PRIMARY KEY,
      owner_id TEXT, -- Supabase auth user_id
      name TEXT NOT NULL DEFAULT '',
      pan_number TEXT DEFAULT '',
      client_id TEXT DEFAULT '',
      upi_id TEXT DEFAULT '',
      broker TEXT DEFAULT '',
      tpin TEXT DEFAULT '',
      upi_app TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      default_amount_blocked REAL DEFAULT 0,
      archived INTEGER DEFAULT 0,
      sync_version INTEGER DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ipo_listings (
      id TEXT PRIMARY KEY,
      owner_id TEXT, -- Supabase auth user_id
      ipo_name TEXT NOT NULL DEFAULT '',
      buy_price REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      open_date TEXT DEFAULT '',
      close_date TEXT DEFAULT '',
      listing_date TEXT DEFAULT '',
      archived INTEGER DEFAULT 0,
      registrar TEXT DEFAULT '',
      exchange TEXT DEFAULT '',
      issue_type TEXT DEFAULT '',
      allotment_date TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
      sync_version INTEGER DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ipo_applications (
      id TEXT PRIMARY KEY,
      owner_id TEXT, -- Supabase auth user_id
      user_id TEXT NOT NULL,
      ipo_id TEXT NOT NULL,
      status TEXT DEFAULT 'Applied',
      sell_price REAL,
      sale_date TEXT,
      tax REAL DEFAULT 0,
      user_cut REAL DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      bank_name TEXT DEFAULT '',
      upi_app TEXT DEFAULT '',
      sync_version INTEGER DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users_table(id) ON DELETE CASCADE,
      FOREIGN KEY (ipo_id) REFERENCES ipo_listings(id) ON DELETE CASCADE
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      owner_id TEXT, -- Supabase auth user_id
      bank_name TEXT NOT NULL,
      balance REAL DEFAULT 0,
      sync_version INTEGER DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
      payload TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      next_retry_at TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ipo_allotments (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      ipo_id TEXT NOT NULL,
      allotment_status TEXT NOT NULL,
      allotted_lots INTEGER DEFAULT 0,
      allotted_shares INTEGER DEFAULT 0,
      allotment_price REAL DEFAULT 0,
      application_amount REAL DEFAULT 0,
      refund_amount REAL DEFAULT 0,
      registrar TEXT DEFAULT '',
      verification_method TEXT DEFAULT 'AUTOMATED',
      checked_at TEXT NOT NULL,
      error_code TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES ipo_applications(id) ON DELETE CASCADE
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      ipo_id TEXT,
      application_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT,
      delivered_at TEXT,
      dedupe_key TEXT NOT NULL UNIQUE
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS notification_tracker (
      ipo_id TEXT PRIMARY KEY,
      last_notified_gmp REAL,
      last_notified_radar_category TEXT,
      last_notified_status TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS radar_snapshots (
      id TEXT PRIMARY KEY,
      ipo_id TEXT NOT NULL,
      category TEXT NOT NULL,
      score INTEGER NOT NULL,
      confidence REAL NOT NULL,
      gmp_amount REAL,
      gmp_percent REAL,
      total_subscription REAL,
      retail_subscription REAL,
      qib_subscription REAL,
      nii_subscription REAL,
      quality_score REAL,
      risk_score REAL,
      is_final_pre_listing INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_radar_snapshots_ipo ON radar_snapshots(ipo_id, created_at DESC);
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ipo_outcomes (
      ipo_id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      issue_price REAL NOT NULL,
      listing_price REAL,
      listing_gain_percent REAL,
      listing_date TEXT NOT NULL,
      day_30_price REAL,
      day_30_gain_percent REAL,
      outcome_recorded_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ipo_master (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL DEFAULT '',
      ipo_name TEXT NOT NULL DEFAULT '',
      symbol TEXT DEFAULT '',
      exchange TEXT DEFAULT '',
      issue_type TEXT DEFAULT '',
      price_band_min REAL,
      price_band_max REAL,
      lot_size INTEGER,
      issue_size REAL,
      listing_date TEXT,
      open_date TEXT,
      close_date TEXT,
      allotment_date TEXT,
      refund_date TEXT,
      demat_credit_date TEXT,
      registrar TEXT DEFAULT '',
      lead_manager TEXT DEFAULT '',
      status TEXT DEFAULT 'Unknown',
      lifecycle_status TEXT DEFAULT 'Unknown',
      lifecycle_confidence TEXT DEFAULT 'Low',
      lifecycle_source TEXT DEFAULT '',
      lifecycle_last_verified_at TEXT DEFAULT NULL,
      logo_url TEXT DEFAULT '',
      sector TEXT DEFAULT '',
      description TEXT DEFAULT '',
      website TEXT DEFAULT '',
      prospectus_url TEXT DEFAULT '',
      
      retail_sub REAL,
      qib_sub REAL,
      nii_sub REAL,
      employee_sub REAL,
      shareholder_sub REAL,
      anchor_sub REAL,
      total_sub REAL,
      subscription_timestamp TEXT,
      
      registrar_website TEXT DEFAULT '',
      allotment_link TEXT DEFAULT '',
      
      listing_price REAL,
      listing_gain_percent REAL,
      current_price REAL,
      current_price_updated_at TEXT,
      
      gmp_amount REAL DEFAULT NULL,
      gmp_percent REAL DEFAULT NULL,
      profit_per_lot REAL DEFAULT NULL,
      gmp_updated_at TEXT DEFAULT NULL,

      is_favorite INTEGER DEFAULT 0,
      source_type TEXT DEFAULT 'SERVER',
      sync_version INTEGER DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);

  // ── Schema Migrations for Existing Databases ────────────────────────────────
  const migrations = [
    // users_table migrations
    'ALTER TABLE users_table ADD COLUMN owner_id TEXT',
    'ALTER TABLE users_table ADD COLUMN client_id TEXT DEFAULT ""',
    'ALTER TABLE users_table ADD COLUMN upi_id TEXT DEFAULT ""',
    'ALTER TABLE users_table ADD COLUMN archived INTEGER DEFAULT 0',
    'ALTER TABLE users_table ADD COLUMN sync_version INTEGER DEFAULT 0',
    'ALTER TABLE users_table ADD COLUMN sync_status TEXT DEFAULT "SYNCED"',
    'ALTER TABLE users_table ADD COLUMN last_synced_at TEXT',
    'ALTER TABLE users_table ADD COLUMN created_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE users_table ADD COLUMN updated_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE users_table ADD COLUMN deleted_at TEXT',

    // ipo_listings migrations
    'ALTER TABLE ipo_listings ADD COLUMN owner_id TEXT',
    'ALTER TABLE ipo_listings ADD COLUMN archived INTEGER DEFAULT 0',
    'ALTER TABLE ipo_listings ADD COLUMN registrar TEXT DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN exchange TEXT DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN issue_type TEXT DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN allotment_date TEXT DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN logo_url TEXT DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN is_favorite INTEGER DEFAULT 0',
    'ALTER TABLE ipo_listings ADD COLUMN sync_version INTEGER DEFAULT 0',
    'ALTER TABLE ipo_listings ADD COLUMN sync_status TEXT DEFAULT "SYNCED"',
    'ALTER TABLE ipo_listings ADD COLUMN last_synced_at TEXT',
    'ALTER TABLE ipo_listings ADD COLUMN created_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN updated_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN deleted_at TEXT',

    // ipo_applications migrations
    'ALTER TABLE ipo_applications ADD COLUMN owner_id TEXT',
    'ALTER TABLE ipo_applications ADD COLUMN is_favorite INTEGER DEFAULT 0',
    'ALTER TABLE ipo_applications ADD COLUMN bank_name TEXT DEFAULT ""',
    'ALTER TABLE ipo_applications ADD COLUMN upi_app TEXT DEFAULT ""',
    'ALTER TABLE ipo_applications ADD COLUMN sync_version INTEGER DEFAULT 0',
    'ALTER TABLE ipo_applications ADD COLUMN sync_status TEXT DEFAULT "SYNCED"',
    'ALTER TABLE ipo_applications ADD COLUMN last_synced_at TEXT',
    'ALTER TABLE ipo_applications ADD COLUMN created_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE ipo_applications ADD COLUMN updated_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE ipo_applications ADD COLUMN deleted_at TEXT',

    // bank_accounts migrations
    'ALTER TABLE bank_accounts ADD COLUMN owner_id TEXT',
    'ALTER TABLE bank_accounts ADD COLUMN sync_version INTEGER DEFAULT 0',
    'ALTER TABLE bank_accounts ADD COLUMN sync_status TEXT DEFAULT "SYNCED"',
    'ALTER TABLE bank_accounts ADD COLUMN last_synced_at TEXT',
    'ALTER TABLE bank_accounts ADD COLUMN created_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE bank_accounts ADD COLUMN updated_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE bank_accounts ADD COLUMN deleted_at TEXT',

    // radar_snapshots migrations
    'ALTER TABLE radar_snapshots ADD COLUMN is_final_pre_listing INTEGER DEFAULT 0',

    // ipo_master migrations
    'ALTER TABLE ipo_master ADD COLUMN is_favorite INTEGER DEFAULT 0',
    'ALTER TABLE ipo_master ADD COLUMN source_type TEXT DEFAULT "SERVER"',
    'ALTER TABLE ipo_master ADD COLUMN sync_status TEXT DEFAULT "SYNCED"',
    'ALTER TABLE ipo_master ADD COLUMN last_synced_at TEXT',
    'ALTER TABLE ipo_master ADD COLUMN gmp_amount REAL DEFAULT NULL',
    'ALTER TABLE ipo_master ADD COLUMN gmp_percent REAL DEFAULT NULL',
    'ALTER TABLE ipo_master ADD COLUMN profit_per_lot REAL DEFAULT NULL',
    'ALTER TABLE ipo_master ADD COLUMN gmp_updated_at TEXT DEFAULT NULL',
    'ALTER TABLE ipo_master ADD COLUMN lifecycle_status TEXT DEFAULT "Unknown"',
    'ALTER TABLE ipo_master ADD COLUMN lifecycle_confidence TEXT DEFAULT "Low"',
    'ALTER TABLE ipo_master ADD COLUMN lifecycle_source TEXT DEFAULT ""',
    'ALTER TABLE ipo_master ADD COLUMN lifecycle_last_verified_at TEXT DEFAULT NULL',

    // sync_queue migrations
    'ALTER TABLE sync_queue ADD COLUMN retry_count INTEGER DEFAULT 0',
    'ALTER TABLE sync_queue ADD COLUMN next_retry_at TEXT',
  ];

  for (const statement of migrations) {
    try {
      await db.execAsync(statement);
    } catch {
      // Column already exists or table structure is compliant
    }
  }

  // Create performance indexes for ipo_master table
  try {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_ipo_master_status ON ipo_master(status);
      CREATE INDEX IF NOT EXISTS idx_ipo_master_symbol ON ipo_master(symbol);
      CREATE INDEX IF NOT EXISTS idx_ipo_master_dates ON ipo_master(open_date, close_date, listing_date);
      CREATE INDEX IF NOT EXISTS idx_ipo_master_favorite ON ipo_master(is_favorite);
      CREATE INDEX IF NOT EXISTS idx_ipo_allotments_app ON ipo_allotments(application_id);
    `);
  } catch {
    // Indexes exist
  }

  // Backfill allotment_date for seed IPO listings if empty
  try {
    await db.execAsync(`
      UPDATE ipo_listings SET allotment_date = '2025-11-13', registrar = 'Bigshare Services', exchange = 'BSE SME', issue_type = 'SME' WHERE ipo_name = 'Advit Jewels' AND (allotment_date IS NULL OR allotment_date = '');
      UPDATE ipo_listings SET allotment_date = '2025-11-01', registrar = 'KFin Technologies', exchange = 'NSE', issue_type = 'Mainboard' WHERE ipo_name = 'HDB Financial' AND (allotment_date IS NULL OR allotment_date = '');
      UPDATE ipo_listings SET allotment_date = '2025-10-18', registrar = 'Link Intime India', exchange = 'NSE', issue_type = 'Mainboard' WHERE ipo_name = 'Ola Electric' AND (allotment_date IS NULL OR allotment_date = '');
    `);
  } catch {
    // Ignore if backfill fails
  }

  // Purge any legacy hardcoded seed IPO records & test records so ONLY Admin Portal published IPOs remain
  try {
    await db.execAsync(`
      DELETE FROM ipo_master WHERE id IN (
        'ipo-leap-india', 'ipo-technocraft', 'ipo-lapl-auto', 'ipo-molbio-diag',
        'ipo-dhoot-trans', 'ipo-shiprocket', 'ipo-lalithaa-jewellery', 'ipo-ola-electric',
        'ipo-swiggy', 'ipo-hyundai-motor'
      ) OR id LIKE 'ipo-%' OR LOWER(company_name) LIKE '%test%' OR LOWER(ipo_name) LIKE '%test%' OR id LIKE '%test%';
    `);
  } catch {
    // Purge ignored
  }

  // Migration routine for sync_status & last_synced_at
  try {
    const validTables = ['users_table', 'ipo_listings', 'ipo_applications', 'bank_accounts', 'ipo_master'];
    const now = new Date().toISOString();

    let queuedItems: { table_name: string; record_id: string }[] = [];
    try {
      queuedItems = await db.getAllAsync<{ table_name: string; record_id: string }>(
        'SELECT table_name, record_id FROM sync_queue'
      );
    } catch {
      // sync_queue table might not exist
    }

    const pendingMap = new Map<string, Set<string>>();
    for (const table of validTables) {
      pendingMap.set(table, new Set());
    }
    for (const item of queuedItems) {
      if (pendingMap.has(item.table_name)) {
        pendingMap.get(item.table_name)!.add(item.record_id);
      }
    }

    for (const table of validTables) {
      const pendingIds = Array.from(pendingMap.get(table) || []);
      if (pendingIds.length > 0) {
        const placeholders = pendingIds.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE ${table} SET sync_status = 'PENDING' WHERE id IN (${placeholders})`,
          pendingIds
        );
        await db.runAsync(
          `UPDATE ${table} SET sync_status = 'SYNCED' WHERE id NOT IN (${placeholders}) AND (sync_status IS NULL OR sync_status = '')`,
          pendingIds
        );
      } else {
        await db.runAsync(
          `UPDATE ${table} SET sync_status = 'SYNCED' WHERE sync_status IS NULL OR sync_status = ''`
        );
      }

      await db.runAsync(
        `UPDATE ${table} SET last_synced_at = COALESCE(NULLIF(updated_at, ''), NULLIF(created_at, ''), ?) WHERE sync_status = 'SYNCED' AND (last_synced_at IS NULL OR last_synced_at = '')`,
        [now]
      );
    }
  } catch (err) {
    console.error('[Schema Migration Error]', err);
  }
}
