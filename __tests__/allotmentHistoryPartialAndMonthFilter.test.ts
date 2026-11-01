import {
  AllotmentHistoryItem,
  getAllotmentItemMonth,
  getAllotmentItemMonthYear,
  filterAllotmentHistoryByMonth,
  generateMonthChips,
  MONTH_NAMES_SHORT,
  compareAllotmentHistory,
} from '../utils/allotmentHistoryUtils';
import { mapRegistrarCategory } from '../utils/allotmentCategoryUtils';

function assert(condition: boolean, testName: string, detail: string) {
  if (!condition) {
    console.error(`❌ FAIL: [${testName}] - ${detail}`);
    throw new Error(`Test failed: [${testName}] - ${detail}`);
  }
  console.log(`✓ PASS: [${testName}] ${detail}`);
}

console.log('========================================================================');
console.log('RUNNING ALLOTMENT HISTORY PARTIAL ALLOTMENT & MONTH FILTER TEST SUITE');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// Test 1: Month extraction from various date formats
// -----------------------------------------------------------------------------
const octItem: AllotmentHistoryItem = {
  id: 'h_oct',
  ipoName: 'Jio Platforms',
  userName: 'Test User',
  pan: 'ABCDE1234F',
  status: 'PARTIALLY_ALLOTTED',
  sharesAllotted: 12,
  category: 'SHAREHOLDER',
  checkedAt: '2026-10-29T13:45:00.000Z',
  checkedAtFormatted: '29 Oct 2026',
};

const novItem: AllotmentHistoryItem = {
  id: 'h_nov',
  ipoName: 'Tata Tech',
  userName: 'Test User',
  pan: 'ABCDE1234F',
  status: 'ALLOTTED',
  sharesAllotted: 30,
  category: 'RETAIL',
  checkedAt: '2026-11-04T10:00:00.000Z',
  checkedAtFormatted: '4 Nov 2026',
};

const decItem: AllotmentHistoryItem = {
  id: 'h_dec',
  ipoName: 'Swiggy',
  userName: 'Test User',
  pan: 'ABCDE1234F',
  status: 'ALLOTTED',
  sharesAllotted: 14,
  category: 'RETAIL',
  ipoOpenDate: '2026-12-05',
  checkedAtFormatted: '5 Dec 2026',
};

const missingDateItem: AllotmentHistoryItem = {
  id: 'h_none',
  ipoName: 'Unknown Corp',
  userName: 'Test User',
  pan: 'ABCDE1234F',
  status: 'ALLOTTED',
  sharesAllotted: 10,
};

assert(getAllotmentItemMonth(octItem) === 'Oct', 'Month Extract Oct', 'checkedAt in October resolves to Oct');
assert(getAllotmentItemMonth(novItem) === 'Nov', 'Month Extract Nov', 'checkedAt in November resolves to Nov');
assert(getAllotmentItemMonth(decItem) === 'Dec', 'Month Extract Dec', 'ipoOpenDate in December resolves to Dec');
assert(getAllotmentItemMonth(missingDateItem) === null, 'Month Extract None', 'Missing date resolves to null gracefully');

// -----------------------------------------------------------------------------
// Test 2: Month filtering (All, Oct, Nov, Dec, others)
// -----------------------------------------------------------------------------
const allHistory = [octItem, novItem, decItem];

const filteredAll = filterAllotmentHistoryByMonth(allHistory, 'all');
assert(filteredAll.length === 3, 'Filter All', 'Option "all" returns all 3 items');

const filteredAllUpper = filterAllotmentHistoryByMonth(allHistory, 'ALL');
assert(filteredAllUpper.length === 3, 'Filter ALL Upper', 'Option "ALL" case-insensitive returns 3 items');

const filteredOct = filterAllotmentHistoryByMonth(allHistory, 'oct');
assert(filteredOct.length === 1 && filteredOct[0].id === 'h_oct', 'Filter Oct', 'Filtering by Oct returns only Jio Platforms');

const filteredNov = filterAllotmentHistoryByMonth(allHistory, 'Nov');
assert(filteredNov.length === 1 && filteredNov[0].id === 'h_nov', 'Filter Nov', 'Filtering by Nov returns only Tata Tech');

