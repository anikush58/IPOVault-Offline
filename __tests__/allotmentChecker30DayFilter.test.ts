/**
 * Allotment Checker 30-Day IPO Filter and 4 Latest Quick Check Cards Test Suite
 */

import {
  isIpoWithin30Days,
  getLatestIpoActivityTimestamp,
  sortCheckerIposByAllotmentRecency,
  normalizeBackendIpoForChecker,
  isBackendIpoAllotmentEligible,
} from '../services/allotment/allotmentCheckerIpoSource';
import { BackendIpo } from '../types/backend-ipo';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export function run30DayFilterTestSuite() {
  console.log('========================================================================');
  console.log('RUNNING ALLOTMENT CHECKER 30-DAY FILTER & QUICK CHECK SUITE');
  console.log('========================================================================\n');

  const now = Date.parse('2026-10-29T12:00:00Z');
  const oneDayMs = 24 * 60 * 60 * 1000;

  // 1. Recent IPO (Allotment 5 days ago)
  const recentIpo: BackendIpo = {
    id: 'ipo-recent-1',
    symbol: 'RECENT',
    companyName: 'Recent Tech Ltd',
    status: 'ALLOTMENT_OUT',
    allotmentDate: new Date(now - 5 * oneDayMs).toISOString(),
    closeDate: new Date(now - 8 * oneDayMs).toISOString(),
    priceBandHigh: 250,
  } as any;

  assert(
    isIpoWithin30Days(recentIpo, now) === true,
    'Recent IPO (5 days ago)',
    'Should be included within last 30 days'
  );

  // 2. Old IPO (Allotment 45 days ago)
  const oldIpo: BackendIpo = {
    id: 'ipo-old-1',
    symbol: 'OLD',
    companyName: 'Old Steel Ltd',
    status: 'LISTED',
    allotmentDate: new Date(now - 45 * oneDayMs).toISOString(),
    listingDate: new Date(now - 42 * oneDayMs).toISOString(),
    closeDate: new Date(now - 48 * oneDayMs).toISOString(),
    priceBandHigh: 120,
  } as any;

  assert(
    isIpoWithin30Days(oldIpo, now) === false,
    'Old IPO (45 days ago)',
    'Should be excluded because it is older than 30 days'
  );

  // 3. Boundary IPO: Closed 35 days ago, but listed 20 days ago
  const boundaryListingIpo: BackendIpo = {
    id: 'ipo-boundary-1',
    symbol: 'BOUND',
    companyName: 'Boundary Tech Ltd',
    status: 'LISTED',
    closeDate: new Date(now - 35 * oneDayMs).toISOString(),
    allotmentDate: new Date(now - 24 * oneDayMs).toISOString(),
    listingDate: new Date(now - 20 * oneDayMs).toISOString(),
    priceBandHigh: 500,
  } as any;

  assert(
    isIpoWithin30Days(boundaryListingIpo, now) === true,
    'Boundary IPO (Listed 20 days ago)',
    'Should be included based on latest activity date'
  );

  // 4. Future / Today IPO (Allotment tomorrow)
  const futureIpo: BackendIpo = {
    id: 'ipo-future-1',
    symbol: 'FUTURE',
    companyName: 'Future Energy Ltd',
    status: 'ALLOTMENT_OUT',
    allotmentDate: new Date(now + 1 * oneDayMs).toISOString(),
    priceBandHigh: 310,
  } as any;

  assert(
    isIpoWithin30Days(futureIpo, now) === true,
    'Future/Today IPO',
    'Should be included within active allotment window'
  );

  // 5. Filter list test: 6 IPOs (2 older than 30 days, 4 within 30 days)
  const mockIpos: BackendIpo[] = [
    {
      id: 'ipo-1',
      symbol: 'IPO1',
      companyName: 'Alpha Tech',
      status: 'ALLOTMENT_OUT',
      allotmentDate: new Date(now - 2 * oneDayMs).toISOString(),
    } as any,
    {
      id: 'ipo-2',
      symbol: 'IPO2',
      companyName: 'Beta Solar',
      status: 'ALLOTMENT_OUT',
      allotmentDate: new Date(now - 6 * oneDayMs).toISOString(),
    } as any,
    {
      id: 'ipo-3',
      symbol: 'IPO3',
      companyName: 'Gamma Healthcare',
      status: 'LISTED',
      allotmentDate: new Date(now - 12 * oneDayMs).toISOString(),
    } as any,
    {
      id: 'ipo-4',
      symbol: 'IPO4',
      companyName: 'Delta Infra',
      status: 'ALLOTMENT_OUT',
      allotmentDate: new Date(now - 20 * oneDayMs).toISOString(),
    } as any,
    {
      id: 'ipo-5-old',
      symbol: 'IPO5',
      companyName: 'Epsilon Old',
      status: 'LISTED',
      allotmentDate: new Date(now - 35 * oneDayMs).toISOString(),
      listingDate: new Date(now - 32 * oneDayMs).toISOString(),
    } as any,
    {
      id: 'ipo-6-very-old',
      symbol: 'IPO6',
      companyName: 'Zeta Ancient',
      status: 'LISTED',
      allotmentDate: new Date(now - 90 * oneDayMs).toISOString(),
    } as any,
  ];

  const eligible = mockIpos.filter((b) => isBackendIpoAllotmentEligible(b) && isIpoWithin30Days(b, now));
  assert(eligible.length === 4, 'Filtered Count', `Expected exactly 4 IPOs, got ${eligible.length}`);
  assert(!eligible.some((i) => i.id === 'ipo-5-old'), 'Exclude Old 1', 'ipo-5-old must not be in list');
  assert(!eligible.some((i) => i.id === 'ipo-6-very-old'), 'Exclude Old 2', 'ipo-6-very-old must not be in list');

  const sorted = sortCheckerIposByAllotmentRecency(eligible).map(normalizeBackendIpoForChecker);
  const quickCheckCards = sorted.slice(0, 4);

  assert(quickCheckCards.length === 4, 'Quick Check Cards Count', `Expected 4 quick check cards, got ${quickCheckCards.length}`);
  assert(quickCheckCards[0].id === 'ipo-1', 'Recency Order 1', 'Newest (Alpha Tech) should be first');
  assert(quickCheckCards[1].id === 'ipo-2', 'Recency Order 2', 'Second newest (Beta Solar) should be second');
  assert(quickCheckCards[2].id === 'ipo-3', 'Recency Order 3', 'Third (Gamma Healthcare) should be third');
  assert(quickCheckCards[3].id === 'ipo-4', 'Recency Order 4', 'Fourth (Delta Infra) should be fourth');

  console.log('\n========================================================================');
  console.log('ALL 30-DAY FILTER & QUICK CHECK TESTS PASSED WITH ZERO FAILURES');
  console.log('========================================================================\n');
}

run30DayFilterTestSuite();

