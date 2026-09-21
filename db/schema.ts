import { SQLiteDatabase } from 'expo-sqlite';

export const CURRENT_SCHEMA_VERSION = 3;

export async function initDB(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 15000;
  `);

  // 1. Fresh schema for offline-first architecture (creates all tables and columns atomically)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users_table (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      name TEXT NOT NULL DEFAULT '',
      pan_number TEXT DEFAULT '',
      client_id TEXT DEFAULT '',
      upi_id TEXT DEFAULT '',
      broker TEXT DEFAULT '',
      tpin TEXT DEFAULT '',
      upi_app TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      default_amount_blocked REAL DEFAULT 0,
      archived INTEGER DEFAULT 0,
      sync_version INTEGER DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ipo_listings (
      id TEXT PRIMARY KEY,
      backend_ipo_id TEXT DEFAULT NULL,
      symbol TEXT DEFAULT '',
      company_name TEXT DEFAULT '',
      owner_id TEXT,
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
      gmp_percent REAL DEFAULT 0,
      gmp_value REAL DEFAULT 0,
      sync_version INTEGER DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ipo_applications (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      user_id TEXT NOT NULL,
      ipo_id TEXT NOT NULL,
      status TEXT DEFAULT 'Applied',
      sell_price REAL,
      sale_date TEXT,
      tax REAL DEFAULT 0,
      user_cut REAL DEFAULT 0,
      shares_count INTEGER DEFAULT NULL,
      is_favorite INTEGER DEFAULT 0,
      bank_name TEXT DEFAULT '',
      upi_app TEXT DEFAULT '',
      sync_version INTEGER DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      deleted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users_table(id) ON DELETE CASCADE,
      FOREIGN KEY (ipo_id) REFERENCES ipo_listings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      bank_name TEXT NOT NULL,
      balance REAL DEFAULT 0,
      upi_app TEXT DEFAULT '',
      sync_version INTEGER DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      next_retry_at TEXT,
      created_at TEXT NOT NULL
    );

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
    );

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
    );

    CREATE TABLE IF NOT EXISTS notification_tracker (
      ipo_id TEXT PRIMARY KEY,
      last_notified_gmp REAL,
      last_notified_radar_category TEXT,
      last_notified_status TEXT,
      updated_at TEXT NOT NULL
    );

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
      pre_ipo_eps REAL DEFAULT NULL,
      post_ipo_eps REAL DEFAULT NULL,
      pre_ipo_pe REAL DEFAULT NULL,
      post_ipo_pe REAL DEFAULT NULL,
      pre_ipo_promoter_holding REAL DEFAULT NULL,
      post_ipo_promoter_holding REAL DEFAULT NULL,
      pre_ipo_market_cap REAL DEFAULT NULL,
      post_ipo_market_cap REAL DEFAULT NULL,
      market_cap REAL DEFAULT NULL,
      is_favorite INTEGER DEFAULT 0,
      source_type TEXT DEFAULT 'SERVER',
      sync_version INTEGER DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_radar_snapshots_ipo ON radar_snapshots(ipo_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ipo_listings_backend_id ON ipo_listings(backend_ipo_id);
    CREATE INDEX IF NOT EXISTS idx_ipo_master_status ON ipo_master(status);
    CREATE INDEX IF NOT EXISTS idx_ipo_master_symbol ON ipo_master(symbol);
    CREATE INDEX IF NOT EXISTS idx_ipo_master_dates ON ipo_master(open_date, close_date, listing_date);
    CREATE INDEX IF NOT EXISTS idx_ipo_master_favorite ON ipo_master(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_ipo_allotments_app ON ipo_allotments(application_id);
  `);

  // 2. Check schema version to only run incremental migrations once
  try {
    const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const currentVersion = versionRow?.user_version ?? 0;

    if (currentVersion < CURRENT_SCHEMA_VERSION) {
      // Helper function to safely add missing columns without failing
      const addColumnIfNotExists = async (table: string, columnDef: string) => {
        try {
          await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
        } catch {
          // Column already exists
        }
      };

      // Ensure incremental columns exist on legacy databases
      await addColumnIfNotExists('users_table', 'owner_id TEXT');
      await addColumnIfNotExists('users_table', 'client_id TEXT DEFAULT ""');
      await addColumnIfNotExists('users_table', 'upi_id TEXT DEFAULT ""');
      await addColumnIfNotExists('users_table', 'avatar_url TEXT DEFAULT ""');
      await addColumnIfNotExists('users_table', 'archived INTEGER DEFAULT 0');
      await addColumnIfNotExists('users_table', 'sync_version INTEGER DEFAULT 0');
      await addColumnIfNotExists('users_table', 'sync_status TEXT DEFAULT "SYNCED"');
      await addColumnIfNotExists('users_table', 'last_synced_at TEXT');
      await addColumnIfNotExists('users_table', 'created_at TEXT NOT NULL DEFAULT ""');
      await addColumnIfNotExists('users_table', 'updated_at TEXT NOT NULL DEFAULT ""');
      await addColumnIfNotExists('users_table', 'deleted_at TEXT');

      await addColumnIfNotExists('ipo_listings', 'owner_id TEXT');
      await addColumnIfNotExists('ipo_listings', 'backend_ipo_id TEXT DEFAULT NULL');
      await addColumnIfNotExists('ipo_listings', 'symbol TEXT DEFAULT ""');
      await addColumnIfNotExists('ipo_listings', 'company_name TEXT DEFAULT ""');
      await addColumnIfNotExists('ipo_listings', 'archived INTEGER DEFAULT 0');
      await addColumnIfNotExists('ipo_listings', 'registrar TEXT DEFAULT ""');
      await addColumnIfNotExists('ipo_listings', 'exchange TEXT DEFAULT ""');
      await addColumnIfNotExists('ipo_listings', 'issue_type TEXT DEFAULT ""');
      await addColumnIfNotExists('ipo_listings', 'allotment_date TEXT DEFAULT ""');
      await addColumnIfNotExists('ipo_listings', 'logo_url TEXT DEFAULT ""');
      await addColumnIfNotExists('ipo_listings', 'is_favorite INTEGER DEFAULT 0');
      await addColumnIfNotExists('ipo_listings', 'gmp_percent REAL DEFAULT 0');
      await addColumnIfNotExists('ipo_listings', 'gmp_value REAL DEFAULT 0');
      await addColumnIfNotExists('ipo_listings', 'sync_version INTEGER DEFAULT 0');
      await addColumnIfNotExists('ipo_listings', 'sync_status TEXT DEFAULT "SYNCED"');
      await addColumnIfNotExists('ipo_listings', 'last_synced_at TEXT');
      await addColumnIfNotExists('ipo_listings', 'created_at TEXT NOT NULL DEFAULT ""');
      await addColumnIfNotExists('ipo_listings', 'updated_at TEXT NOT NULL DEFAULT ""');
      await addColumnIfNotExists('ipo_listings', 'deleted_at TEXT');

      await addColumnIfNotExists('ipo_applications', 'owner_id TEXT');
      await addColumnIfNotExists('ipo_applications', 'is_favorite INTEGER DEFAULT 0');
      await addColumnIfNotExists('ipo_applications', 'bank_name TEXT DEFAULT ""');
      await addColumnIfNotExists('ipo_applications', 'upi_app TEXT DEFAULT ""');
      await addColumnIfNotExists('ipo_applications', 'shares_count INTEGER DEFAULT NULL');
      await addColumnIfNotExists('ipo_applications', 'sync_version INTEGER DEFAULT 0');
      await addColumnIfNotExists('ipo_applications', 'sync_status TEXT DEFAULT "SYNCED"');
      await addColumnIfNotExists('ipo_applications', 'last_synced_at TEXT');
      await addColumnIfNotExists('ipo_applications', 'created_at TEXT NOT NULL DEFAULT ""');
      await addColumnIfNotExists('ipo_applications', 'updated_at TEXT NOT NULL DEFAULT ""');
      await addColumnIfNotExists('ipo_applications', 'deleted_at TEXT');

      await addColumnIfNotExists('bank_accounts', 'owner_id TEXT');
      await addColumnIfNotExists('bank_accounts', 'upi_app TEXT DEFAULT ""');
      await addColumnIfNotExists('bank_accounts', 'sync_version INTEGER DEFAULT 0');
      await addColumnIfNotExists('bank_accounts', 'sync_status TEXT DEFAULT "SYNCED"');
      await addColumnIfNotExists('bank_accounts', 'last_synced_at TEXT');
      await addColumnIfNotExists('bank_accounts', 'created_at TEXT NOT NULL DEFAULT ""');
      await addColumnIfNotExists('bank_accounts', 'updated_at TEXT NOT NULL DEFAULT ""');
      await addColumnIfNotExists('bank_accounts', 'deleted_at TEXT');

      await addColumnIfNotExists('radar_snapshots', 'is_final_pre_listing INTEGER DEFAULT 0');

      await addColumnIfNotExists('ipo_master', 'is_favorite INTEGER DEFAULT 0');
      await addColumnIfNotExists('ipo_master', 'source_type TEXT DEFAULT "SERVER"');
      await addColumnIfNotExists('ipo_master', 'sync_status TEXT DEFAULT "SYNCED"');
      await addColumnIfNotExists('ipo_master', 'last_synced_at TEXT');
      await addColumnIfNotExists('ipo_master', 'gmp_amount REAL DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'gmp_percent REAL DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'profit_per_lot REAL DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'gmp_updated_at TEXT DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'lifecycle_status TEXT DEFAULT "Unknown"');
      await addColumnIfNotExists('ipo_master', 'lifecycle_confidence TEXT DEFAULT "Low"');
      await addColumnIfNotExists('ipo_master', 'lifecycle_source TEXT DEFAULT ""');
      await addColumnIfNotExists('ipo_master', 'lifecycle_last_verified_at TEXT DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'pre_ipo_eps REAL DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'post_ipo_eps REAL DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'pre_ipo_pe REAL DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'post_ipo_pe REAL DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'pre_ipo_promoter_holding REAL DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'post_ipo_promoter_holding REAL DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'pre_ipo_market_cap REAL DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'post_ipo_market_cap REAL DEFAULT NULL');
      await addColumnIfNotExists('ipo_master', 'market_cap REAL DEFAULT NULL');

      await addColumnIfNotExists('sync_queue', 'retry_count INTEGER DEFAULT 0');
      await addColumnIfNotExists('sync_queue', 'next_retry_at TEXT');

      // Purge legacy seed records & test records
      try {
        await db.execAsync(`
          DELETE FROM ipo_master WHERE id IN (
            'ipo-leap-india', 'ipo-technocraft', 'ipo-lapl-auto', 'ipo-molbio-diag',
            'ipo-dhoot-trans', 'ipo-shiprocket', 'ipo-lalithaa-jewellery', 'ipo-ola-electric',
            'ipo-swiggy', 'ipo-hyundai-motor'
          ) OR id LIKE 'ipo-%' OR LOWER(company_name) LIKE '%test%' OR LOWER(ipo_name) LIKE '%test%' OR id LIKE '%test%' OR LOWER(TRIM(ipo_name)) = 'ipo';

          DELETE FROM ipo_listings WHERE symbol = 'TESTENT' OR LOWER(company_name) LIKE '%test enterprise%' OR LOWER(ipo_name) LIKE '%test enterprise%' OR LOWER(TRIM(ipo_name)) = 'ipo' OR (TRIM(ipo_name) = '' AND TRIM(company_name) = '');
        `);
      } catch {}

      // Backfill sync_status & last_synced_at
      try {
        await db.execAsync(`
          UPDATE users_table SET sync_status = 'SYNCED' WHERE sync_status IS NULL OR sync_status = '';
          UPDATE ipo_listings SET sync_status = 'SYNCED' WHERE sync_status IS NULL OR sync_status = '';
          UPDATE ipo_applications SET sync_status = 'SYNCED' WHERE sync_status IS NULL OR sync_status = '';
          UPDATE bank_accounts SET sync_status = 'SYNCED' WHERE sync_status IS NULL OR sync_status = '';
          UPDATE ipo_master SET sync_status = 'SYNCED' WHERE sync_status IS NULL OR sync_status = '';

          UPDATE users_table SET last_synced_at = COALESCE(NULLIF(updated_at, ''), NULLIF(created_at, ''), CURRENT_TIMESTAMP) WHERE sync_status = 'SYNCED' AND (last_synced_at IS NULL OR last_synced_at = '');
          UPDATE ipo_listings SET last_synced_at = COALESCE(NULLIF(updated_at, ''), NULLIF(created_at, ''), CURRENT_TIMESTAMP) WHERE sync_status = 'SYNCED' AND (last_synced_at IS NULL OR last_synced_at = '');
          UPDATE ipo_applications SET last_synced_at = COALESCE(NULLIF(updated_at, ''), NULLIF(created_at, ''), CURRENT_TIMESTAMP) WHERE sync_status = 'SYNCED' AND (last_synced_at IS NULL OR last_synced_at = '');
          UPDATE bank_accounts SET last_synced_at = COALESCE(NULLIF(updated_at, ''), NULLIF(created_at, ''), CURRENT_TIMESTAMP) WHERE sync_status = 'SYNCED' AND (last_synced_at IS NULL OR last_synced_at = '');
          UPDATE ipo_master SET last_synced_at = COALESCE(NULLIF(updated_at, ''), NULLIF(created_at, ''), CURRENT_TIMESTAMP) WHERE sync_status = 'SYNCED' AND (last_synced_at IS NULL OR last_synced_at = '');
        `);
      } catch {}

      // Mark user_version as fully migrated
      await db.execAsync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
    }
  } catch (err) {
    if (__DEV__) console.warn('[Schema Migration Notice]', err);
  }
}
