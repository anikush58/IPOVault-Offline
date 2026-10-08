import { DatabaseSync } from 'node:sqlite';
import { IPORepository } from '../services/ipo/ipoRepository';
import { IPOMasterRecord } from '../services/ipo/types';
import { initDB } from '../db/schema';

(globalThis as any).__DEV__ = false;

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

// Adapts node:sqlite DatabaseSync to match Expo SQLiteDatabase async methods
function createSqliteWrapper(db: DatabaseSync): any {
  return {
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    runAsync: async (sql: string, params: any[] = []) => {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    getFirstAsync: async (sql: string, params: any[] = []) => {
      const stmt = db.prepare(sql);
      const row = stmt.get(...params);
      return row || null;
    },
    getAllAsync: async (sql: string, params: any[] = []) => {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    },
  };
}

export async function runSubscriptionStaleDataRegressionTests() {
  console.log('===============================================================');
  console.log('RUNNING SUBSCRIPTION STALE-DATA & NULL-CLEARING REGRESSION TEST');
  console.log('===============================================================\n');

  const rawDb = new DatabaseSync(':memory:');
  const db = createSqliteWrapper(rawDb);
  await initDB(db);
  const repo = new IPORepository(db);

  const testIpoId = 'test-hd-fire-protect';

  // Step 1: Seed existing SQLite record with stale subscription values
  const initialStaleRecord: Partial<IPOMasterRecord> = {
    id: testIpoId,
    company_name: 'HD Fire Protect',
    ipo_name: 'HD Fire Protect',
    symbol: 'HDFIRE',
    status: 'Upcoming',
    total_sub: 12.45,
    retail_sub: 8.30,
    qib_sub: 18.50,
    nii_sub: 15.20,
    employee_sub: 2.10,
    shareholder_sub: 1.05,
    anchor_sub: 1.00,
    price_band_max: 271,
    issue_size: 712.31,
  };

  await repo.upsert(initialStaleRecord);

  const savedStale = await repo.getById(testIpoId);
  assert(savedStale !== null, 'Step 1: Record inserted', 'Found initial record in SQLite');
  assert(savedStale?.total_sub === 12.45, 'Step 1: Stale total_sub seeded', `Value is ${savedStale?.total_sub}`);
  assert(savedStale?.retail_sub === 8.30, 'Step 1: Stale retail_sub seeded', `Value is ${savedStale?.retail_sub}`);
  assert(savedStale?.qib_sub === 18.50, 'Step 1: Stale qib_sub seeded', `Value is ${savedStale?.qib_sub}`);
  assert(savedStale?.nii_sub === 15.20, 'Step 1: Stale nii_sub seeded', `Value is ${savedStale?.nii_sub}`);

  // Step 2: Sync authoritative backend payload where subscription is null (e.g. IPO is upcoming / not open)
  const backendNullSyncPayload: Partial<IPOMasterRecord> = {
    id: testIpoId,
    company_name: 'HD Fire Protect',
    ipo_name: 'HD Fire Protect',
    symbol: 'HDFIRE',
    status: 'Upcoming',
    total_sub: null,
    retail_sub: null,
    qib_sub: null,
    nii_sub: null,
    employee_sub: null,
    shareholder_sub: null,
    anchor_sub: null,
    price_band_max: 271,
    issue_size: 712.31,
  };

  await repo.upsert(backendNullSyncPayload);

  // Step 3: Verify SQLite subscription becomes null (stale values cleared)
  const updatedNullRecord = await repo.getById(testIpoId);
  assert(updatedNullRecord !== null, 'Step 3: Record retrieved after null sync', 'Found record');
  assert(updatedNullRecord?.total_sub === null, 'Step 3: total_sub is cleared to null', `Value is ${updatedNullRecord?.total_sub}`);
  assert(updatedNullRecord?.retail_sub === null, 'Step 3: retail_sub is cleared to null', `Value is ${updatedNullRecord?.retail_sub}`);
  assert(updatedNullRecord?.qib_sub === null, 'Step 3: qib_sub is cleared to null', `Value is ${updatedNullRecord?.qib_sub}`);
  assert(updatedNullRecord?.nii_sub === null, 'Step 3: nii_sub is cleared to null', `Value is ${updatedNullRecord?.nii_sub}`);
  assert(updatedNullRecord?.employee_sub === null, 'Step 3: employee_sub is cleared to null', `Value is ${updatedNullRecord?.employee_sub}`);
  assert(updatedNullRecord?.shareholder_sub === null, 'Step 3: shareholder_sub is cleared to null', `Value is ${updatedNullRecord?.shareholder_sub}`);
  assert(updatedNullRecord?.anchor_sub === null, 'Step 3: anchor_sub is cleared to null', `Value is ${updatedNullRecord?.anchor_sub}`);

  // Verify non-destructive preservation of other fields
  assert(updatedNullRecord?.company_name === 'HD Fire Protect', 'Step 3: Non-destructive company_name', `Value is ${updatedNullRecord?.company_name}`);
  assert(updatedNullRecord?.issue_size === 712.31, 'Step 3: Non-destructive issue_size', `Value is ${updatedNullRecord?.issue_size}`);

  // Step 4: Verify numeric subscription values persist correctly when live bidding begins
  const liveSubscriptionPayload: Partial<IPOMasterRecord> = {
    id: testIpoId,
    total_sub: 25.75,
    retail_sub: 10.20,
    qib_sub: 45.60,
    nii_sub: 30.15,
    employee_sub: 4.50,
    shareholder_sub: 2.00,
    anchor_sub: 1.00,
  };

  await repo.upsert(liveSubscriptionPayload);

  const liveRecord = await repo.getById(testIpoId);
  assert(liveRecord?.total_sub === 25.75, 'Step 4: Live total_sub written', `Value is ${liveRecord?.total_sub}`);
  assert(liveRecord?.retail_sub === 10.20, 'Step 4: Live retail_sub written', `Value is ${liveRecord?.retail_sub}`);
  assert(liveRecord?.qib_sub === 45.60, 'Step 4: Live qib_sub written', `Value is ${liveRecord?.qib_sub}`);
  assert(liveRecord?.nii_sub === 30.15, 'Step 4: Live nii_sub written', `Value is ${liveRecord?.nii_sub}`);

  // Step 5: Verify 0 persists as 0 (not treated as null / falsey fallback)
  const zeroSubscriptionPayload: Partial<IPOMasterRecord> = {
    id: testIpoId,
    total_sub: 0,
    retail_sub: 0,
    qib_sub: 0,
    nii_sub: 0,
    employee_sub: 0,
    shareholder_sub: 0,
    anchor_sub: 0,
  };

  await repo.upsert(zeroSubscriptionPayload);

  const zeroRecord = await repo.getById(testIpoId);
  assert(zeroRecord?.total_sub === 0, 'Step 5: total_sub=0 persists as 0', `Value is ${zeroRecord?.total_sub}`);
  assert(zeroRecord?.retail_sub === 0, 'Step 5: retail_sub=0 persists as 0', `Value is ${zeroRecord?.retail_sub}`);
  assert(zeroRecord?.qib_sub === 0, 'Step 5: qib_sub=0 persists as 0', `Value is ${zeroRecord?.qib_sub}`);
  assert(zeroRecord?.nii_sub === 0, 'Step 5: nii_sub=0 persists as 0', `Value is ${zeroRecord?.nii_sub}`);

  console.log(`\n===============================================================`);
  console.log(`TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`===============================================================\n`);
}

if (require.main === module) {
  runSubscriptionStaleDataRegressionTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