const filteredDec = filterAllotmentHistoryByMonth(allHistory, 'dec');
assert(filteredDec.length === 1 && filteredDec[0].id === 'h_dec', 'Filter Dec', 'Filtering by Dec returns only Swiggy');

const filteredJan = filterAllotmentHistoryByMonth(allHistory, 'jan');
assert(filteredJan.length === 0, 'Filter Jan Empty', 'Filtering by empty month Jan returns 0 items');

// -----------------------------------------------------------------------------
// Test 3: Month chips list integrity & MMM YY Formatting (Jan 26, Jan 27, etc.)
// -----------------------------------------------------------------------------
assert(MONTH_NAMES_SHORT.length === 12, '12 Months', 'MONTH_NAMES_SHORT has all 12 calendar months');
assert(MONTH_NAMES_SHORT.includes('Oct'), 'Contains Oct', 'MONTH_NAMES_SHORT contains Oct');
assert(MONTH_NAMES_SHORT.includes('Nov'), 'Contains Nov', 'MONTH_NAMES_SHORT contains Nov');
assert(MONTH_NAMES_SHORT.includes('Dec'), 'Contains Dec', 'MONTH_NAMES_SHORT contains Dec');

const jan26Item: AllotmentHistoryItem = {
  id: 'h_jan26',
  ipoName: 'Jyoti CNC',
  userName: 'Test User',
  pan: 'ABCDE1234F',
  status: 'ALLOTTED',
  sharesAllotted: 30,
  checkedAt: '2026-01-16T12:00:00.000Z',
  checkedAtFormatted: '16 Jan 2026',
};

const jan27Item: AllotmentHistoryItem = {
  id: 'h_jan27',
  ipoName: 'Future Tech 2027',
  userName: 'Test User',
  pan: 'ABCDE1234F',
  status: 'ALLOTTED',
  sharesAllotted: 25,
  checkedAt: '2027-01-10T12:00:00.000Z',
  checkedAtFormatted: '10 Jan 2027',
};

const myOct = getAllotmentItemMonthYear(octItem);
assert(myOct !== null && myOct.label === 'Oct 26' && myOct.key === 'oct-26', 'Extract Oct 26', 'October 2026 formatted as Oct 26');

const myNov = getAllotmentItemMonthYear(novItem);
assert(myNov !== null && myNov.label === 'Nov 26' && myNov.key === 'nov-26', 'Extract Nov 26', 'November 2026 formatted as Nov 26');

const myJan26 = getAllotmentItemMonthYear(jan26Item);
assert(myJan26 !== null && myJan26.label === 'Jan 26' && myJan26.key === 'jan-26', 'Extract Jan 26', 'January 2026 formatted as Jan 26');

const myJan27 = getAllotmentItemMonthYear(jan27Item);
assert(myJan27 !== null && myJan27.label === 'Jan 27' && myJan27.key === 'jan-27', 'Extract Jan 27', 'January 2027 formatted as Jan 27');

// Multi-year filter precision:
const multiYearHistory = [octItem, novItem, decItem, jan26Item, jan27Item];
const filteredJan26 = filterAllotmentHistoryByMonth(multiYearHistory, 'Jan 26');
assert(filteredJan26.length === 1 && filteredJan26[0].id === 'h_jan26', 'Filter Jan 26', 'Filtering by Jan 26 matches only 2026 item');

const filteredJan27 = filterAllotmentHistoryByMonth(multiYearHistory, 'Jan 27');
assert(filteredJan27.length === 1 && filteredJan27[0].id === 'h_jan27', 'Filter Jan 27', 'Filtering by Jan 27 matches only 2027 item');

const filteredKeyOct26 = filterAllotmentHistoryByMonth(multiYearHistory, 'oct-26');
assert(filteredKeyOct26.length === 1 && filteredKeyOct26[0].id === 'h_oct', 'Filter Key oct-26', 'Filtering by key oct-26 matches Oct 2026 item');

// -----------------------------------------------------------------------------
// Test 3b: generateMonthChips with Exact Descending Window (Current Down to Install)
// Specification:
// "suppose I installed the app in Oct, then show only one chip for months, Oct 26,
// as no need to show future chips as they will not have any data.
// New Chip arrangement: All sticky as it is, then current month. All (Count) | Oct 26 (count).
// what will I see in Dec 26: All (Count) | Dec 26 (Count) Nov 26 (Count) Oct 26 (Count),
// only Oct when I installed the app in Oct."
// -----------------------------------------------------------------------------
const refDateOct2026 = new Date(2026, 9, 30);
const installDateOct2026 = new Date(2026, 9, 1);

