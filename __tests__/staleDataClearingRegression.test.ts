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

export async function runStaleDataClearingRegressionTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING COMPREHENSIVE BACKEND STALE-DATA & NULL-CLEARING AUDIT TEST');
  console.log('===============================================================\n');

  const rawDb = new DatabaseSync(':memory:');
  const db = createSqliteWrapper(rawDb);
  await initDB(db);
  const repo = new IPORepository(db);

  const testId = 'stale-data-test-ipo-1';

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Pre-populate record with full stale values across all categories
  // ──────────────────────────────────────────────────────────────────────────
  const initialStaleRecord: Partial<IPOMasterRecord> = {
    id: testId,
    company_name: 'Test Tech Limited',
    ipo_name: 'Test Tech IPO',
    symbol: 'TESTTECH',
    status: 'Upcoming',
    price_band_min: 100,
    price_band_max: 120,
    lot_size: 100,
    issue_size: 500,
    fresh_issue_size: 300,
    ofs_size: 200,
    open_date: '2026-11-01',
    close_date: '2026-11-03',
    allotment_date: '2026-11-04',
    refund_date: '2026-11-05',
    demat_credit_date: '2026-11-05',
    listing_date: '2026-11-07',
    pre_ipo_eps: 5.50,
    post_ipo_eps: 4.80,
    pre_ipo_pe: 21.80,
    post_ipo_pe: 25.00,
    pre_ipo_promoter_holding: 90.00,
    post_ipo_promoter_holding: 75.00,
    pre_ipo_market_cap: 1200.00,
    post_ipo_market_cap: 1200.00,
    market_cap: 1200.00,
    gmp_amount: 35.00,
    gmp_percent: 29.17,
    profit_per_lot: 3500.00,
    total_sub: 15.50,
    retail_sub: 10.20,
    qib_sub: 22.40,
    nii_sub: 18.10,
    employee_sub: 3.00,
    shareholder_sub: 1.50,
    anchor_sub: 1.00,
    drhp_url: 'https://sebi.gov.in/drhp/test.pdf',
    rhp_url: 'https://sebi.gov.in/rhp/test.pdf',
    anchor_list_url: 'https://sebi.gov.in/anchor/test.pdf',
    prospectus_url: 'https://sebi.gov.in/rhp/test.pdf',
    registrar: 'Old Registrar Limited',
    lead_manager: 'Old Lead Manager Capital',
    registrar_phone: '+91 22 1111 2222',
    registrar_email: 'old@registrar.com',
    registrar_website: 'https://oldregistrar.com',
    company_phone: '+91 22 3333 4444',
    company_email: 'info@testtech.com',
    financials_json: JSON.stringify([{ fiscalPeriod: 'FY2025', totalRevenue: '100.00', pat: '15.00' }]),
    participants_json: JSON.stringify([{ role: 'REGISTRAR', name: 'Old Registrar Limited' }]),
    documents_json: JSON.stringify([{ documentType: 'DRHP', title: 'Old DRHP' }]),
    intelligence_json: JSON.stringify({ risks: ['Old Risk 1'], strengths: ['Old Strength 1'] }),
    anchor_details_json: JSON.stringify({ portion: '150 Cr' }),
    is_favorite: 1, // User favorited this
  };

  await repo.upsert(initialStaleRecord);
  await repo.toggleFavorite(testId, true); // explicitly mark favorite

  const seeded = await repo.getById(testId);
  assert(seeded !== null, 'Seeding', 'Record seeded into SQLite');
  assert(seeded?.is_favorite === 1, 'Seeding', 'Favorite is set to 1');
  assert(seeded?.pre_ipo_pe === 21.80, 'Seeding', 'pre_ipo_pe is 21.80');
  assert(Boolean(seeded?.financials_json), 'Seeding', 'financials_json exists');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Authoritative backend sync where fields become NULL / Empty
  // ──────────────────────────────────────────────────────────────────────────
  const authoritativeNullSyncPayload: Partial<IPOMasterRecord> = {
    id: testId,
    company_name: 'Test Tech Limited',
    ipo_name: 'Test Tech IPO',
    symbol: 'TESTTECH',
    status: 'Upcoming',
    price_band_min: null,
    price_band_max: null,
    lot_size: null,
    issue_size: null,
    fresh_issue_size: null,
    ofs_size: null,
    open_date: null,
    close_date: null,
    allotment_date: null,
    refund_date: null,
    demat_credit_date: null,
    listing_date: null,
    pre_ipo_eps: null,
    post_ipo_eps: null,
    pre_ipo_pe: null,
    post_ipo_pe: null,
    pre_ipo_promoter_holding: null,
    post_ipo_promoter_holding: null,
    pre_ipo_market_cap: null,
    post_ipo_market_cap: null,
    market_cap: null,
    gmp_amount: null,
    gmp_percent: null,
    profit_per_lot: null,
    total_sub: null,
    retail_sub: null,
    qib_sub: null,
    nii_sub: null,
    employee_sub: null,
    shareholder_sub: null,
    anchor_sub: null,
    drhp_url: '',
    rhp_url: '',
    anchor_list_url: '',
    prospectus_url: '',
    registrar: '',
    lead_manager: '',
    registrar_phone: '',
    registrar_email: '',
    registrar_website: '',
    company_phone: '',
    company_email: '',
    financials_json: null,
    participants_json: null,
    documents_json: null,
    intelligence_json: null,
    anchor_details_json: null,
  };

  await repo.upsertBatch([authoritativeNullSyncPayload], true);

  const cleared = await repo.getById(testId);
  assert(cleared !== null, 'Cleared: Exists', 'Record retrieved after authoritative null sync');

  // 1. Valuation metrics cleared
  assert(cleared?.pre_ipo_pe === null, 'Cleared: Valuation Pre-IPO P/E', `Value is ${cleared?.pre_ipo_pe}`);
  assert(cleared?.post_ipo_pe === null, 'Cleared: Valuation Post-IPO P/E', `Value is ${cleared?.post_ipo_pe}`);
  assert(cleared?.pre_ipo_eps === null, 'Cleared: Valuation Pre-IPO EPS', `Value is ${cleared?.pre_ipo_eps}`);
  assert(cleared?.pre_ipo_promoter_holding === null, 'Cleared: Promoter Holding', `Value is ${cleared?.pre_ipo_promoter_holding}`);
  assert(cleared?.market_cap === null, 'Cleared: Market Cap', `Value is ${cleared?.market_cap}`);

  // 2. Issue sizes cleared
  assert(cleared?.fresh_issue_size === null, 'Cleared: Fresh Issue Size', `Value is ${cleared?.fresh_issue_size}`);
  assert(cleared?.ofs_size === null, 'Cleared: OFS Size', `Value is ${cleared?.ofs_size}`);
  assert(cleared?.issue_size === null, 'Cleared: Issue Size', `Value is ${cleared?.issue_size}`);
  assert(cleared?.price_band_max === null, 'Cleared: Price Band Max', `Value is ${cleared?.price_band_max}`);

  // 3. Timeline / Dates cleared
  assert(cleared?.open_date === null, 'Cleared: Open Date', `Value is ${cleared?.open_date}`);
  assert(cleared?.allotment_date === null, 'Cleared: Allotment Date', `Value is ${cleared?.allotment_date}`);
  assert(cleared?.listing_date === null, 'Cleared: Listing Date', `Value is ${cleared?.listing_date}`);

  // 4. GMP and Subscription cleared
  assert(cleared?.gmp_amount === null, 'Cleared: GMP Amount', `Value is ${cleared?.gmp_amount}`);
  assert(cleared?.total_sub === null, 'Cleared: Total Subscription', `Value is ${cleared?.total_sub}`);
  assert(cleared?.retail_sub === null, 'Cleared: Retail Subscription', `Value is ${cleared?.retail_sub}`);

  // 5. JSON Blobs cleared
  assert(cleared?.financials_json === null, 'Cleared: Financials JSON', `Value is ${cleared?.financials_json}`);
  assert(cleared?.participants_json === null, 'Cleared: Participants JSON', `Value is ${cleared?.participants_json}`);
  assert(cleared?.documents_json === null, 'Cleared: Documents JSON', `Value is ${cleared?.documents_json}`);
  assert(cleared?.intelligence_json === null, 'Cleared: Intelligence JSON', `Value is ${cleared?.intelligence_json}`);
  assert(cleared?.anchor_details_json === null, 'Cleared: Anchor Details JSON', `Value is ${cleared?.anchor_details_json}`);

  // 6. URLs and Contacts cleared
  assert(cleared?.drhp_url === '', 'Cleared: DRHP URL', `Value is "${cleared?.drhp_url}"`);
  assert(cleared?.registrar_phone === '', 'Cleared: Registrar Phone', `Value is "${cleared?.registrar_phone}"`);

  // 7. USER-MANAGED FIELDS PRESERVED
  assert(cleared?.is_favorite === 1, 'Preserved: User Favorite', `Favorite remains ${cleared?.is_favorite}`);
  assert(cleared?.company_name === 'Test Tech Limited', 'Preserved: Company Name', `Name is ${cleared?.company_name}`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Numeric 0 remains 0 and does not coerce to null
  // ──────────────────────────────────────────────────────────────────────────
  const zeroValuesPayload: Partial<IPOMasterRecord> = {
    id: testId,
    fresh_issue_size: 0,
    total_sub: 0,
    retail_sub: 0,
    gmp_amount: 0,
    gmp_percent: 0,
    profit_per_lot: 0,
  };

  await repo.upsertBatch([zeroValuesPayload], true);

  const zeroChecked = await repo.getById(testId);
  assert(zeroChecked?.fresh_issue_size === 0, 'Zero: fresh_issue_size=0', `Value is ${zeroChecked?.fresh_issue_size}`);
  assert(zeroChecked?.total_sub === 0, 'Zero: total_sub=0', `Value is ${zeroChecked?.total_sub}`);
  assert(zeroChecked?.retail_sub === 0, 'Zero: retail_sub=0', `Value is ${zeroChecked?.retail_sub}`);
  assert(zeroChecked?.gmp_amount === 0, 'Zero: gmp_amount=0', `Value is ${zeroChecked?.gmp_amount}`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Valid backend values overwrite and persist cleanly
  // ──────────────────────────────────────────────────────────────────────────
  const validLivePayload: Partial<IPOMasterRecord> = {
    id: testId,
    price_band_min: 258,
    price_band_max: 271,
    fresh_issue_size: 0,
    ofs_size: 712.31,
    pre_ipo_eps: 6.66,
    post_ipo_eps: 5.45,
    pre_ipo_pe: 40.69,
    post_ipo_pe: 49.72,
    financials_json: JSON.stringify([{ fiscalPeriod: 'FY2026', totalRevenue: '505.12' }]),
    drhp_url: 'https://sebi.gov.in/live-drhp.pdf',
  };

  await repo.upsertBatch([validLivePayload], true);

  const liveChecked = await repo.getById(testId);
  assert(liveChecked?.price_band_max === 271, 'Valid: price_band_max', `Value is ${liveChecked?.price_band_max}`);
  assert(liveChecked?.ofs_size === 712.31, 'Valid: ofs_size', `Value is ${liveChecked?.ofs_size}`);
  assert(liveChecked?.pre_ipo_pe === 40.69, 'Valid: pre_ipo_pe', `Value is ${liveChecked?.pre_ipo_pe}`);
  assert(liveChecked?.post_ipo_pe === 49.72, 'Valid: post_ipo_pe', `Value is ${liveChecked?.post_ipo_pe}`);
  assert(liveChecked?.drhp_url === 'https://sebi.gov.in/live-drhp.pdf', 'Valid: drhp_url', `Value is ${liveChecked?.drhp_url}`);

  const parsedFin = JSON.parse(liveChecked?.financials_json || '[]');
  assert(parsedFin.length === 1 && parsedFin[0].fiscalPeriod === 'FY2026', 'Valid: Financials JSON updated', `Got ${parsedFin[0]?.fiscalPeriod}`);

  console.log(`\n===============================================================`);
  console.log(`TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`===============================================================\n`);
}

if (require.main === module) {
  runStaleDataClearingRegressionTestSuite().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
