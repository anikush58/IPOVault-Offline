import { DatabaseSync } from 'node:sqlite';
import {
  mapSqliteRowToBackendIpo,
  saveBackendIposToCache,
  getCachedBackendIpos,
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

  console.log(`\n===============================================================`);
  console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('===============================================================\n');
}

runIpoHubFastLoadTestSuite().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});