// Scenario 1: Installed in Oct 2026, viewed in Oct 2026 -> ONLY ONE month chip: Oct 26
const chipsOctOnly = generateMonthChips([octItem], refDateOct2026, installDateOct2026);
assert(chipsOctOnly.length === 1, 'Installed Oct (viewed Oct): Exactly 1 Chip', 'Only 1 chip generated for Oct 26');
assert(chipsOctOnly[0].key === 'oct-26', 'Installed Oct: Chip is Oct 26', 'First chip is oct-26');
assert(chipsOctOnly[0].label === 'Oct 26', 'Installed Oct: Label is Oct 26', 'Chip label is Oct 26');
assert(chipsOctOnly[0].count === 1, 'Installed Oct: Count is 1', 'Oct 26 count is 1 (Jio Platforms)');
assert(chipsOctOnly[0].isCurrent === true, 'Installed Oct: isCurrent Flag', 'Oct 26 isCurrent is true');
assert(!chipsOctOnly.some((c) => c.label === 'Nov 26'), 'No Future Nov 26', 'No future chip Nov 26 when viewed in Oct');
assert(!chipsOctOnly.some((c) => c.label === 'Sep 26'), 'No Prior Sep 26', 'No prior chip Sep 26 when installed in Oct');

// Scenario 2: Installed in Oct 2026, viewed in Dec 2026 -> Dec 26 (Count) Nov 26 (Count) Oct 26 (Count)
const refDateDec2026 = new Date(2026, 11, 15);
const octNovDecHistory = [octItem, novItem, decItem];
const chipsDecViewed = generateMonthChips(octNovDecHistory, refDateDec2026, installDateOct2026);

assert(chipsDecViewed.length === 3, 'Dec 26 View: Exactly 3 Chips', 'Exactly 3 chips: Dec 26, Nov 26, Oct 26');
assert(chipsDecViewed[0].label === 'Dec 26', 'Dec 26 View: 1st Chip Dec 26', '1st chip is Dec 26');
assert(chipsDecViewed[0].isCurrent === true, 'Dec 26 View: Dec 26 isCurrent', 'Dec 26 has isCurrent = true');
assert(chipsDecViewed[0].count === 1, 'Dec 26 View: Dec 26 Count 1', 'Dec 26 has count = 1');

assert(chipsDecViewed[1].label === 'Nov 26', 'Dec 26 View: 2nd Chip Nov 26', '2nd chip is Nov 26');
assert(chipsDecViewed[1].count === 1, 'Dec 26 View: Nov 26 Count 1', 'Nov 26 has count = 1');

assert(chipsDecViewed[2].label === 'Oct 26', 'Dec 26 View: 3rd Chip Oct 26', '3rd chip is Oct 26');
assert(chipsDecViewed[2].count === 1, 'Dec 26 View: Oct 26 Count 1', 'Oct 26 has count = 1');

assert(!chipsDecViewed.some((c) => c.label === 'Jan 27'), 'Dec 26 View: No Jan 27', 'No future Jan 27 chip in Dec 26');
assert(!chipsDecViewed.some((c) => c.label === 'Sep 26'), 'Dec 26 View: No Sep 26', 'Stops at Oct 26 because installed in Oct');

// Scenario 3: Installed in Jan 2027, viewed in Jan 2027 -> ONLY Jan 27
const refDateJan2027 = new Date(2027, 0, 15);
const installDateJan2027 = new Date(2027, 0, 1);
const chipsJanInstalled = generateMonthChips([], refDateJan2027, installDateJan2027);

assert(chipsJanInstalled.length === 1, 'Jan 27 View: Exactly 1 Chip', 'Only 1 chip in Jan 27');
assert(chipsJanInstalled[0].label === 'Jan 27', 'Jan 27 View: 1st Chip Jan 27', '1st chip is Jan 27');
assert(chipsJanInstalled[0].isCurrent === true, 'Jan 27 View: isCurrent', 'Jan 27 isCurrent = true');
assert(!chipsJanInstalled.some((c) => c.label === 'Dec 26'), 'Jan 27 View: No 2026 Months', 'No 2026 months when installed in Jan 2027');

