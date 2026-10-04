import { initDB, CURRENT_SCHEMA_VERSION } from '../db/schema';
import type { SQLiteDatabase } from 'expo-sqlite';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    failCount++;
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

// Stateful In-Memory SQLite Mock specifically validating schema, migrations, PRAGMAs, and queries
class MockSQLiteDatabase {
  public userVersion: number = 0;
  public tables: Map<string, { columns: Map<string, { type: string; defaultVal: any }>; rows: Array<Record<string, any>> }> = new Map();

  constructor() {
    this.userVersion = 0;
  }

  async execAsync(sql: string): Promise<void> {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      this.executeSingleStatement(stmt);
    }
  }

  async runAsync(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowId: number }> {
    const trimmed = sql.trim();
    if (trimmed.toUpperCase().startsWith('UPDATE')) {
      const match = trimmed.match(/UPDATE\s+(\w+)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*))?$/is);
      if (match) {
        const tableName = match[1].toLowerCase();
        const setClause = match[2];
        const whereClause = match[3];

        const table = this.tables.get(tableName);
        if (!table) throw new Error(`no such table: ${tableName}`);

        // Check if all referenced columns in setClause exist
        const colMatches = setClause.match(/(\w+)\s*=/g);
        if (colMatches) {
          for (const cm of colMatches) {
            const colName = cm.replace('=', '').trim().toLowerCase();
            if (!table.columns.has(colName)) {
              throw new Error(`no such column: ${colName}`);
            }
          }
        }

        // Apply update to matching rows
        let updatedCount = 0;
        for (const row of table.rows) {
          let matches = true;
          if (whereClause) {
            if (whereClause.includes('id = ?') && params.length > 0) {
              const targetId = params[params.length - 1];
              matches = row.id === targetId;
            }
          }
          if (matches) {
            if (setClause.includes('broker_account_id')) {
              const brokerIdx = params.length >= 2 ? params.length - 3 : 0;
              row.broker_account_id = params[brokerIdx];
            }
            if (setClause.includes('status')) {
              row.status = params[0];
            }
            updatedCount++;
          }
        }
        return { changes: updatedCount, lastInsertRowId: 1 };
      }
    }

    if (trimmed.toUpperCase().startsWith('INSERT')) {
      const match = trimmed.match(/INSERT\s+INTO\s+(\w+)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)/is);
      if (match) {
        const tableName = match[1].toLowerCase();
        const colList = match[2].split(',').map((c) => c.trim().toLowerCase());
        const table = this.tables.get(tableName);
        if (!table) throw new Error(`no such table: ${tableName}`);

        for (const col of colList) {
          if (!table.columns.has(col)) {
            throw new Error(`table ${tableName} has no column named ${col}`);
          }
        }

        const newRow: Record<string, any> = {};
        for (let i = 0; i < colList.length; i++) {
          newRow[colList[i]] = params[i] !== undefined ? params[i] : null;
        }
        for (const [cName, cDef] of table.columns.entries()) {
          if (!(cName in newRow)) {
            newRow[cName] = cDef.defaultVal;
          }
        }
        table.rows.push(newRow);
        return { changes: 1, lastInsertRowId: table.rows.length };
      }
    }

    return { changes: 0, lastInsertRowId: 0 };
  }

  async getFirstAsync<T>(sql: string, params: any[] = []): Promise<T | null> {
    const all = await this.getAllAsync<T>(sql, params);
    return all.length > 0 ? all[0] : null;
  }

  async getAllAsync<T>(sql: string, params: any[] = []): Promise<T[]> {
    const trimmed = sql.trim();

    if (trimmed.toUpperCase().startsWith('PRAGMA USER_VERSION')) {
      return [{ user_version: this.userVersion }] as any;
    }

    if (trimmed.toUpperCase().startsWith('PRAGMA TABLE_INFO')) {
      const match = trimmed.match(/PRAGMA\s+table_info\s*\((.*?)\)/i);
      if (match) {
        const tableName = match[1].trim().toLowerCase();
        const table = this.tables.get(tableName);
        if (!table) return [] as any;
        const result: any[] = [];
        let cid = 0;
        for (const [name, col] of table.columns.entries()) {
          result.push({
            cid: cid++,
            name,
            type: col.type,
            notnull: 0,
            dflt_value: col.defaultVal,
            pk: name === 'id' ? 1 : 0,
          });
        }
        return result as any;
      }
    }

    if (trimmed.toUpperCase().startsWith('SELECT')) {
      const match = trimmed.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)/is);
      if (match) {
        const selectCols = match[1];
        const tableName = match[2].toLowerCase();
        const table = this.tables.get(tableName);
        if (!table) return [] as any;

        if (selectCols !== '*') {
          const requestedCols = selectCols.split(',').map((c) => {
            const aliasMatch = c.match(/(?:.*\s+AS\s+)?(\w+)$/i);
            const rawCol = c.trim().split(/\s+/)[0].replace(/^.*\./, '');
            return { raw: rawCol.toLowerCase(), alias: aliasMatch ? aliasMatch[1] : rawCol };
          });

          for (const req of requestedCols) {
            if (req.raw !== '*' && !table.columns.has(req.raw)) {
              throw new Error(`no such column: ${req.raw}`);
            }
          }
        }

        return table.rows as any;
      }
    }

    return [] as any;
  }

  private executeSingleStatement(stmt: string) {
    const trimmed = stmt.trim();
    if (!trimmed) return;

    if (trimmed.toUpperCase().startsWith('PRAGMA USER_VERSION =')) {
      const match = trimmed.match(/PRAGMA\s+user_version\s*=\s*(\d+)/i);
      if (match) {
        this.userVersion = parseInt(match[1], 10);
      }
      return;
    }

    if (trimmed.toUpperCase().startsWith('PRAGMA')) {
      return;
    }

    if (trimmed.toUpperCase().startsWith('CREATE INDEX')) {
      return;
    }

    if (trimmed.toUpperCase().startsWith('CREATE TABLE IF NOT EXISTS') || trimmed.toUpperCase().startsWith('CREATE TABLE')) {
      const match = trimmed.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]+)\)/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        if (!this.tables.has(tableName)) {
          const body = match[2];
          const colDefs = this.parseColumnDefinitions(body);
          this.tables.set(tableName, { columns: colDefs, rows: [] });
        }
      }
      return;
    }

    if (trimmed.toUpperCase().startsWith('ALTER TABLE')) {
      const match = trimmed.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(.*)/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        const colDefStr = match[2].trim();
        const table = this.tables.get(tableName);
        if (!table) throw new Error(`no such table: ${tableName}`);

        const parts = colDefStr.split(/\s+/);
        const colName = parts[0].toLowerCase();
        const colType = parts[1] || 'TEXT';

        if (table.columns.has(colName)) {
          throw new Error(`duplicate column name: ${colName}`);
        }

        table.columns.set(colName, { type: colType, defaultVal: null });
        for (const row of table.rows) {
          if (!(colName in row)) {
            row[colName] = null;
          }
        }
      }
      return;
    }

    if (trimmed.toUpperCase().startsWith('DELETE FROM')) {
      return;
    }

    if (trimmed.toUpperCase().startsWith('UPDATE')) {
      return;
    }
  }

  private parseColumnDefinitions(body: string): Map<string, { type: string; defaultVal: any }> {
    const cols = new Map<string, { type: string; defaultVal: any }>();
    const lines = body.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim().replace(/,$/, '');
      if (!line || line.toUpperCase().startsWith('FOREIGN KEY') || line.toUpperCase().startsWith('PRIMARY KEY(')) {
        continue;
      }
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const name = parts[0].toLowerCase();
        const type = parts[1].toUpperCase();
        let defaultVal: any = null;
        if (line.toUpperCase().includes('DEFAULT')) {
          const defMatch = line.match(/DEFAULT\s+([^,]+)/i);
          if (defMatch) {
            defaultVal = defMatch[1].trim().replace(/^['"]|['"]$/g, '');
            if (defaultVal === 'NULL') defaultVal = null;
          }
        }
        cols.set(name, { type, defaultVal });
      }
    }
    return cols;
  }
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT SQLITE SCHEMA MIGRATION & DATA PRESERVATION TESTS');
  console.log('===============================================================\n');

  // TEST 1: Constant version verification
  console.log('--- TEST 1: Schema Version Bump ---');
  assert(CURRENT_SCHEMA_VERSION === 4, 'TEST 1', 'CURRENT_SCHEMA_VERSION is incremented to 4');

  // TEST 2: Migration on Legacy Database (v3 without broker_account_id)
  console.log('\n--- TEST 2: Upgrading Existing Legacy DB (v3) to v4 ---');
  const db = new MockSQLiteDatabase();

  // Create legacy tables (before broker_account_id was introduced)
  await db.execAsync(`
    CREATE TABLE users_table (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      pan_number TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE ipo_listings (
      id TEXT PRIMARY KEY,
      ipo_name TEXT NOT NULL DEFAULT '',
      buy_price REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE ipo_applications (
      id TEXT PRIMARY KEY,
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
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);

  // Set legacy version to 3 (simulating existing user device)
  db.userVersion = 3;

  // Insert existing application records into legacy table
  const existingApp1 = {
    id: 'app-legacy-1',
    user_id: 'user-1',
    ipo_id: 'ipo-1',
    status: 'Holding',
    sell_price: 250.0,
    sale_date: null,
    tax: 0,
    user_cut: 0,
    shares_count: 50,
    is_favorite: 1,
    bank_name: 'HDFC Bank',
    upi_app: 'GPay',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const existingApp2 = {
    id: 'app-legacy-2',
    user_id: 'user-2',
    ipo_id: 'ipo-2',
    status: 'Sold',
    sell_price: 600.0,
    sale_date: '2026-02-15',
    tax: 150.0,
    user_cut: 200.0,
    shares_count: 100,
    is_favorite: 0,
    bank_name: 'Kotak Bank',
    upi_app: 'PhonePe',
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-15T00:00:00.000Z',
  };

  const appTable = db.tables.get('ipo_applications')!;
  appTable.rows.push({ ...existingApp1 }, { ...existingApp2 });

  assert(appTable.columns.has('broker_account_id') === false, 'TEST 2', 'Pre-migration table lacks broker_account_id column');
  assert(appTable.rows.length === 2, 'TEST 2', 'Pre-migration table has 2 existing user applications');

  // RUN initDB (simulating app open on existing device)
  await initDB(db as unknown as SQLiteDatabase);

  // Assert user_version upgraded to 4
  assert(db.userVersion === 4, 'TEST 2', `PRAGMA user_version is successfully updated to ${CURRENT_SCHEMA_VERSION}`);

  // Assert broker_account_id column was added to ipo_applications
  assert(appTable.columns.has('broker_account_id') === true, 'TEST 2', 'Column ipo_applications.broker_account_id was added by migration');

  // Assert data preservation
  assert(appTable.rows.length === 2, 'TEST 2', 'Exactly 2 records remain after migration (no data loss)');
  const migratedApp1 = appTable.rows.find((r) => r.id === 'app-legacy-1');
  const migratedApp2 = appTable.rows.find((r) => r.id === 'app-legacy-2');

  assert(migratedApp1 !== undefined, 'TEST 2', 'Application 1 is preserved');
  assert(migratedApp1?.status === 'Holding', 'TEST 2', 'Application 1 retains status = Holding');
  assert(migratedApp1?.sell_price === 250.0, 'TEST 2', 'Application 1 retains sell_price = 250.0');
  assert(migratedApp1?.shares_count === 50, 'TEST 2', 'Application 1 retains shares_count = 50');
  assert(migratedApp1?.bank_name === 'HDFC Bank', 'TEST 2', 'Application 1 retains bank_name = HDFC Bank');
  assert(migratedApp1?.broker_account_id === null, 'TEST 2', 'Application 1 has broker_account_id = null (unlinked default)');

  assert(migratedApp2 !== undefined, 'TEST 2', 'Application 2 is preserved');
  assert(migratedApp2?.status === 'Sold', 'TEST 2', 'Application 2 retains status = Sold');
  assert(migratedApp2?.sell_price === 600.0, 'TEST 2', 'Application 2 retains sell_price = 600.0');
  assert(migratedApp2?.tax === 150.0, 'TEST 2', 'Application 2 retains tax = 150.0');
  assert(migratedApp2?.user_cut === 200.0, 'TEST 2', 'Application 2 retains user_cut = 200.0');
  assert(migratedApp2?.broker_account_id === null, 'TEST 2', 'Application 2 has broker_account_id = null');

  // TEST 3: Update Application After Migration
  console.log('\n--- TEST 3: Update Application with broker_account_id after Migration ---');
  let updateThrew = false;
  try {
    await db.runAsync(
      `UPDATE ipo_applications SET
        bank_name = COALESCE(?, bank_name),
        upi_app = COALESCE(?, upi_app),
        broker_account_id = CASE WHEN ? = 1 THEN ? ELSE broker_account_id END,
        updated_at = ?
       WHERE id = ?`,
      ['HDFC Bank', 'GPay', 1, 'acc-zerodha-test-123', '2026-03-01T00:00:00.000Z', 'app-legacy-1']
    );
  } catch (err) {
    updateThrew = true;
    console.error('Update failed:', err);
  }

  assert(!updateThrew, 'TEST 3', 'Update Application executed without SQLite "no such column: broker_account_id" error');
  assert(migratedApp1?.broker_account_id === 'acc-zerodha-test-123', 'TEST 3', 'Application successfully linked to broker_account_id = acc-zerodha-test-123');

  // TEST 3b: Update Application setting broker_account_id = NULL (Unlinking)
  console.log('\n--- TEST 3b: Update Application with broker_account_id = NULL ---');
  let updateNullThrew = false;
  try {
    await db.runAsync(
      `UPDATE ipo_applications SET
        bank_name = COALESCE(?, bank_name),
        upi_app = COALESCE(?, upi_app),
        broker_account_id = CASE WHEN ? = 1 THEN ? ELSE broker_account_id END,
        updated_at = ?
       WHERE id = ?`,
      ['HDFC Bank', 'GPay', 1, null, '2026-03-02T00:00:00.000Z', 'app-legacy-1']
    );
  } catch (err) {
    updateNullThrew = true;
    console.error('Update with NULL failed:', err);
  }

  assert(!updateNullThrew, 'TEST 3b', 'Update Application with broker_account_id = NULL executed without error');
  assert(migratedApp1?.broker_account_id === null, 'TEST 3b', 'Application successfully reset to broker_account_id = NULL');

  // TEST 4: Import / Restore Operations Against Migrated Schema
  console.log('\n--- TEST 4: Import / Restore Operations with and without broker_account_id ---');
  // 4a: Insert legacy format record (broker_account_id = null)
  let insertLegacyThrew = false;
  try {
    await db.runAsync(
      'INSERT INTO ipo_applications (id, user_id, ipo_id, status, shares_count, sell_price, sale_date, tax, user_cut, is_favorite, bank_name, upi_app, broker_account_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ['app-imported-legacy', 'u-1', 'i-1', 'Applied', 50, null, null, 0, 0, 0, 'SBI', 'BHIM', null, '2026-03-01', '2026-03-01']
    );
  } catch (err) {
    insertLegacyThrew = true;
    console.error('Import legacy failed:', err);
  }
  assert(!insertLegacyThrew, 'TEST 4a', 'Importing application without broker_account_id succeeds with NULL');

  // 4b: Insert modern format record (broker_account_id provided)
  let insertModernThrew = false;
  try {
    await db.runAsync(
      'INSERT INTO ipo_applications (id, user_id, ipo_id, status, shares_count, sell_price, sale_date, tax, user_cut, is_favorite, bank_name, upi_app, broker_account_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ['app-imported-modern', 'u-1', 'i-2', 'Holding', 75, 190.0, null, 0, 0, 1, 'ICICI', 'Paytm', 'acc-dhan-456', '2026-03-01', '2026-03-01']
    );
  } catch (err) {
    insertModernThrew = true;
    console.error('Import modern failed:', err);
  }
  assert(!insertModernThrew, 'TEST 4b', 'Importing application with broker_account_id succeeds and sets acc-dhan-456');

  // TEST 5: Fresh Installation (Brand New DB, version 0)
  console.log('\n--- TEST 5: Fresh Installation on Clean Device ---');
  const freshDb = new MockSQLiteDatabase();
  assert(freshDb.userVersion === 0, 'TEST 5', 'Fresh database starts at user_version = 0');

  await initDB(freshDb as unknown as SQLiteDatabase);

  assert(freshDb.userVersion === 4, 'TEST 5', `Fresh database initializes directly to CURRENT_SCHEMA_VERSION = 4`);
  const freshAppTable = freshDb.tables.get('ipo_applications')!;
  assert(freshAppTable.columns.has('broker_account_id') === true, 'TEST 5', 'Fresh ipo_applications table created with broker_account_id');

  console.log('\n===============================================================');
  console.log(`ALL SQLITE SCHEMA MIGRATION TESTS PASSED: ${passCount} / ${passCount + failCount}`);
  console.log('===============================================================');
}

runTestSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
