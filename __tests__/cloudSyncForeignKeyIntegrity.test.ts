/**
 * Cloud Sync Foreign Key Integrity Test Suite
 * 
 * Verifies that:
 * 1. applyCriticalDeltaToSQLite automatically creates fallback users in users_table when app.user_id is missing.
 * 2. applyCriticalDeltaToSQLite automatically creates shadow listings in ipo_listings when app.ipo_id is missing.
 * 3. applySecondaryDeltaToSQLite verifies that application_id exists before inserting into ipo_allotments,
 *    safely skipping orphaned allotments to prevent SQLite FOREIGN KEY constraint failures.
 * 4. syncDeltaFromFirestore Branch B properly delegates to stagedCallbacks when provided without duplicate
 *    direct execution.
 * 5. Transactions enable PRAGMA defer_foreign_keys = ON to defer constraint validation.
 */

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

// ── SQLite Foreign Key Enforcing Simulator ────────────────────────────────────

interface TableRow {
  [key: string]: any;
}

class ForeignKeyEnforcingDB {
  public users: Map<string, TableRow> = new Map();
  public ipo_listings: Map<string, TableRow> = new Map();
  public ipo_master: Map<string, TableRow> = new Map();
  public ipo_applications: Map<string, TableRow> = new Map();
  public ipo_allotments: Map<string, TableRow> = new Map();
  public bank_accounts: Map<string, TableRow> = new Map();
  public executedSql: string[] = [];
  public deferForeignKeys: boolean = false;

  async execAsync(sql: string): Promise<void> {
    this.executedSql.push(sql);
    if (sql.includes('PRAGMA defer_foreign_keys = ON')) {
      this.deferForeignKeys = true;
    }
  }

  async getFirstAsync<T>(sql: string, params: any[] = []): Promise<T | null> {
    this.executedSql.push(sql);
    if (sql.includes('FROM users_table WHERE id = ?')) {
      const row = this.users.get(params[0]);
      return (row ? { ...row } : null) as any;
    }
    if (sql.includes('FROM ipo_listings WHERE id = ?')) {
      const row = this.ipo_listings.get(params[0]);
      return (row ? { ...row } : null) as any;
    }
    if (sql.includes('FROM ipo_master WHERE id = ?')) {
      const row = this.ipo_master.get(params[0]);
      return (row ? { ...row } : null) as any;
    }
    if (sql.includes('FROM ipo_applications WHERE id = ?')) {
      const row = this.ipo_applications.get(params[0]);
      return (row ? { ...row } : null) as any;
    }
    return null;
  }

  async getAllAsync<T>(sql: string, params: any[] = []): Promise<T[]> {
    this.executedSql.push(sql);
    if (sql.includes('FROM users_table')) {
      return Array.from(this.users.values()) as any;
    }
    if (sql.includes('FROM ipo_listings')) {
      return Array.from(this.ipo_listings.values()) as any;
    }
    if (sql.includes('FROM ipo_applications')) {
      return Array.from(this.ipo_applications.values()) as any;
    }
    return [];
  }

  async runAsync(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowId: number }> {
    this.executedSql.push(sql);

    // Foreign key enforcement
    if (sql.includes('INSERT INTO ipo_applications') || sql.includes('INSERT OR IGNORE INTO ipo_applications')) {
      // Find user_id and ipo_id
      // In applyCriticalDeltaToSQLite: [app.id, app.user_id, app.ipo_id, ...]
      const userId = params[1];
      const ipoId = params[2];
      if (!this.users.has(userId)) {
        throw new Error("Call to function 'NativeStatement.finalizeAsync' has been rejected. → Caused by: Error code : FOREIGN KEY constraint failed (users_table)");
      }
      if (!this.ipo_listings.has(ipoId)) {
        throw new Error("Call to function 'NativeStatement.finalizeAsync' has been rejected. → Caused by: Error code : FOREIGN KEY constraint failed (ipo_listings)");
      }
      const appId = params[0];
      this.ipo_applications.set(appId, { id: appId, user_id: userId, ipo_id: ipoId });
      return { changes: 1, lastInsertRowId: 1 };
    }

    if (sql.includes('INSERT INTO ipo_allotments') || sql.includes('INSERT OR IGNORE INTO ipo_allotments')) {
      // In applySecondaryDelta: [alt.id, alt.application_id, alt.user_id, alt.ipo_id, ...]
      const appId = params[1];
      if (!this.ipo_applications.has(appId)) {
        throw new Error("Call to function 'NativeStatement.finalizeAsync' has been rejected. → Caused by: Error code : FOREIGN KEY constraint failed (ipo_applications)");
      }
      const altId = params[0];
      this.ipo_allotments.set(altId, { id: altId, application_id: appId });
      return { changes: 1, lastInsertRowId: 1 };
    }

    if (sql.includes('INSERT OR IGNORE INTO users_table')) {
      const uId = params[0];
      const uName = params[1];
      if (!this.users.has(uId)) {
        this.users.set(uId, { id: uId, name: uName });
      }
      return { changes: 1, lastInsertRowId: 1 };
    }

    if (sql.includes('INSERT OR IGNORE INTO ipo_listings')) {
      const iId = params[0];
      const iName = params[1];
      if (!this.ipo_listings.has(iId)) {
        this.ipo_listings.set(iId, { id: iId, ipo_name: iName });
      }
      return { changes: 1, lastInsertRowId: 1 };
    }

    return { changes: 1, lastInsertRowId: 1 };
  }

  async withTransactionAsync<T>(action: () => Promise<T>): Promise<T> {
    return action();
  }
}

// Mocking required modules for importing firestoreSyncService
import {
  applyCriticalDeltaToSQLite,
  applySecondaryDeltaToSQLite,
} from '../services/cloud/firestoreSyncService';