// Scenario 4: Installed in Oct 2026, viewed in Jan 2027 -> Jan 27, Dec 26, Nov 26, Oct 26
const chipsJanViewedOctInstall = generateMonthChips(octNovDecHistory, refDateJan2027, installDateOct2026);
assert(chipsJanViewedOctInstall.length === 4, 'Jan 27 View (Oct Install): 4 Chips', '4 chips generated down to Oct 26');
assert(chipsJanViewedOctInstall[0].label === 'Jan 27', 'Jan 27 View: 1st Jan 27', '1st chip is Jan 27');
assert(chipsJanViewedOctInstall[3].label === 'Oct 26', 'Jan 27 View: 4th Oct 26', '4th chip is Oct 26');

// -----------------------------------------------------------------------------
// Test 4: Partial Allotment Shares Calculation (12 shares from 24 applied)
// -----------------------------------------------------------------------------
// Simulate the upsertItem logic from allotment-checker.tsx
function simulateUpsert(existing: AllotmentHistoryItem | undefined, incoming: AllotmentHistoryItem): AllotmentHistoryItem {
  if (!existing) return incoming;

  const isExistingPartial =
    existing.status === 'PARTIALLY_ALLOTTED' || existing.status === 'Partially Allotted';
  const isIncomingPartial =
    incoming.status === 'PARTIALLY_ALLOTTED' || incoming.status === 'Partially Allotted';

  let betterShares = existing.sharesAllotted;
  if (isExistingPartial || isIncomingPartial) {
    if (existing.sharesAllotted && incoming.sharesAllotted) {
      betterShares = Math.min(existing.sharesAllotted, incoming.sharesAllotted);
    } else {
      betterShares = existing.sharesAllotted || incoming.sharesAllotted;
    }
  } else {
    betterShares =
      incoming.sharesAllotted && incoming.sharesAllotted > 0
        ? incoming.sharesAllotted
        : existing.sharesAllotted;
  }

  return {
    ...existing,
    sharesAllotted: betterShares,
    status: isExistingPartial || isIncomingPartial ? 'PARTIALLY_ALLOTTED' : (incoming.status || existing.status),
  };
}

// Case A: Existing has verified 12 shares allotted, incoming comes with stale 24 shares applied count
const verifiedItem: AllotmentHistoryItem = {
  id: 'alt_sh',
  ipoName: 'Jio Platforms',
  userName: 'Applicant',
  pan: 'ABCDE1234F',
  status: 'PARTIALLY_ALLOTTED',
  sharesAllotted: 12, // 1 lot of 12 allotted
  category: 'SHAREHOLDER',
};

const staleIncomingItem: AllotmentHistoryItem = {
  id: 'app_sh',
  ipoName: 'Jio Platforms',
  userName: 'Applicant',
  pan: 'ABCDE1234F',
  status: 'PARTIALLY_ALLOTTED',
  sharesAllotted: 24, // 2 lots applied count
  category: 'SHAREHOLDER',
};

const mergedResult = simulateUpsert(verifiedItem, staleIncomingItem);
assert(
  mergedResult.sharesAllotted === 12,
  'Partial Allotment Merge 1',
  'Stale 24 shares count cannot overwrite verified 12 shares partial allotment'
);
assert(
  mergedResult.status === 'PARTIALLY_ALLOTTED',
  'Partial Status Retained',
  'Status remains PARTIALLY_ALLOTTED'
);

// Case B: Category normalization ensures canonical key consistency
assert(mapRegistrarCategory('SH') === 'SHAREHOLDER', 'Map SH', 'Registrar code SH maps to SHAREHOLDER');
assert(mapRegistrarCategory('SHAREHOLDER') === 'SHAREHOLDER', 'Map SHAREHOLDER', 'Category string maps to SHAREHOLDER');
assert(mapRegistrarCategory('Shareholder') === 'SHAREHOLDER', 'Map Case-insensitive', 'Mixed case maps to SHAREHOLDER');
assert(mapRegistrarCategory('SHARE HOLDERS') === 'SHAREHOLDER', 'Map Spaced', 'Spaced string maps to SHAREHOLDER');

console.log('\n========================================================================');
console.log('ALL PARTIAL ALLOTMENT & MONTH FILTER TESTS PASSED WITH ZERO FAILURES');
console.log('========================================================================');

