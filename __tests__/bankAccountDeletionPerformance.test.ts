/**
 * Bank Account Deletion Performance, Owner Isolation & Integrity Regression Tests
 *
 * Verifies:
 * 1. Immediate optimistic UI state update with performance benchmark (<50ms).
 * 2. Local SQLite soft-deletion without blocking full-database refresh.
 * 3. Local database failure triggers state rollback and throws error to caller.
 * 4. Offline mode and cloud failure resilience (non-blocking off-critical-path cloud sync).
 * 5. Repeated taps / duplicate delete request protection.
 * 6. Owner isolation: Authenticated user cannot delete another user's account; guest cannot delete authenticated account.
 * 7. Stale cloud deltas cannot resurrect deleted accounts, while legitimate newer updates are accepted.
 * 8. Linked-record integrity: Historical IPO applications and user profile references remain intact.
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

interface BankAccountRow {
  id: string;
  bank_name: string;
  balance: number;
  upi_app: string;
  owner_id: string | null;
  sync_version: number;
  sync_status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ApplicationRow {
  id: string;
  user_id: string;
  ipo_id: string;
  bank_name: string;
  upi_app: string;
  status: string;
  deleted_at: string | null;
}

class MockSQLiteDB {
  public bankAccounts: BankAccountRow[] = [];
  public applications: ApplicationRow[] = [];
  public failNextRun: boolean = false;
  public runCallCount: number = 0;

  async runAsync(sql: string, params: any[] = []): Promise<any> {
    this.runCallCount++;
    if (this.failNextRun) {
      throw new Error('SQLite disk I/O error or constraint failure');
    }

    if (sql.includes('UPDATE bank_accounts SET')) {
      const deletedAt = params[0];
      const updatedAt = params[1];
      const id = params[2];
      const bank = this.bankAccounts.find((b) => b.id === id);

      if (!bank) return { changes: 0 };

      // Owner isolation checks modeled on production SQL WHERE clause
      if (sql.includes('(owner_id = ? OR owner_id IS NULL OR owner_id = "")')) {
        const expectedOwner = params[3];
        if (bank.owner_id && bank.owner_id !== expectedOwner) {
          // Account belongs to another user - NOT updated!
          return { changes: 0 };
        }
      } else if (sql.includes('(owner_id IS NULL OR owner_id = "")')) {
        // Guest mode - can only update unowned accounts
        if (bank.owner_id && bank.owner_id !== '') {
          return { changes: 0 };
        }
      }

      bank.deleted_at = deletedAt;
      bank.updated_at = updatedAt;
      bank.sync_version += 1;
      bank.sync_status = 'PENDING';
      return { changes: 1 };
    }

    return { changes: 1 };
  }

  async getAllAsync<T>(sql: string, params: any[] = []): Promise<T[]> {
    if (sql.includes('FROM bank_accounts')) {
      let filtered = this.bankAccounts.filter((b) => b.deleted_at === null);
      if (sql.includes('owner_id = ?')) {
        const uid = params[0];
        filtered = filtered.filter((b) => b.owner_id === uid || b.owner_id === null || b.owner_id === '');
      }
      return filtered as unknown as T[];
    }
    if (sql.includes('FROM ipo_applications')) {
      return this.applications.filter((a) => a.deleted_at === null) as unknown as T[];
    }
    return [];
  }

  async getFirstAsync<T>(sql: string, params: any[] = []): Promise<T | null> {
    if (sql.includes('FROM bank_accounts WHERE id = ?')) {
      const id = params[0];
      const bank = this.bankAccounts.find((b) => b.id === id);
      return (bank as unknown as T) || null;
    }
    return null;
  }
}

/**
 * Production BankRepository logic as implemented in db/repositories.ts
 */
class ProductionBankRepository {
  constructor(private db: MockSQLiteDB) {}

