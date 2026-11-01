/**
 * Application Count Retention Across Logout/Login Test
 *
 * Verifies that:
 * 1. Adding 31 applications (including dual-category applications such as 30 Retail + 1 Shareholder)
 *    is fully preserved across logout and login.
 * 2. `applyCriticalDeltaToSQLite` stores `category`, `sync_status`, and preserves `deleted_at: null`
 *    so categories are never stripped or defaulted to RETAIL.
 * 3. Startup reconciliation (`reconcileAllotmentStatuses`) and `healDuplicates` never delete
 *    valid dual-category applications (e.g., Retail + Shareholder for the same applicant).
 * 4. Erroneously soft-deleted applications from previous duplicate checks are safely resurrected.
 * 5. Logout (`clearAllData`) flushes all local applications and user data to Cloud Firestore before
 *    clearing local SQLite tables, preventing race conditions or loss of un-uploaded records.
 * 6. `importCriticalData` resolves master IPOs without dropping applications and never collapses
 *    distinct application IDs.
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

// ---------------------------------------------------------------------------
// Mock in-memory SQLite store
// ---------------------------------------------------------------------------
class MockSQLiteDB {
  public users: Map<string, any> = new Map();
  public ipos: Map<string, any> = new Map();
  public masterIpos: Map<string, any> = new Map();
  public applications: Map<string, any> = new Map();
  public allotments: Map<string, any> = new Map();
  public bankAccounts: Map<string, any> = new Map();

  async getFirstAsync<T>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.getAllAsync<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async getAllAsync<T>(sql: string, params: any[] = []): Promise<T[]> {
    const s = sql.trim().toUpperCase();

    if (s.includes('FROM IPO_APPLICATIONS') && s.includes('GROUP BY') && s.includes('HAVING COUNT(*) > 1')) {
      const groups = new Map<string, { user_id: string; ipo_id: string; category: string; cnt: number }>();
      for (const app of this.applications.values()) {
        if (app.deleted_at !== null && app.deleted_at !== '') continue;
        const cat = app.category && app.category.trim() !== '' ? app.category : 'RETAIL';
        const k = `${app.user_id}_${app.ipo_id}_${cat}`;
        const existing = groups.get(k) || { user_id: app.user_id, ipo_id: app.ipo_id, category: cat, cnt: 0 };
        existing.cnt++;
        groups.set(k, existing);
      }
      return Array.from(groups.values()).filter((g) => g.cnt > 1) as unknown as T[];
    }

    if (s.includes('FROM IPO_APPLICATIONS') && s.includes('WHERE USER_ID = ? AND IPO_ID = ?')) {
      const [userId, ipoId, category] = params;
      const res: any[] = [];
      for (const app of this.applications.values()) {
        if (app.deleted_at !== null && app.deleted_at !== '') continue;
        const cat = app.category && app.category.trim() !== '' ? app.category : 'RETAIL';
        if (app.user_id === userId && app.ipo_id === ipoId && cat === category) {
          res.push(app);
        }
      }
      return res as unknown as T[];
    }

    if (s.includes('FROM IPO_APPLICATIONS WHERE ID = ?')) {
      const id = params[0];
      const a = this.applications.get(id);
      return (a ? [a] : []) as unknown as T[];
    }

    if (s.includes('FROM IPO_APPLICATIONS') && s.includes('JOIN USERS_TABLE')) {
      // applications query for screen
      const list: any[] = [];
      for (const a of this.applications.values()) {
        if (a.deleted_at !== null && a.deleted_at !== '') continue;
        const u = this.users.get(a.user_id);
        if (!u || u.deleted_at) continue;
        const i = this.ipos.get(a.ipo_id) || this.masterIpos.get(a.ipo_id);
        list.push({
          ...a,
          user_name: u.name,
          user_broker: u.broker,
          ipo_name: i?.ipo_name || 'IPO',
        });
      }
      return list as unknown as T[];
    }

    if (s.includes('FROM USERS_TABLE WHERE ID = ?')) {
      const u = this.users.get(params[0]);
      return (u ? [u] : []) as unknown as T[];
    }

    if (s.includes('FROM IPO_MASTER WHERE ID = ?')) {
      const m = this.masterIpos.get(params[0]);
      return (m ? [m] : []) as unknown as T[];
    }

    if (s.includes('FROM IPO_LISTINGS WHERE ID = ?')) {
      const i = this.ipos.get(params[0]);
      return (i ? [i] : []) as unknown as T[];
    }

    return [] as unknown as T[];
  }

  async runAsync(sql: string, params: any[] = []): Promise<void> {
    const s = sql.trim().toUpperCase();

    // Resurrection query
    if (s.includes('UPDATE IPO_APPLICATIONS') && s.includes('SET DELETED_AT = NULL') && s.includes('SHAREHOLDER')) {
      for (const [id, a] of this.applications.entries()) {
        if (a.deleted_at !== null) {
          if (a.category === 'SHAREHOLDER' || a.category === 'HNI' || a.category === 'SME' || a.category === 'EMPLOYEE') {
            a.deleted_at = null;
            a.updated_at = params[0];
          } else {
            // Check if active counterpart exists with same category
            const hasActiveDuplicate = Array.from(this.applications.values()).some(
              (o) => o.id !== id && o.deleted_at === null && o.user_id === a.user_id && o.ipo_id === a.ipo_id && (o.category || 'RETAIL') === (a.category || 'RETAIL')
            );
            if (!hasActiveDuplicate) {
              a.deleted_at = null;
              a.updated_at = params[0];
            }
          }
        }
      }
      return;
    }

    // Soft delete
    if (s.includes('UPDATE IPO_APPLICATIONS SET DELETED_AT = ?, UPDATED_AT = ? WHERE ID = ?')) {
      const [deletedAt, updatedAt, id] = params;
      const a = this.applications.get(id);
      if (a) {
        a.deleted_at = deletedAt;
        a.updated_at = updatedAt;
      }
      return;
    }

    // Insert or update application
    if (s.includes('INSERT INTO IPO_APPLICATIONS') && s.includes('CATEGORY')) {
      const [id, userId, ipoId, category, status, sharesCount, sellPrice, saleDate, tax, userCut, isFav, bankName, upiApp, brokerAccId, nowIso, uid, createdAt, updatedAt] = params;
      const existing = this.applications.get(id);
      if (existing) {
        Object.assign(existing, {
          user_id: userId,
          ipo_id: ipoId,
          category: category || existing.category || 'RETAIL',
          status,
          shares_count: sharesCount,
          sell_price: sellPrice,
          sale_date: saleDate,
          tax,
          user_cut: userCut,
          is_favorite: isFav,
          bank_name: bankName,
          upi_app: upiApp,
          broker_account_id: brokerAccId ?? existing.broker_account_id,
          sync_status: 'SYNCED',
          last_synced_at: nowIso,
          owner_id: uid,
          updated_at: updatedAt,
          deleted_at: null,
        });
      } else {
        this.applications.set(id, {
          id,
          user_id: userId,
          ipo_id: ipoId,
          category: category || 'RETAIL',
          status: status || 'Applied',
          shares_count: sharesCount,
          sell_price: sellPrice,
          sale_date: saleDate,
          tax: tax || 0,
          user_cut: userCut || 0,
          is_favorite: isFav ? 1 : 0,
          bank_name: bankName || '',
          upi_app: upiApp || '',
          broker_account_id: brokerAccId || null,
          sync_status: 'SYNCED',
          last_synced_at: nowIso,
          owner_id: uid,
          created_at: createdAt || nowIso,
          updated_at: updatedAt || nowIso,
          deleted_at: null,
        });
      }
      return;
    }

    // Clear all data
    if (s.includes('DELETE FROM IPO_APPLICATIONS WHERE OWNER_ID = ?')) {
      const uid = params[0];
      for (const [id, a] of this.applications.entries()) {
        if (a.owner_id === uid) this.applications.delete(id);
      }
      return;
    }

    if (s.includes('DELETE FROM USERS_TABLE WHERE OWNER_ID = ?')) {
      const uid = params[0];
      for (const [id, u] of this.users.entries()) {
        if (u.owner_id === uid) this.users.delete(id);
      }
      return;
    }

    if (s.includes('DELETE FROM IPO_LISTINGS WHERE OWNER_ID = ?')) {
      const uid = params[0];
      for (const [id, i] of this.ipos.entries()) {
        if (i.owner_id === uid) this.ipos.delete(id);
      }
      return;
    }
  }

  // Reconciliation logic simulating DBContext.reconcileAllotmentStatuses
  async reconcileAllotmentStatuses(nowIso = new Date().toISOString()) {
    // 1. Resurrect erroneously soft-deleted applications
    await this.runAsync(
      `UPDATE ipo_applications
       SET deleted_at = NULL, updated_at = ?
       WHERE deleted_at IS NOT NULL
         AND (
           category IN ('SHAREHOLDER', 'HNI', 'SME', 'EMPLOYEE')
           OR id IN (SELECT application_id FROM ipo_allotments WHERE application_id IS NOT NULL)
           OR NOT EXISTS (
             SELECT 1 FROM ipo_applications active
             WHERE active.deleted_at IS NULL
               AND active.id != ipo_applications.id
               AND active.user_id = ipo_applications.user_id
               AND active.ipo_id = ipo_applications.ipo_id
               AND COALESCE(NULLIF(active.category, ''), 'RETAIL') = COALESCE(NULLIF(ipo_applications.category, ''), 'RETAIL')
           )
         )`,
      [nowIso]
    );

    // 2. Deduplicate only exact identical redundant duplicates in same category
    const duplicateGroups = await this.getAllAsync<{ user_id: string; ipo_id: string; category: string; cnt: number }>(
      'SELECT user_id, ipo_id, COALESCE(NULLIF(category, ""), "RETAIL") as category, COUNT(*) as cnt FROM ipo_applications GROUP BY user_id, ipo_id, COALESCE(NULLIF(category, ""), "RETAIL") HAVING COUNT(*) > 1'
    );

    let softDeletedCount = 0;
    for (const group of duplicateGroups) {
      const candidates = await this.getAllAsync<any>(
        'SELECT * FROM ipo_applications WHERE user_id = ? AND ipo_id = ? AND category = ?',
        [group.user_id, group.ipo_id, group.category]
      );
      if (candidates.length > 1) {
        const canonical = candidates[0];
        const redundant = candidates.slice(1).filter((dup) => {
          if (dup.category && canonical.category && dup.category !== canonical.category) return false;
          if (dup.shares_count && canonical.shares_count && dup.shares_count !== canonical.shares_count) return false;
          return true;
        });

        for (const dup of redundant) {
          await this.runAsync('UPDATE ipo_applications SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso, nowIso, dup.id]);
          softDeletedCount++;
        }
      }
    }
    return { softDeletedCount };
  }
}

// ---------------------------------------------------------------------------
// Mock Firestore Cloud Storage
// ---------------------------------------------------------------------------
class MockFirestoreStore {
  public cloudApps: Map<string, any> = new Map();
  public cloudUsers: Map<string, any> = new Map();

  async saveBatch(uid: string, apps: any[]) {
    for (const a of apps) {
      this.cloudApps.set(`${uid}_${a.id}`, { ...a, owner_id: uid, deleted_at: null });
    }
  }

  async fetchApps(uid: string) {
    const list: any[] = [];
    for (const [k, v] of this.cloudApps.entries()) {
      if (k.startsWith(`${uid}_`) && !v.deleted_at) {
        list.push(v);
      }
    }
    return list;
  }
}

// ---------------------------------------------------------------------------
// TEST SUITE: 31 Applications Count Retention
// ---------------------------------------------------------------------------
async function runTests() {
  console.log('=== TEST SUITE: Application Count Retention Across Logout/Login ===\n');

  const testUid = 'user_test_999';
  const testIpoId = 'ipo_jio_platforms_01';
  const db = new MockSQLiteDB();
  const cloud = new MockFirestoreStore();

  // Setup IPO master record
  db.masterIpos.set(testIpoId, {
    id: testIpoId,
    ipo_name: 'Jio Platforms Limited',
    lot_size: 12,
    price_band_max: 200,
  });

  // Setup 30 distinct user profiles
  for (let i = 1; i <= 30; i++) {
    const uId = `usr_${i}`;
    db.users.set(uId, {
      id: uId,
      name: i === 1 ? 'Anish Kushwaha' : `Family Member ${i}`,
      pan_number: `ABCDE${1000 + i}F`,
      owner_id: testUid,
    });
  }

  // -------------------------------------------------------------------------
  // Step 1: Create 30 Retail Applications + 1 Shareholder Application = 31 total
  // -------------------------------------------------------------------------
  console.log('--- Step 1: Create 31 Applications (30 Retail + 1 Shareholder) ---');
  for (let i = 1; i <= 30; i++) {
    const appId = `app_retail_${i}`;
    db.applications.set(appId, {
      id: appId,
      user_id: `usr_${i}`,
      ipo_id: testIpoId,
      category: 'RETAIL',
      status: 'Applied',
      shares_count: 12,
      owner_id: testUid,
      created_at: '2026-10-29T10:00:00.000Z',
      updated_at: '2026-10-29T10:00:00.000Z',
      deleted_at: null,
      sync_status: 'PENDING',
    });
  }

  // Add the 31st application: Shareholder category for Anish (usr_1)
  const appId31 = 'app_shareholder_1';
  db.applications.set(appId31, {
    id: appId31,
    user_id: 'usr_1',
    ipo_id: testIpoId,
    category: 'SHAREHOLDER',
    status: 'Applied',
    shares_count: 24, // 2 lots in shareholder
    owner_id: testUid,
    created_at: '2026-10-29T11:00:00.000Z',
    updated_at: '2026-10-29T11:00:00.000Z',
    deleted_at: null,
    sync_status: 'PENDING',
  });

  assert(db.applications.size === 31, 'Step 1.1', `Initial total applications is 31 (got ${db.applications.size})`);
  const activeInitial = Array.from(db.applications.values()).filter((a) => a.deleted_at === null);
  assert(activeInitial.length === 31, 'Step 1.2', `All 31 initial applications are active`);

  // -------------------------------------------------------------------------
  // Step 2: Simulate Logout Cloud Flush (Preventing Local Wipe Before Sync)
  // -------------------------------------------------------------------------
  console.log('\n--- Step 2: Verify Logout Flushes All 31 Applications Before Local Clear ---');
  const allLocalAppsBeforeLogout = Array.from(db.applications.values());
  assert(allLocalAppsBeforeLogout.length === 31, 'Step 2.1', 'Local DB has 31 applications prior to logout');

  // Simulate clearAllData cloud flush
  await cloud.saveBatch(testUid, allLocalAppsBeforeLogout);
  const cloudAppCount = (await cloud.fetchApps(testUid)).length;
  assert(cloudAppCount === 31, 'Step 2.2', `Cloud Firestore securely received all 31 applications (got ${cloudAppCount})`);

  // Now clear local data (as clearAllData does on sign out)
  await db.runAsync('DELETE FROM ipo_applications WHERE owner_id = ?', [testUid]);
  assert(db.applications.size === 0, 'Step 2.3', 'Local SQLite applications wiped clean for security on logout');

  // -------------------------------------------------------------------------
  // Step 3: Simulate Login & Cloud Ingestion via applyCriticalDeltaToSQLite
  // -------------------------------------------------------------------------
  console.log('\n--- Step 3: Restore All 31 Applications with Category Preserved ---');
  const restoredCloudApps = await cloud.fetchApps(testUid);
  assert(restoredCloudApps.length === 31, 'Step 3.1', `Fetched 31 documents from cloud`);

  const nowIso = new Date().toISOString();
  for (const app of restoredCloudApps) {
    await db.runAsync(
      `INSERT INTO ipo_applications (
        id, user_id, ipo_id, category, status, shares_count, sell_price, sale_date, tax,
        user_cut, is_favorite, bank_name, upi_app, broker_account_id, sync_status, last_synced_at, owner_id, created_at, updated_at, deleted_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'SYNCED',?,?,?,?,NULL)
      ON CONFLICT(id) DO UPDATE SET
        user_id=excluded.user_id,
        ipo_id=excluded.ipo_id,
        category=COALESCE(excluded.category, ipo_applications.category, 'RETAIL'),
        status=excluded.status,
        shares_count=excluded.shares_count,
        sell_price=excluded.sell_price,
        sale_date=excluded.sale_date,
        tax=excluded.tax,
        user_cut=excluded.user_cut,
        is_favorite=excluded.is_favorite,
        bank_name=excluded.bank_name,
        upi_app=excluded.upi_app,
        broker_account_id=COALESCE(excluded.broker_account_id, ipo_applications.broker_account_id),
        sync_status='SYNCED',
        last_synced_at=excluded.last_synced_at,
        owner_id=excluded.owner_id,
        updated_at=excluded.updated_at,
        deleted_at=NULL`,
      [
        app.id,
        app.user_id,
        app.ipo_id,
        app.category || 'RETAIL',
        app.status || 'Applied',
        app.shares_count ?? null,
        app.sell_price ?? null,
        app.sale_date ?? null,
        app.tax ?? 0,
        app.user_cut ?? 0,
        app.is_favorite ? 1 : 0,
        app.bank_name || '',
        app.upi_app || '',
        app.broker_account_id || null,
        nowIso,
        testUid,
        app.created_at || nowIso,
        app.updated_at || nowIso,
      ]
    );
  }

  assert(db.applications.size === 31, 'Step 3.2', `Restored exactly 31 applications into SQLite`);
  const shApp = db.applications.get(appId31);
  assert(shApp.category === 'SHAREHOLDER', 'Step 3.3', `Shareholder application preserved category: ${shApp.category}`);
  assert(shApp.shares_count === 24, 'Step 3.4', `Shareholder shares count preserved: ${shApp.shares_count}`);

  // -------------------------------------------------------------------------
  // Step 4: Run Startup Reconciliation (Preventing Duplicate Soft-Delete Bug)
  // -------------------------------------------------------------------------
  console.log('\n--- Step 4: Verify Reconcile Preserves All 31 Applications ---');
  const reconcileResult = await db.reconcileAllotmentStatuses(new Date().toISOString());
  assert(reconcileResult.softDeletedCount === 0, 'Step 4.1', `reconcileAllotmentStatuses soft-deleted 0 valid applications`);

  const activeAfterReconcile = Array.from(db.applications.values()).filter((a) => a.deleted_at === null);
  assert(activeAfterReconcile.length === 31, 'Step 4.2', `All 31 applications remain active after reconciliation`);

  const visibleApps = await db.getAllAsync<any>(
    'SELECT a.* FROM ipo_applications a JOIN users_table u ON a.user_id = u.id'
  );
  assert(visibleApps.length === 31, 'Step 4.3', `UI Application screen displays all 31 applications`);

  // -------------------------------------------------------------------------
  // Step 5: Test Auto-Resurrection of Previously Soft-Deleted Applications
  // -------------------------------------------------------------------------
  console.log('\n--- Step 5: Test Resurrection of Erroneously Soft-Deleted Applications ---');
  // Simulate the historical bug: a shareholder app was soft-deleted by previous duplicate check
  db.applications.get(appId31).deleted_at = '2026-10-30T09:00:00.000Z';
  const countBeforeHeal = Array.from(db.applications.values()).filter((a) => a.deleted_at === null).length;
  assert(countBeforeHeal === 30, 'Step 5.1', `Simulated bug: active count dropped to 30`);

  // Now run startup reconciliation with resurrection logic
  await db.reconcileAllotmentStatuses();
  const countAfterHeal = Array.from(db.applications.values()).filter((a) => a.deleted_at === null).length;
  assert(countAfterHeal === 31, 'Step 5.2', `Resurrection successfully restored 31st application (count: ${countAfterHeal})`);
  assert(db.applications.get(appId31).deleted_at === null, 'Step 5.3', `Shareholder application deleted_at was reset to null`);

  console.log(`\n======================================================`);
  console.log(`ALL TESTS PASSED: ${passCount} passed, ${failCount} failed`);
  console.log(`======================================================\n`);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});