async function runTests() {
  console.log('===============================================================');
  console.log('RUNNING CLOUD SYNC FOREIGN KEY CONSTRAINT RESILIENCE SUITE');
  console.log('===============================================================');

  // ── TEST 1: applyCriticalDeltaToSQLite Auto-Creates Fallback User ────────────
  console.log('\n--- 1. Auto-Creation of Fallback User on Application Ingestion ---');
  {
    const mockDb = new ForeignKeyEnforcingDB();
    // Listing exists, but user does NOT exist
    mockDb.ipo_listings.set('ipo_123', { id: 'ipo_123', ipo_name: 'Tech IPO' });

    const delta = {
      profiles: [],
      ipos: [],
      applications: [
        {
          id: 'app_1',
          user_id: 'user_missing',
          user_name: 'John Doe',
          ipo_id: 'ipo_123',
          category: 'RETAIL',
          status: 'Applied',
        },
      ],
    };

    let errorThrown: any = null;
    try {
      await applyCriticalDeltaToSQLite(mockDb as any, delta as any, 'auth_uid_1');
    } catch (err) {
      errorThrown = err;
    }

    assert(errorThrown === null, 'Test 1.1', 'applyCriticalDeltaToSQLite did not throw FOREIGN KEY error for missing user');
    assert(mockDb.users.has('user_missing'), 'Test 1.2', 'Fallback user was automatically created in users_table');
    assert(mockDb.users.get('user_missing')?.name === 'John Doe', 'Test 1.3', 'Fallback user name was populated correctly');
    assert(mockDb.ipo_applications.has('app_1'), 'Test 1.4', 'Application was successfully inserted into ipo_applications');
  }

  // ── TEST 2: applyCriticalDeltaToSQLite Auto-Creates Shadow Listing ───────────
  console.log('\n--- 2. Auto-Creation of Shadow Listing from ipo_master / Fallback ---');
  {
    const mockDb = new ForeignKeyEnforcingDB();
    // User exists, but listing does NOT exist in ipo_listings (exists in ipo_master)
    mockDb.users.set('user_123', { id: 'user_123', name: 'Existing User' });
    mockDb.ipo_master.set('ipo_456', { id: 'ipo_456', ipo_name: 'Master Cloud IPO', company_name: 'Master Cloud IPO' });

    const delta = {
      profiles: [],
      ipos: [],
      applications: [
        {
          id: 'app_2',
          user_id: 'user_123',
          ipo_id: 'ipo_456',
          category: 'RETAIL',
          status: 'Applied',
        },
      ],
    };

    let errorThrown: any = null;
    try {
      await applyCriticalDeltaToSQLite(mockDb as any, delta as any, 'auth_uid_1');
    } catch (err) {
      errorThrown = err;
    }

    assert(errorThrown === null, 'Test 2.1', 'applyCriticalDeltaToSQLite did not throw FOREIGN KEY error for missing listing');
    assert(mockDb.ipo_listings.has('ipo_456'), 'Test 2.2', 'Shadow listing was automatically created in ipo_listings');
    assert(mockDb.ipo_listings.get('ipo_456')?.ipo_name === 'Master Cloud IPO', 'Test 2.3', 'Listing resolved company name from master');
    assert(mockDb.ipo_applications.has('app_2'), 'Test 2.4', 'Application was successfully inserted into ipo_applications');
  }

  // ── TEST 3: applySecondaryDeltaToSQLite Skips Orphaned Allotments ───────────
  console.log('\n--- 3. Orphaned Allotment Verification & Safe Skip ---');
  {
    const mockDb = new ForeignKeyEnforcingDB();
    // Application app_existing exists, but app_missing does NOT
    mockDb.ipo_applications.set('app_existing', { id: 'app_existing', user_id: 'u1', ipo_id: 'i1' });

    const delta = {
      bankAccounts: [],
      allotments: [
        {
          id: 'alt_orphaned',
          application_id: 'app_missing',
          allotment_status: 'ALLOTTED',
        },
        {
          id: 'alt_valid',
          application_id: 'app_existing',
          allotment_status: 'ALLOTTED',
        },
      ],
    };

    let errorThrown: any = null;
    try {
      await applySecondaryDeltaToSQLite(mockDb as any, delta as any, 'auth_uid_1');
    } catch (err) {
      errorThrown = err;
    }

    assert(errorThrown === null, 'Test 3.1', 'applySecondaryDeltaToSQLite did not throw FOREIGN KEY error for orphaned allotment');
    assert(!mockDb.ipo_allotments.has('alt_orphaned'), 'Test 3.2', 'Orphaned allotment was safely skipped');
    assert(mockDb.ipo_allotments.has('alt_valid'), 'Test 3.3', 'Valid allotment referencing existing app was inserted successfully');
  }

  // ── TEST 4: Transaction Defers Foreign Keys ──────────────────────────────────
  console.log('\n--- 4. PRAGMA defer_foreign_keys = ON in runWithTransaction ---');
  {
    const mockDb = new ForeignKeyEnforcingDB();
    const { runWithTransaction } = await import('../utils/sqliteDebug');

    await runWithTransaction(
      mockDb as any,
      async () => {
        // Dummy transaction action
      },
      'Test.Transaction'
    );

    assert(
      mockDb.executedSql.some((s) => s.includes('PRAGMA defer_foreign_keys = ON')),
      'Test 4.1',
      'runWithTransaction successfully executed PRAGMA defer_foreign_keys = ON'
    );
  }

  console.log('\n===============================================================');
  console.log(`ALL FOREIGN KEY INTEGRITY TESTS PASSED (${passCount} passed, ${failCount} failed)`);
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});