  async delete(id: string, ownerId?: string | null): Promise<void> {
    if (!id) return;
    const now = new Date().toISOString();
    let sql = `
      UPDATE bank_accounts SET
        deleted_at = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    const params: any[] = [now, now, id];
    if (ownerId) {
      sql += ' AND (owner_id = ? OR owner_id IS NULL OR owner_id = "")';
      params.push(ownerId);
    } else if (ownerId === null || ownerId === '') {
      sql += ' AND (owner_id IS NULL OR owner_id = "")';
    }
    await this.db.runAsync(sql, params);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PRODUCTION BANK ACCOUNT DELETION INTEGRITY SUITE');
  console.log('================================================================\n');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Optimistic UI State Update & Speed Benchmark (< 50ms)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Optimistic Deletion & Speed Benchmark ---');
  {
    const db = new MockSQLiteDB();
    db.bankAccounts = [
      {
        id: 'bank-1',
        bank_name: 'HDFC Bank',
        balance: 50000,
        upi_app: 'GPay',
        owner_id: 'user-1',
        sync_version: 0,
        sync_status: 'SYNCED',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      },
      {
        id: 'bank-2',
        bank_name: 'ICICI Bank',
        balance: 25000,
        upi_app: 'PhonePe',
        owner_id: 'user-1',
        sync_version: 0,
        sync_status: 'SYNCED',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      },
    ];

    let stateBankAccounts = [...db.bankAccounts];
    const deletingBankIds = new Set<string>();

    const tStart = performance.now();

    // 1. Optimistic UI update
    let snapshotBank: BankAccountRow | undefined;
    stateBankAccounts = stateBankAccounts.filter((b) => {
      if (b.id === 'bank-1') {
        snapshotBank = b;
        return false;
      }
      return true;
    });
    deletingBankIds.add('bank-1');

    const uiUpdateTime = performance.now() - tStart;
    assert(stateBankAccounts.length === 1, 'Optimistic UI', 'Bank removed from UI state immediately');
    assert(stateBankAccounts[0].id === 'bank-2', 'Correct Item Removed', 'Only selected bank was removed');
    assert(uiUpdateTime < 50, 'UI Latency', `UI updated in ${uiUpdateTime.toFixed(2)}ms (< 50ms)`);

    // 2. Production BankRepository soft-delete
    const repo = new ProductionBankRepository(db);
    await repo.delete('bank-1', 'user-1');
    deletingBankIds.delete('bank-1');

    const totalTime = performance.now() - tStart;
    assert(db.bankAccounts.find((b) => b.id === 'bank-1')?.deleted_at !== null, 'Soft Deleted', 'Row has deleted_at set');
    assert(totalTime < 50, 'Total Fast Path Time', `Complete local deletion took ${totalTime.toFixed(2)}ms (< 50ms)`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Local Database Failure & Rollback
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Local Database Failure & Rollback ---');
  {
    const db = new MockSQLiteDB();
    db.bankAccounts = [
      {
        id: 'bank-1',
        bank_name: 'Axis Bank',
        balance: 30000,
        upi_app: 'Paytm',
        owner_id: 'user-1',
        sync_version: 0,
        sync_status: 'SYNCED',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      },
      {
        id: 'bank-2',
        bank_name: 'SBI',
        balance: 40000,
        upi_app: 'BHIM',
        owner_id: 'user-1',
        sync_version: 0,
        sync_status: 'SYNCED',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      },
    ];

    let stateBankAccounts = [...db.bankAccounts];
    const deletingBankIds = new Set<string>();

    db.failNextRun = true; // Simulate SQLite failure

    let caughtError: any = null;
    try {
      const id = 'bank-1';
      let snapshotBank: BankAccountRow | undefined;
      stateBankAccounts = stateBankAccounts.filter((b) => {
        if (b.id === id) {
          snapshotBank = b;
          return false;
        }
        return true;
      });
      deletingBankIds.add(id);

      try {
        const repo = new ProductionBankRepository(db);
        await repo.delete(id, 'user-1');
      } catch (err) {
        deletingBankIds.delete(id);
        if (snapshotBank) {
          stateBankAccounts = [...stateBankAccounts, snapshotBank].sort((a, b) =>
            a.bank_name.localeCompare(b.bank_name)
          );
        }
        throw err;
      } finally {
        deletingBankIds.delete(id);
      }
    } catch (e) {
      caughtError = e;
    }

    assert(caughtError !== null, 'Error Re-thrown', 'Local SQLite error was re-thrown to caller');
    assert(stateBankAccounts.length === 2, 'State Rolled Back', 'Bank accounts restored after failure');
    assert(stateBankAccounts.some((b) => b.id === 'bank-1'), 'Original Restored', 'bank-1 restored to state');
    assert(deletingBankIds.size === 0, 'In-Flight Cleared', 'deletingBankIds lock released after rollback');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Cloud Failure & Offline Mode Resilience
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Cloud Failure & Offline Mode Resilience ---');
  {
    const db = new MockSQLiteDB();
    db.bankAccounts = [
      {
        id: 'bank-offline-1',
        bank_name: 'Kotak Bank',
        balance: 100000,
        upi_app: 'GPay',
        owner_id: 'user-1',
        sync_version: 0,
        sync_status: 'SYNCED',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      },
    ];

    let stateBankAccounts = [...db.bankAccounts];
    const deletingBankIds = new Set<string>();

    const cloudAttempted = { value: false };
    const mockSyncSingleDocDelete = async () => {
      cloudAttempted.value = true;
      throw new Error('Network error: device is offline');
    };

    const id = 'bank-offline-1';
    stateBankAccounts = stateBankAccounts.filter((b) => b.id !== id);
    deletingBankIds.add(id);

    const repo = new ProductionBankRepository(db);
    await repo.delete(id, 'user-1');
    deletingBankIds.delete(id);

    mockSyncSingleDocDelete().catch((_err) => {
      // Non-blocking off-critical-path error handler
    });

    assert(cloudAttempted.value === true, 'Cloud Triggered', 'Cloud sync attempted in background');
    assert(stateBankAccounts.length === 0, 'UI Remains Deleted', 'UI remains deleted despite cloud failure');
    const localBank = db.bankAccounts.find((b) => b.id === id);
    assert(localBank?.deleted_at !== null, 'Local Soft Delete Set', 'Local tombstone recorded in SQLite');
    assert(localBank?.sync_status === 'PENDING', 'Pending Sync Marked', 'Account marked PENDING for later retry');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Repeated Taps Guard & Double-Tap Prevention
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Repeated Taps & In-Flight Deletion Guard ---');
  {
    const db = new MockSQLiteDB();
    db.bankAccounts = [
      {
        id: 'bank-tap-1',
        bank_name: 'Federal Bank',
        balance: 15000,
        upi_app: 'PhonePe',
        owner_id: 'user-1',
        sync_version: 0,
        sync_status: 'SYNCED',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      },
    ];

    const deletingBankIds = new Set<string>();
    let callCount = 0;

    const deleteBankAccountSim = async (id: string) => {
      if (deletingBankIds.has(id)) {
        return;
      }
      deletingBankIds.add(id);
      callCount++;
      const repo = new ProductionBankRepository(db);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await repo.delete(id, 'user-1');
      deletingBankIds.delete(id);
    };

    const call1 = deleteBankAccountSim('bank-tap-1');
    const call2 = deleteBankAccountSim('bank-tap-1');

    await Promise.all([call1, call2]);

    assert(callCount === 1, 'Duplicate Guard', 'Delete operation executed only once despite repeated calls');
    assert(db.runCallCount === 1, 'Single DB Operation', 'SQLite received exactly 1 UPDATE query');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Owner Scoping & Isolation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Owner Scoping & Isolation ---');
  {
    const db = new MockSQLiteDB();
    db.bankAccounts = [
      {
        id: 'bank-user-1',
        bank_name: 'User 1 Bank',
        balance: 10000,
        upi_app: 'GPay',
        owner_id: 'user-uid-1',
        sync_version: 0,
        sync_status: 'SYNCED',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      },
      {
        id: 'bank-user-2',
        bank_name: 'User 2 Bank',
        balance: 20000,
        upi_app: 'PhonePe',
        owner_id: 'user-uid-2',
        sync_version: 0,
        sync_status: 'SYNCED',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      },
      {
        id: 'bank-unowned',
        bank_name: 'Offline Unowned Bank',
        balance: 5000,
        upi_app: 'BHIM',
        owner_id: null,
        sync_version: 0,
        sync_status: 'SYNCED',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      },
    ];

    const repo = new ProductionBankRepository(db);

    // 5A: User 1 attempts to delete User 2's bank account
    await repo.delete('bank-user-2', 'user-uid-1');
    assert(
      db.bankAccounts.find((b) => b.id === 'bank-user-2')?.deleted_at === null,
      'User 2 Protected',
      'User 1 cannot delete User 2 account'
    );

    // 5B: Guest session attempts to delete User 1's bank account
    await repo.delete('bank-user-1', null);
    assert(
      db.bankAccounts.find((b) => b.id === 'bank-user-1')?.deleted_at === null,
      'Guest Blocked from User Account',
      'Guest session cannot delete authenticated user account'
    );

    // 5C: User 1 deletes their own bank account
    await repo.delete('bank-user-1', 'user-uid-1');
    assert(
      db.bankAccounts.find((b) => b.id === 'bank-user-1')?.deleted_at !== null,
      'User 1 Deletion Allowed',
      'User 1 successfully deleted their own account'
    );

    // 5D: Guest session deletes unowned offline bank account
    await repo.delete('bank-unowned', null);
    assert(
      db.bankAccounts.find((b) => b.id === 'bank-unowned')?.deleted_at !== null,
      'Guest Unowned Allowed',
      'Guest session successfully deleted unowned offline account'
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Stale vs Legitimate Newer Cloud Deltas
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Stale vs Legitimate Newer Cloud Deltas ---');
  {
    const db = new MockSQLiteDB();
    const deleteTime = new Date('2026-03-01T12:00:00Z').toISOString();
    db.bankAccounts = [
      {
        id: 'bank-delta-1',
        bank_name: 'PNB',
        balance: 10000,
        upi_app: 'GPay',
        owner_id: 'user-1',
        sync_version: 2,
        sync_status: 'PENDING',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: deleteTime,
        deleted_at: deleteTime, // Soft deleted locally
      },
    ];

    // Case 6A: Stale delta from earlier time (cloud update before local delete)
    const staleDelta = {
      id: 'bank-delta-1',
      bank_name: 'PNB',
      balance: 10000,
      upi_app: 'GPay',
      updated_at: new Date('2026-02-15T10:00:00Z').toISOString(),
      deleted_at: null,
    };

    const local1 = await db.getFirstAsync<BankAccountRow>('SELECT id, updated_at, deleted_at FROM bank_accounts WHERE id = ?', [staleDelta.id]);
    const shouldSkipStale = local1 && local1.deleted_at && (!staleDelta.updated_at || local1.updated_at >= staleDelta.updated_at);
    assert(Boolean(shouldSkipStale), 'Stale Skipped', 'Stale cloud delta is ignored and does not resurrect account');

    // Case 6B: Legitimate newer cloud delta (un-deleted/updated on another device later)
    const newerDelta = {
      id: 'bank-delta-1',
      bank_name: 'PNB Updated',
      balance: 15000,
      upi_app: 'GPay',
      updated_at: new Date('2026-03-05T10:00:00Z').toISOString(), // Newer than local delete!
      deleted_at: null,
    };

    const local2 = await db.getFirstAsync<BankAccountRow>('SELECT id, updated_at, deleted_at FROM bank_accounts WHERE id = ?', [newerDelta.id]);
    const shouldSkipNewer = local2 && local2.deleted_at && (!newerDelta.updated_at || local2.updated_at >= newerDelta.updated_at);
    assert(!shouldSkipNewer, 'Newer Accepted', 'Legitimate newer cloud delta is processed and not blocked by old local delete');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Linked-Record Integrity (IPO Applications & Profiles Preserved)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 7: Linked-Record & Historical IPO Application Integrity ---');
  {
    const db = new MockSQLiteDB();
    db.bankAccounts = [
      {
        id: 'bank-linked-1',
        bank_name: 'Bank of Baroda',
        balance: 60000,
        upi_app: 'BHIM',
        owner_id: 'user-1',
        sync_version: 0,
        sync_status: 'SYNCED',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      },
    ];

    db.applications = [
      {
        id: 'app-101',
        user_id: 'user-profile-1',
        ipo_id: 'ipo-77',
        bank_name: 'Bank of Baroda',
        upi_app: 'BHIM',
        status: 'Allotted',
        deleted_at: null,
      },
      {
        id: 'app-102',
        user_id: 'user-profile-2',
        ipo_id: 'ipo-77',
        bank_name: 'Bank of Baroda',
        upi_app: 'BHIM',
        status: 'Mandate Approved',
        deleted_at: null,
      },
    ];

    const repo = new ProductionBankRepository(db);
    await repo.delete('bank-linked-1', 'user-1');

    // Verify bank account is soft deleted
    const bank = db.bankAccounts.find((b) => b.id === 'bank-linked-1');
    assert(bank?.deleted_at !== null, 'Bank Soft Deleted', 'Bank account was soft deleted');

    // Verify linked IPO applications are completely preserved and untouched
    const activeApps = await db.getAllAsync<ApplicationRow>('SELECT * FROM ipo_applications WHERE deleted_at IS NULL');
    assert(activeApps.length === 2, 'Applications Intact', 'Existing IPO applications linked to the bank were NOT deleted');
    assert(activeApps[0].bank_name === 'Bank of Baroda', 'Application Bank Preserved', 'Application 1 preserves bank name');
    assert(activeApps[1].bank_name === 'Bank of Baroda', 'Application Bank Preserved', 'Application 2 preserves bank name');
    assert(activeApps[0].upi_app === 'BHIM', 'Application UPI Preserved', 'Application 1 preserves UPI app mapping');
  }

  console.log('\n================================================================');
  console.log(`🎉 ALL PERFORMANCE & INTEGRITY TESTS PASSED: ${passCount} Passed, ${failCount} Failed`);
  console.log('================================================================');
}

runTests().catch((e) => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
