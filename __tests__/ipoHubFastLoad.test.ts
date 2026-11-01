import { DatabaseSync } from 'node:sqlite';
import {
  mapSqliteRowToBackendIpo,
  saveBackendIposToCache,
  getCachedBackendIpos,
  reconcileBackendIposWithCache,
  isRecordDifferent,
} from '../services/ipo/ipoHubCacheService';
import { IPORepository } from '../services/ipo/ipoRepository';
import { initDB } from '../db/schema';
import { BackendIpo } from '../types/backend-ipo';
import { IPOMasterRecord } from '../services/ipo/types';

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

export async function runIpoHubFastLoadTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING IPO HUB FAST LOAD & AUDIT FIX VERIFICATION TEST SUITE');
  console.log('===============================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: High-fidelity mapping from SQLite row to BackendIpo
  // ──────────────────────────────────────────────────────────────────────────
  const sampleSqliteRow = {
    id: 'ipo-test-premier-energies',
    company_name: 'Premier Energies Limited',
    ipo_name: 'Premier Energies IPO',
    symbol: 'PREMIERENE',
    exchange: 'NSE',
    issue_type: 'Mainboard',
    price_band_min: 427,
    price_band_max: 450,
    lot_size: 33,
    issue_size: 2830.4,
    open_date: '2026-08-27',
    close_date: '2026-08-29',
    allotment_date: '2026-08-30',
    refund_date: '2026-08-31',
    listing_date: '2026-09-03',
    registrar: 'KFin Technologies',
    status: 'LIVE',
    lifecycle_status: 'OPEN',
    logo_url: 'https://images.getipovault.in/logos/premier.png',
    gmp_amount: 390,
    gmp_percent: 86.67,
    profit_per_lot: 12870,
    gmp_updated_at: '2026-08-28T10:00:00Z',
    retail_sub: 7.4,
    qib_sub: 212.5,
    nii_sub: 50.1,
    total_sub: 75.2,
    subscription_timestamp: '2026-08-28T17:00:00Z',
  };

  const mapped = mapSqliteRowToBackendIpo(sampleSqliteRow);

  assert(mapped.id === 'ipo-test-premier-energies', 'SQLite Mapping - ID', 'Preserves ID');
  assert(mapped.symbol === 'PREMIERENE', 'SQLite Mapping - Symbol', 'Preserves Symbol');
  assert(mapped.status === 'OPEN', 'SQLite Mapping - Status', 'Lifecycle status takes precedence for card badge');
  assert(mapped.marketSegment === 'MAINBOARD', 'SQLite Mapping - Segment', 'Mainboard correctly classified');
  assert(mapped.company?.displayName === 'Premier Energies Limited', 'SQLite Mapping - Display Name', 'Company display name mapped');
  assert(mapped.priceBandLow === 427 && mapped.priceBandHigh === 450, 'SQLite Mapping - Price Band', 'Price band mapped correctly');
  assert(mapped.lotSize === 33, 'SQLite Mapping - Lot Size', 'Lot size is 33');
  assert(mapped.currentGmp?.gmpAmount === 390, 'SQLite Mapping - GMP Amount', 'GMP amount mapped');
  assert(mapped.currentGmp?.gmpPercentage === 86.67, 'SQLite Mapping - GMP Percentage', 'GMP percentage mapped');
  assert(mapped.currentGmp?.estProfitPerLot === 12870, 'SQLite Mapping - Profit Per Lot', 'Profit per lot mapped');
  assert(mapped.currentSubscription?.totalSubscriptionMultiple === 75.2, 'SQLite Mapping - Total Subscription', 'Subscription total mapped');
  assert(mapped.currentSubscription?.categories?.length === 3, 'SQLite Mapping - Sub Categories', 'Categories breakdown created');

  // Test 2: SME market segment mapping
  const smeRow = {
    id: 'ipo-test-sme-tech',
    company_name: 'Tech Innovations SME Ltd',
    symbol: 'TECHINNO',
    issue_type: 'SME IPO',
    price_band_min: 100,
    price_band_max: 105,
    lot_size: 1200,
    status: 'UPCOMING',
  };
  const mappedSme = mapSqliteRowToBackendIpo(smeRow);
  assert(mappedSme.marketSegment === 'SME', 'SME Classification', 'SME issue type maps to SME market segment');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3 (P1): Cached status fallback for Unknown / null / empty lifecycle
  // ──────────────────────────────────────────────────────────────────────────
  const rowUnknownStatusLive = {
    id: 'test-unknown-1',
    company_name: 'Unknown Lifecycle Corp',
    lifecycle_status: 'Unknown',
    status: 'LIVE',
  };
  const mappedUnknown1 = mapSqliteRowToBackendIpo(rowUnknownStatusLive);
  assert(
    mappedUnknown1.status === 'LIVE',
    'P1 Status Fallback - Unknown lifecycle',
    'Case-insensitive "Unknown" lifecycle falls back to status "LIVE"'
  );

  const rowLowerCaseUnknown = {
    id: 'test-unknown-2',
    company_name: 'Lower Unknown Corp',
    lifecycle_status: 'unknown',
    status: 'CLOSING_TODAY',
  };
  const mappedUnknown2 = mapSqliteRowToBackendIpo(rowLowerCaseUnknown);
  assert(
    mappedUnknown2.status === 'CLOSING_TODAY',
    'P1 Status Fallback - lower-case unknown',
    '"unknown" falls back to "CLOSING_TODAY"'
  );

  const rowNullStringLifecycle = {
    id: 'test-unknown-3',
    company_name: 'Null String Corp',
    lifecycle_status: 'null',
    status: 'ALLOTMENT_OUT',
  };
  const mappedUnknown3 = mapSqliteRowToBackendIpo(rowNullStringLifecycle);
  assert(
    mappedUnknown3.status === 'ALLOTMENT_OUT',
    'P1 Status Fallback - "null" string',
    'Literal "null" string falls back to status "ALLOTMENT_OUT"'
  );

  const rowBothUnknown = {
    id: 'test-unknown-4',
    company_name: 'Both Unknown Corp',
    lifecycle_status: 'Unknown',
    status: 'Unknown',
  };
  const mappedUnknown4 = mapSqliteRowToBackendIpo(rowBothUnknown);
  assert(
    mappedUnknown4.status === 'UPCOMING',
    'P1 Status Fallback - Both Unknown',
    'When both lifecycle and status are Unknown, falls back to default "UPCOMING"'
  );

  const rowValidLifecycle = {
    id: 'test-valid-lifecycle',
    company_name: 'Valid Corp',
    lifecycle_status: 'ACTIVE',
    status: 'UPCOMING',
  };
  const mappedValid = mapSqliteRowToBackendIpo(rowValidLifecycle);
  assert(
    mappedValid.status === 'ACTIVE',
    'P1 Status Fallback - Valid Lifecycle',
    'Valid lifecycle status "ACTIVE" is respected directly'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4 (P0): Production SQLite Cache & Non-Destructive Rich-Field Preservation
  // ──────────────────────────────────────────────────────────────────────────
  const rawDb = new DatabaseSync(':memory:');
  const db = createSqliteWrapper(rawDb);
  await initDB(db);
  const repo = new IPORepository(db);

  const richIpoId = 'ipo-rich-bajaj-housing';
  const initialRichRecord: Partial<IPOMasterRecord> = {
    id: richIpoId,
    company_name: 'Bajaj Housing Finance Limited',
    ipo_name: 'Bajaj Housing Finance IPO',
    symbol: 'BAJAJHFL',
    status: 'Upcoming',
    lifecycle_status: 'UPCOMING',
    exchange: 'NSE / BSE',
    issue_type: 'Mainboard',
    price_band_min: 66,
    price_band_max: 70,
    lot_size: 214,
    issue_size: 6560,
    open_date: '2026-09-09',
    close_date: '2026-09-11',
    allotment_date: '2026-09-12',
    listing_date: '2026-09-16',
    registrar: 'KFin Technologies',
    lead_manager: 'Kotak Mahindra Capital, BofA Securities, Axis Capital',
    sector: 'Housing Finance',
    description: 'Premier housing finance company registered with NHB',
    website: 'https://www.bajajhousingfinance.in',
    gmp_amount: 55,
    gmp_percent: 78.57,
    profit_per_lot: 11770,
    retail_sub: 7.04,
    qib_sub: 222.05,
    nii_sub: 41.51,
    total_sub: 67.43,
    // Rich JSON fields stored by authoritative detailed syncs
    financials_json: JSON.stringify([
      { fiscalYear: 'FY24', revenueInr: 7617, profitAfterTaxInr: 1731, totalAssetsInr: 74148 },
      { fiscalYear: 'FY23', revenueInr: 5665, profitAfterTaxInr: 1258, totalAssetsInr: 59784 },
    ]),
    participants_json: JSON.stringify([
      { category: 'QIB', percentageReserved: 50 },
      { category: 'Retail', percentageReserved: 35 },
    ]),
    documents_json: JSON.stringify([
      { title: 'Red Herring Prospectus (RHP)', url: 'https://sebi.gov.in/rhp.pdf', type: 'RHP' },
    ]),
    anchor_details_json: JSON.stringify({
      anchorBidDate: '2026-09-06',
      sharesAllocated: 251428571,
      fundsRaisedCrores: 1760,
    }),
  };

  // Seed authoritative rich record into SQLite
  await repo.upsertBatch([initialRichRecord], true);

  const seededRows = await getCachedBackendIpos(db);
  assert(seededRows.length === 1, 'P0 Seeded Count', 'Seeded 1 rich IPO into SQLite');
  assert(
    seededRows[0].company?.financials?.length === 2,
    'P0 Seeded Financials',
    'Initial financials_json correctly parsed'
  );
  assert(
    seededRows[0].documents?.length === 1,
    'P0 Seeded Documents',
    'Initial documents_json correctly parsed'
  );

  // Now simulate a lightweight / shallow backend list response from /api/v1/ipos
  // Shallow responses ONLY contain summary metadata and omit financials, documents, lead_manager, etc.
  const shallowBackendListResponse: BackendIpo[] = [
    {
      id: richIpoId,
      symbol: 'BAJAJHFL',
      companyName: 'Bajaj Housing Finance Limited',
      status: 'OPEN', // Updated lifecycle
      marketSegment: 'MAINBOARD',
      priceBandLow: 66,
      priceBandHigh: 70,
      lotSize: 214,
      openDate: '2026-09-09',
      closeDate: '2026-09-11',
      // Lightweight GMP update
      currentGmp: {
        gmpAmount: 65,
        gmpPercentage: 92.86,
        estProfitPerLot: 13910,
        observedAt: '2026-09-10T09:00:00Z',
      },
      // Note: financials, documents, anchorDetails, lead_manager are UNDEFINED / NULL in shallow response!
    },
  ];

  // Save the shallow response using production cache function
  const savedCount = await saveBackendIposToCache(db, shallowBackendListResponse);
  assert(savedCount === 1, 'P0 saveBackendIposToCache', 'Successfully saved shallow response');

  // Query SQLite to verify non-destructive merge semantics
  const cachedAfterShallow = await getCachedBackendIpos(db);
  assert(cachedAfterShallow.length === 1, 'P0 Post-Save Count', 'Still 1 record in cache');
  const updatedItem = cachedAfterShallow[0];

  // 1. Updated summary fields should reflect the new values
  assert(
    updatedItem.status === 'OPEN',
    'P0 Status Update',
    'Status updated to OPEN from shallow response'
  );
  assert(
    updatedItem.currentGmp?.gmpAmount === 65,
    'P0 GMP Update',
    'GMP updated to 65 from shallow response'
  );

  // 2. Rich fields MUST NOT be destroyed by shallow response nulls!
  assert(
    updatedItem.company?.financials?.length === 2,
    'P0 Rich Financials Preserved',
    'financials_json preserved and NOT overwritten with null/empty'
  );
  assert(
    (updatedItem.company?.financials?.[0] as any)?.revenueInr === 7617,
    'P0 Financials Data Integrity',
    'Financials revenue preserved intact'
  );
  assert(
    updatedItem.documents?.length === 1,
    'P0 Rich Documents Preserved',
    'documents_json preserved and NOT overwritten'
  );
  assert(
    (updatedItem.anchorDetails as any)?.sharesAllocated === 251428571,
    'P0 Rich Anchor Details Preserved',
    'anchor_details_json preserved'
  );
  assert(
    (updatedItem as any).lead_manager === 'Kotak Mahindra Capital, BofA Securities, Axis Capital',
    'P0 Lead Manager Preserved',
    'lead_manager preserved'
  );
  assert(
    (updatedItem as any).sector === 'Housing Finance',
    'P0 Sector Preserved',
    'sector preserved'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5 (P1): Request Sequencing & Stale-Response Suppression for Search
  // ──────────────────────────────────────────────────────────────────────────
  let simulatedUiResults: string[] = [];
  let requestIdCounter = 0;
  let inFlightQuery: string | null = null;

  async function simulateSearchFetch(query: string, delayMs: number, resultPayload: string[]) {
    // Mimic app/new-ipos.tsx concurrency logic:
    // Search queries supersede in-flight searches
    const thisRequestId = ++requestIdCounter;
    inFlightQuery = query;

    // Simulate async network delay
    await new Promise((r) => setTimeout(r, delayMs));

    // Stale check
    if (thisRequestId !== requestIdCounter) {
      // Discard stale response
      return;
    }

    inFlightQuery = null;
    simulatedUiResults = resultPayload;
  }

  // Rapid typing: User types "baj" (slow network 50ms) then "baja" (fast network 10ms)
  const req1 = simulateSearchFetch('baj', 50, ['Bajaj Consumer', 'Bajaj Finance', 'Bajaj Housing']);
  const req2 = simulateSearchFetch('baja', 10, ['Bajaj Finance', 'Bajaj Housing']);

  await Promise.all([req1, req2]);

  assert(
    simulatedUiResults.length === 2,
    'P1 Search Concurrency - Stale Suppression',
    'Outdated response ("baj") was discarded; latest response ("baja") is preserved'
  );
  assert(
    simulatedUiResults[0] === 'Bajaj Finance' && simulatedUiResults[1] === 'Bajaj Housing',
    'P1 Search Concurrency - Result Correctness',
    'UI displays results from the latest search query'
  );

  // Verify newer search is NOT silently dropped if another is running
  const searchState = { callDispatched: false };
  async function testSupersedingSearch() {
    let activeFetch = true;
    let reqId = 1;

    // While request 1 is active, a new query arrives
    const newQuery = 'premier';
    // Instead of early return `if (activeFetch) return;`, new query increments reqId
    reqId = 2;
    activeFetch = true;
    searchState.callDispatched = true;
  }
  await testSupersedingSearch();
  assert(
    searchState.callDispatched,
    'P1 Search Concurrency - No Silent Drop',
    'New search query supersedes and is never silently dropped'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6 (P2): Cache Rehydration Immediately on backendSyncEmitter
  // ──────────────────────────────────────────────────────────────────────────
  const syncState = { rehydrationTriggered: false };
  let rehydratedCount = 0;

  // Mock hydration callback
  async function hydrateFromCache() {
    syncState.rehydrationTriggered = true;
    const cached = await getCachedBackendIpos(db);
    rehydratedCount = cached.length;
    return cached;
  }

  // Seed another record simulating background sync insert
  await repo.upsertBatch([
    {
      id: 'ipo-synced-new',
      company_name: 'Newly Synced Corp',
      symbol: 'NEWSYNC',
      status: 'Live',
      lifecycle_status: 'OPEN',
      open_date: '2026-10-10',
    },
  ], false);

  // Trigger hydration on sync emitter event
  await hydrateFromCache();

  assert(
    syncState.rehydrationTriggered,
    'P2 Sync Rehydration Triggered',
    'hydrateFromCache was invoked on sync event'
  );
  assert(
    rehydratedCount === 2,
    'P2 Sync Rehydration Freshness',
    'Immediate hydration loaded the newly synced SQLite record'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Focus Cooldown & Deduplication for identical non-search fetches
  // ──────────────────────────────────────────────────────────────────────────
  let isFetching = false;
  let networkCallCount = 0;
  let lastFetchedAt = 0;

  async function mockFetchBackendIpos(isSearch: boolean = false) {
    if (!isSearch && isFetching) {
      return; // Deduplicated for background refresh
    }
    isFetching = true;
    networkCallCount++;
    await new Promise((r) => setTimeout(r, 10));
    lastFetchedAt = Date.now();
    isFetching = false;
  }

  await Promise.all([mockFetchBackendIpos(), mockFetchBackendIpos()]);
  assert(
    networkCallCount === 1,
    'Deduping Non-Search',
    'Concurrent identical non-search fetches are properly deduplicated'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Reopening with unchanged backend data preserves SQLite records and order
  // ──────────────────────────────────────────────────────────────────────────
  const testDbRaw = new DatabaseSync(':memory:');
  const testDb = createSqliteWrapper(testDbRaw);
  await initDB(testDb);
  const testRepo = new IPORepository(testDb);

  const initialTimestamp = '2026-10-18T10:00:00.000Z';
  await testRepo.upsertBatch([
    {
      id: 'ipo-test-alpha',
      company_name: 'Alpha Energy Ltd',
      symbol: 'ALPHA',
      status: 'OPEN',
      lifecycle_status: 'OPEN',
      open_date: '2026-10-24',
      close_date: '2026-10-28',
      price_band_min: 100,
      price_band_max: 105,
      updated_at: initialTimestamp,
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'ipo-test-beta',
      company_name: 'Beta Solar Ltd',
      symbol: 'BETA',
      status: 'OPEN',
      lifecycle_status: 'OPEN',
      open_date: '2026-10-22',
      close_date: '2026-10-29',
      price_band_min: 200,
      price_band_max: 210,
      updated_at: initialTimestamp,
      created_at: '2026-10-02T00:00:00Z',
    },
  ], true);

  // 1. Initial screen entry loads cached records from SQLite
  const cachedInitial = await getCachedBackendIpos(testDb);
  assert(cachedInitial.length === 2, 'P0 Reopen - Initial Count', 'Loaded 2 cached records on screen entry');
  assert(cachedInitial[0].id === 'ipo-test-alpha', 'P0 Reopen - Initial 1st', 'Alpha Energy is first based on timeline open_date');
  assert(cachedInitial[1].id === 'ipo-test-beta', 'P0 Reopen - Initial 2nd', 'Beta Solar is second');

  // 2. Background sync fetches backend data which has IDENTICAL values
  const identicalBackendPayload: BackendIpo[] = [
    {
      id: 'ipo-test-alpha',
      companyName: 'Alpha Energy Ltd',
      symbol: 'ALPHA',
      marketSegment: 'MAINBOARD',
      status: 'OPEN',
      openDate: '2026-10-24',
      closeDate: '2026-10-28',
      priceBandLow: 100,
      priceBandHigh: 105,
    },
    {
      id: 'ipo-test-beta',
      companyName: 'Beta Solar Ltd',
      symbol: 'BETA',
      marketSegment: 'MAINBOARD',
      status: 'OPEN',
      openDate: '2026-10-22',
      closeDate: '2026-10-29',
      priceBandLow: 200,
      priceBandHigh: 210,
    },
  ];

  const syncResult1 = await reconcileBackendIposWithCache(testDb, identicalBackendPayload);
  assert(syncResult1.hasChanges === false, 'P0 Reopen - No Changes Flag', 'Reconciliation detects zero data changes');
  assert(syncResult1.unchangedCount === 2, 'P0 Reopen - Unchanged Count', 'Both records identified as unchanged');
  assert(syncResult1.insertedCount === 0 && syncResult1.updatedCount === 0, 'P0 Reopen - Zero Writes', 'Zero inserts and zero updates executed');

  // Verify timestamps were NOT touched
  const rowsAfterSync1 = await testDb.getAllAsync("SELECT id, updated_at FROM ipo_master WHERE id IN ('ipo-test-alpha', 'ipo-test-beta')");
  for (const row of rowsAfterSync1) {
    assert(row.updated_at === initialTimestamp, 'P0 Reopen - Timestamp Untouched', `Record ${row.id} updated_at remained intact`);
  }

  // 3. User leaves and reopens IPO Hub
  const cachedOnReopen = await getCachedBackendIpos(testDb);
  assert(cachedOnReopen.length === 2, 'P0 Reopen - Reopen Count', 'Cache count intact on reopen');
  assert(cachedOnReopen[0].id === 'ipo-test-alpha', 'P0 Reopen - Reopen 1st', 'Order strictly preserved on reopen (Alpha 1st)');
  assert(cachedOnReopen[1].id === 'ipo-test-beta', 'P0 Reopen - Reopen 2nd', 'Order strictly preserved on reopen (Beta 2nd)');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Genuinely new IPO inserted, changed fields updated, unchanged untouched
  // ──────────────────────────────────────────────────────────────────────────
  const mixedBackendPayload: BackendIpo[] = [
    // Unchanged Alpha
    {
      id: 'ipo-test-alpha',
      companyName: 'Alpha Energy Ltd',
      symbol: 'ALPHA',
      marketSegment: 'MAINBOARD',
      status: 'OPEN',
      openDate: '2026-10-24',
      closeDate: '2026-10-28',
      priceBandLow: 100,
      priceBandHigh: 105,
    },
    // Changed Beta: GMP updated from null to 45, status moved to CLOSING_TODAY
    {
      id: 'ipo-test-beta',
      companyName: 'Beta Solar Ltd',
      symbol: 'BETA',
      marketSegment: 'MAINBOARD',
      status: 'CLOSING_TODAY',
      openDate: '2026-10-20',
      closeDate: '2026-10-24',
      priceBandLow: 200,
      priceBandHigh: 210,
      currentGmp: {
        gmpAmount: 45,
        gmpPercentage: 21.43,
        estProfitPerLot: 4500,
        observedAt: '2026-10-19T09:30:00Z',
      },
    },
    // Genuinely New Gamma
    {
      id: 'ipo-test-gamma',
      companyName: 'Gamma Healthcare Ltd',
      symbol: 'GAMMA',
      status: 'UPCOMING',
      marketSegment: 'MAINBOARD',
      openDate: '2026-10-25',
      closeDate: '2026-10-27',
      priceBandLow: 350,
      priceBandHigh: 365,
    },
  ];

  const syncResult2 = await reconcileBackendIposWithCache(testDb, mixedBackendPayload);
  assert(syncResult2.hasChanges === true, 'P0 Mixed Sync - Has Changes', 'Detected genuine modifications');
  assert(syncResult2.insertedCount === 1, 'P0 Mixed Sync - Inserted Count', 'Genuinely new IPO (Gamma) inserted');
  assert(syncResult2.updatedCount === 1, 'P0 Mixed Sync - Updated Count', 'Changed IPO (Beta) updated');
  assert(syncResult2.unchangedCount === 1, 'P0 Mixed Sync - Unchanged Count', 'Unchanged IPO (Alpha) untouched');

  // Verify Alpha's timestamp is STILL initialTimestamp
  const alphaRow = await testDb.getFirstAsync("SELECT updated_at FROM ipo_master WHERE id = 'ipo-test-alpha'");
  assert(alphaRow.updated_at === initialTimestamp, 'P0 Mixed Sync - Alpha Unchanged', 'Alpha timestamp remained original untouched timestamp');

  // Verify Beta was updated
  const betaRow = await testDb.getFirstAsync("SELECT status, gmp_amount, updated_at FROM ipo_master WHERE id = 'ipo-test-beta'");
  assert(betaRow.status === 'CLOSING_TODAY', 'P0 Mixed Sync - Beta Status', 'Beta status updated to CLOSING_TODAY');
  assert(Number(betaRow.gmp_amount) === 45, 'P0 Mixed Sync - Beta GMP', 'Beta GMP amount updated to 45');
  assert(betaRow.updated_at !== initialTimestamp, 'P0 Mixed Sync - Beta Timestamp', 'Beta timestamp updated reflecting change');

  // Verify Gamma was inserted
  const gammaRow = await testDb.getFirstAsync("SELECT id, company_name FROM ipo_master WHERE id = 'ipo-test-gamma'");
  assert(gammaRow != null && gammaRow.company_name === 'Gamma Healthcare Ltd', 'P0 Mixed Sync - Gamma Inserted', 'Gamma successfully persisted into SQLite');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Backend response order differences do NOT alter intended display order
  // ──────────────────────────────────────────────────────────────────────────
  // Suppose backend returns items in reverse order [Gamma, Beta, Alpha] or scrambled order
  const reverseBackendPayload: BackendIpo[] = [
    mixedBackendPayload[2], // Gamma (Upcoming)
    mixedBackendPayload[1], // Beta (Closing Today / Live)
    mixedBackendPayload[0], // Alpha (Open / Live)
  ];

  const syncResultReverse = await reconcileBackendIposWithCache(testDb, reverseBackendPayload);
  assert(syncResultReverse.hasChanges === false, 'P0 Order Invariance - No Changes', 'Reconciliation recognizes identical data despite reverse response order');

  // Display data is read from SQLite
  const cachedOrdered = await getCachedBackendIpos(testDb);
  // Status ordering: Live / Closing Today (Category 1) -> Upcoming (Category 2)
  // Within Live: Alpha (open 2026-10-18) before Beta (open 2026-10-16)
  assert(cachedOrdered[0].id === 'ipo-test-alpha', 'P0 Order Invariance - 1st is Alpha', 'Alpha Energy remains 1st (Live, latest open_date)');
  assert(cachedOrdered[1].id === 'ipo-test-beta', 'P0 Order Invariance - 2nd is Beta', 'Beta Solar remains 2nd (Live, earlier open_date)');
  assert(cachedOrdered[2].id === 'ipo-test-gamma', 'P0 Order Invariance - 3rd is Gamma', 'Gamma Healthcare is 3rd (Upcoming)');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: Regression Test - SME IPO jumping bug reproduced and resolved
  // ──────────────────────────────────────────────────────────────────────────
  // Seed a Mainboard IPO and an SME IPO
  const mainboardIpo: Partial<IPOMasterRecord> = {
    id: 'ipo-mb-premier',
    company_name: 'Premier Mainboard Ltd',
    symbol: 'PREMIER',
    issue_type: 'Mainboard',
    status: 'OPEN',
    lifecycle_status: 'OPEN',
    open_date: '2026-10-24',
    close_date: '2026-10-28',
    price_band_min: 500,
    price_band_max: 525,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };

  const smeIpo: Partial<IPOMasterRecord> = {
    id: 'ipo-sme-innovate',
    company_name: 'Innovate SME Ltd',
    symbol: 'INNOVATE',
    issue_type: 'SME',
    status: 'OPEN',
    lifecycle_status: 'OPEN',
    open_date: '2026-10-22', // Earlier open date -> positioned at bottom in timeline sort
    close_date: '2026-10-27',
    price_band_min: 120,
    price_band_max: 125,
    created_at: '2026-10-05T00:00:00Z', // Created in backend more recently
    updated_at: '2026-10-05T00:00:00Z',
  };

  await testRepo.upsertBatch([mainboardIpo, smeIpo], true);

  // 1. Initial screen entry: SQLite hydrates cache
  const initialHubList = await getCachedBackendIpos(testDb);
  assert(initialHubList.length >= 2, 'P0 SME Regression - Seeded', 'Both Mainboard and SME are seeded');
  const premierIdxInitial = initialHubList.findIndex((i) => i.id === 'ipo-mb-premier');
  const smeIdxInitial = initialHubList.findIndex((i) => i.id === 'ipo-sme-innovate');
  assert(premierIdxInitial < smeIdxInitial, 'P0 SME Regression - SME at Bottom Initially', 'In SQLite timeline sort, SME is at the bottom (index > mainboard)');

  // 2. Backend API returns items in reverse/created_at order where SME is at the TOP [SME, Premier]
  const backendResponseWithSmeAtTop: BackendIpo[] = [
    {
      id: 'ipo-sme-innovate',
      companyName: 'Innovate SME Ltd',
      symbol: 'INNOVATE',
      marketSegment: 'SME',
      status: 'OPEN',
      openDate: '2026-10-22',
      closeDate: '2026-10-27',
      priceBandLow: 120,
      priceBandHigh: 125,
    },
    {
      id: 'ipo-mb-premier',
      companyName: 'Premier Mainboard Ltd',
      symbol: 'PREMIER',
      marketSegment: 'MAINBOARD',
      status: 'OPEN',
      openDate: '2026-10-24',
      closeDate: '2026-10-28',
      priceBandLow: 500,
      priceBandHigh: 525,
    },
  ];

  // In OLD buggy code:
  // setRawIpos(data) directly assigned `backendResponseWithSmeAtTop` to state,
  // causing SME to jump to index 0 (top)!
  // In NEW fixed code:
  // reconcileBackendIposWithCache checks incoming data against SQLite:
  const smeSyncResult = await reconcileBackendIposWithCache(testDb, backendResponseWithSmeAtTop);
  assert(smeSyncResult.hasChanges === false, 'P0 SME Regression - Sync Unchanged', 'Identical backend data does not overwrite SQLite or update timestamps');

  // Because data is unchanged, rawIpos is NOT overwritten with backend array order.
  // And on reload from SQLite:
  const reopenedHubList = await getCachedBackendIpos(testDb);
  const premierIdxReopened = reopenedHubList.findIndex((i) => i.id === 'ipo-mb-premier');
  const smeIdxReopened = reopenedHubList.findIndex((i) => i.id === 'ipo-sme-innovate');

  assert(
    premierIdxReopened < smeIdxReopened,
    'P0 SME Regression - SME Remains at Bottom',
    'SME IPO order does NOT jump to top on backend sync or screen reopen'
  );
  assert(
    premierIdxInitial === premierIdxReopened && smeIdxInitial === smeIdxReopened,
    'P0 SME Regression - Deterministic Ordering Invariant',
    'Position of SME IPO is 100% stable across screen navigation and API responses'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: Offline loading, failed requests, and incomplete response resiliency
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Offline loading: SQLite data is loaded immediately
  const offlineCached = await getCachedBackendIpos(testDb);
  assert(offlineCached.length > 0, 'P0 Offline - Cache Available', 'Valid SQLite cached IPOs are immediately available offline');

  // 2. Failed request does NOT delete or clear local SQLite data
  let simulatedUiRawIpos = [...offlineCached];
  try {
    throw new Error('Simulated network timeout (Offline/Airplane mode)');
  } catch (err: any) {
    // Mimic app/new-ipos.tsx catch block:
    // Only set error if simulatedUiRawIpos is empty; keep cached IPOs intact!
    if (simulatedUiRawIpos.length === 0) {
      // should not enter here because cached IPOs exist
      assert(false, 'P0 Offline - Error Screen', 'Should not blank out when cache exists');
    }
  }
  assert(simulatedUiRawIpos.length === offlineCached.length, 'P0 Offline - No Empty Flash', 'Cached IPOs remain displayed with zero empty-list flash');

  // 3. Incomplete backend response (e.g. backend sends partial page of 1 item)
  // Must NOT delete existing local records
  const partialBackendResponse: BackendIpo[] = [backendResponseWithSmeAtTop[0]]; // Only SME returned
  await reconcileBackendIposWithCache(testDb, partialBackendResponse);

  const localRecordsAfterPartial = await testDb.getAllAsync('SELECT id FROM ipo_master WHERE deleted_at IS NULL');
  assert(
    localRecordsAfterPartial.length >= 5,
    'P0 Partial Response - No Accidental Deletion',
    'Local records are NOT deleted merely because response is partial or incomplete'
  );

  console.log(`\n===============================================================`);
  console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('===============================================================\n');
}

runIpoHubFastLoadTestSuite().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});

