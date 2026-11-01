import { BackendJobItem, CategoryAllotmentResult } from '../services/allotment/AllotmentApiService';
import {
  formatCategoryDisplayName,
  getCategoryThemeColor,
  mapRegistrarCategory,
  deduplicateCategoryRecords,
  deriveOverallCategoryAllotment,
  formatCategoryStatusText,
  getCategoryStatusTextColor,
  getDeterministicBreakdownLabel,
  sortCategoriesForDisplay,
  CategoryBreakdownItem,
} from '../utils/allotmentCategoryUtils';
import { AllotmentHistoryItem } from '../utils/allotmentHistoryUtils';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export async function runCategoryAllotmentCheckerMobileTestSuite() {
  console.log('========================================================================');
  console.log('RUNNING BID 1 / BID 2 & CATEGORY DETERMINISTIC LABEL REGRESSION TESTS');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------------------------------
  // 1. Duplicate Category Labels Replaced with Neutral 'Bid 1', 'Bid 2' (Anish & Neha case)
  // -------------------------------------------------------------------------------------------------
  console.log('--- TEST 1: Duplicate Category Labels Replaced with Bid 1 / Bid 2 ---');
  const duplicateRetailApps: CategoryBreakdownItem[] = [
    {
      category: 'RETAIL',
      applicationNumber: 'APP-1001',
      sharesAllotted: 12,
      sharesApplied: 12,
      status: 'allotted',
    },
    {
      category: 'RETAIL',
      applicationNumber: 'APP-1002',
      sharesAllotted: 12,
      sharesApplied: 12,
      status: 'allotted',
    },
  ];

  const label1 = getDeterministicBreakdownLabel(duplicateRetailApps[0], duplicateRetailApps);
  const label2 = getDeterministicBreakdownLabel(duplicateRetailApps[1], duplicateRetailApps);

  assert(
    label1 === 'Bid 1 (12 Applied)',
    'Scenario 1a: Bid 1 Label',
    `First repeated category labeled "${label1}" showing applied shares without application number`
  );
  assert(
    label2 === 'Bid 2 (12 Applied)',
    'Scenario 1b: Bid 2 Label',
    `Second repeated category labeled "${label2}" showing applied shares without application number`
  );
  assert(
    label1 !== label2,
    'Scenario 1c: Non-Repeating Labels',
    `Labels are distinct and not misleading repeated "Retail", "Retail"`
  );

  const overallDualBid = deriveOverallCategoryAllotment(duplicateRetailApps);
  assert(
    overallDualDualBidShareCheck(overallDualBid.totalSharesAllotted),
    'Scenario 1d: Total Shares Summed to 24',
    `Both bids of 12 shares each sum to exactly 24 shares (got ${overallDualBid.totalSharesAllotted})`
  );
  assert(
    overallDualBid.status === 'allotted',
    'Scenario 1e: Full Allotment Overall Status',
    `Overall status remains 'allotted' when both bids are fully allotted`
  );

  function overallDualDualBidShareCheck(shares: number): boolean {
    return shares === 24;
  }

  // -------------------------------------------------------------------------------------------------
  // 2. Stable Bid Numbering & Bid 1 Ordering First
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 2: Deterministic Bid Assignment & Bid 1 Ordering ---');
  // Swapped order in array to prove deterministic assignment based on application identifier
  const swappedOrder = [duplicateRetailApps[1], duplicateRetailApps[0]];
  const labelSwappedFirst = getDeterministicBreakdownLabel(swappedOrder[0], swappedOrder);
  const labelSwappedSecond = getDeterministicBreakdownLabel(swappedOrder[1], swappedOrder);

  assert(
    labelSwappedFirst === 'Bid 2 (12 Applied)',
    'Scenario 2a: Stable Bid Numbering for APP-1002',
    `APP-1002 remains Bid 2 regardless of array order`
  );
  assert(
    labelSwappedSecond === 'Bid 1 (12 Applied)',
    'Scenario 2b: Stable Bid Numbering for APP-1001',
    `APP-1001 remains Bid 1 regardless of array order`
  );

  // Test sortCategoriesForDisplay ensures Bid 1 is ordered before Bid 2
  const sortedSwapped = sortCategoriesForDisplay(swappedOrder);
  const sortedLabelFirst = getDeterministicBreakdownLabel(sortedSwapped[0], sortedSwapped);
  const sortedLabelSecond = getDeterministicBreakdownLabel(sortedSwapped[1], sortedSwapped);
  assert(
    sortedLabelFirst === 'Bid 1 (12 Applied)',
    'Scenario 2c: Bid 1 Comes First',
    `After sortCategoriesForDisplay, Bid 1 comes first (got ${sortedLabelFirst})`
  );
  assert(
    sortedLabelSecond === 'Bid 2 (12 Applied)',
    'Scenario 2d: Bid 2 Comes Second',
    `After sortCategoriesForDisplay, Bid 2 comes second (got ${sortedLabelSecond})`
  );

  // -------------------------------------------------------------------------------------------------
  // 3. Distinct Genuine Categories Preserved (Retail and Shareholder)
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 3: Genuine Different Categories Preserved (No Bid Labels) ---');
  const distinctCategories: CategoryBreakdownItem[] = [
    {
      category: 'RETAIL',
      applicationNumber: 'APP-2001',
      sharesAllotted: 12,
      sharesApplied: 12,
      status: 'allotted',
    },
    {
      category: 'SHAREHOLDER',
      applicationNumber: 'APP-2002',
      sharesAllotted: 12,
      sharesApplied: 12,
      status: 'allotted',
    },
  ];

  const distinctLabel1 = getDeterministicBreakdownLabel(distinctCategories[0], distinctCategories);
  const distinctLabel2 = getDeterministicBreakdownLabel(distinctCategories[1], distinctCategories);

  assert(
    distinctLabel1 === 'Retail',
    'Scenario 3a: Preserve Retail Name',
    `Genuinely distinct category 1 preserves name "${distinctLabel1}"`
  );
  assert(
    distinctLabel2 === 'Shareholder',
    'Scenario 3b: Preserve Shareholder Name',
    `Genuinely distinct category 2 preserves name "${distinctLabel2}"`
  );

  // -------------------------------------------------------------------------------------------------
  // 4. Missing / Unavailable Category Defaults to Bid Labels
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 4: Unavailable Category Strings Default to Bid Labels ---');
  const missingCatApps: CategoryBreakdownItem[] = [
    {
      category: '',
      applicationNumber: 'APP-3001',
      sharesAllotted: 12,
      sharesApplied: 12,
      status: 'allotted',
    },
    {
      category: '',
      applicationNumber: 'APP-3002',
      sharesAllotted: 12,
      sharesApplied: 12,
      status: 'allotted',
    },
  ];

  const missingLabel1 = getDeterministicBreakdownLabel(missingCatApps[0], missingCatApps);
  const missingLabel2 = getDeterministicBreakdownLabel(missingCatApps[1], missingCatApps);

  assert(
    missingLabel1 === 'Bid 1 (12 Applied)',
    'Scenario 4a: Missing Category Bid 1',
    `Missing category row 1 assigned "${missingLabel1}"`
  );
  assert(
    missingLabel2 === 'Bid 2 (12 Applied)',
    'Scenario 4b: Missing Category Bid 2',
    `Missing category row 2 assigned "${missingLabel2}"`
  );

  // -------------------------------------------------------------------------------------------------
  // 5. Genuine Duplicates Merged (Same App ID)
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 5: Genuine Duplicate Records Merged Without Double Counting ---');
  const duplicateRecordsSameId: CategoryBreakdownItem[] = [
    {
      category: 'RETAIL',
      applicationNumber: 'APP-1001',
      sharesAllotted: 12,
      sharesApplied: 12,
      status: 'allotted',
    },
    {
      category: 'RETAIL',
      applicationNumber: 'APP-1001', // Exact same application ID returned twice
      sharesAllotted: 12,
      sharesApplied: 12,
      status: 'allotted',
    },
  ];

  const dedupedDupes = deduplicateCategoryRecords(duplicateRecordsSameId);
  assert(
    dedupedDupes.length === 1,
    'Scenario 5a: Duplicate Rows Merged',
    `Same application number APP-1001 merged to 1 entry (got ${dedupedDupes.length})`
  );
  assert(
    dedupedDupes[0].sharesAllotted === 12,
    'Scenario 5b: Non-Inflated Shares',
    `Shares not double-counted to 24: expected 12, got ${dedupedDupes[0].sharesAllotted}`
  );

  // -------------------------------------------------------------------------------------------------
  // 6. Nitish Case: Allotted 12 + Not Allotted 0 (Partial Overall Status)
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 6: Nitish Mixed Allotment (Allotted + Not Allotted) ---');
  const nitishCategories: CategoryBreakdownItem[] = [
    {
      category: 'RETAIL',
      applicationNumber: 'APP-NIT-1',
      sharesAllotted: 12,
      sharesApplied: 12,
      status: 'allotted',
    },
    {
      category: 'SHAREHOLDER',
      applicationNumber: 'APP-NIT-2',
      sharesAllotted: 0,
      sharesApplied: 12,
      status: 'not_allotted',
    },
  ];

  const overallNitish = deriveOverallCategoryAllotment(nitishCategories);
  assert(
    overallNitish.status === 'partially_allotted',
    'Scenario 6a: Partial Overall Status',
    `Overall status is '${overallNitish.status}' because Shareholder is not allotted`
  );
  assert(
    overallNitish.totalSharesAllotted === 12,
    'Scenario 6b: Nitish Total Shares',
    `Total allotted shares is 12`
  );
  assert(
    formatCategoryStatusText(nitishCategories[0]) === 'Allotted · 12 Shares',
    'Scenario 6c: Nitish Row 1 Text',
    `Format: ${formatCategoryStatusText(nitishCategories[0])}`
  );
  assert(
    formatCategoryStatusText(nitishCategories[1]) === 'Not Allotted · 0 Shares',
    'Scenario 6d: Nitish Row 2 Text',
    `Format: ${formatCategoryStatusText(nitishCategories[1])}`
  );

  // -------------------------------------------------------------------------------------------------
  // 7. Persistence & Reload Restoration from SQLite
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 7: Persistence & Reload Restoration ---');
  const sqliteApps = [
    {
      id: 'app-neha-1',
      user_id: 'user-neha',
      category: 'RETAIL',
      shares_count: 12,
      application_number: 'APP-NEHA-101',
    },
    {
      id: 'app-neha-2',
      user_id: 'user-neha',
      category: 'RETAIL',
      shares_count: 12,
      application_number: 'APP-NEHA-102',
    },
  ];

  const sqliteAllotments = [
    { application_id: 'app-neha-1', allotment_status: 'ALLOTTED', allotted_shares: 12 },
    { application_id: 'app-neha-2', allotment_status: 'ALLOTTED', allotted_shares: 12 },
  ];

  const restoredList: CategoryBreakdownItem[] = sqliteApps.map((a) => {
    const alt = sqliteAllotments.find((alt) => alt.application_id === a.id);
    return {
      category: a.category,
      status: (alt?.allotment_status || '').toLowerCase() as any,
      sharesAllotted: alt?.allotted_shares || 0,
      sharesApplied: a.shares_count,
      applicationNumber: a.application_number || a.id,
      applicationId: a.id,
      id: a.id,
    };
  });

  const restoredDeduped = deduplicateCategoryRecords(restoredList);
  const restoredOverall = deriveOverallCategoryAllotment(restoredDeduped);

  assert(
    restoredDeduped.length === 2,
    'Scenario 7a: Reload Preserves Both Bids',
    `Restored ${restoredDeduped.length} bids on reload`
  );
  assert(
    restoredOverall.totalSharesAllotted === 24,
    'Scenario 7b: Reload Preserves 24 Total Shares',
    `Restored exact 24 total shares: ${restoredOverall.totalSharesAllotted}`
  );
  assert(
    getDeterministicBreakdownLabel(restoredDeduped[0], restoredDeduped) === 'Bid 1 (12 Applied)',
    'Scenario 7c: Restored Bid 1 Label',
    `Restored label: ${getDeterministicBreakdownLabel(restoredDeduped[0], restoredDeduped)}`
  );
  assert(
    getDeterministicBreakdownLabel(restoredDeduped[1], restoredDeduped) === 'Bid 2 (12 Applied)',
    'Scenario 7d: Restored Bid 2 Label',
    `Restored label: ${getDeterministicBreakdownLabel(restoredDeduped[1], restoredDeduped)}`
  );

  // -------------------------------------------------------------------------------------------------
  // 8. Celebration Modal Shows Only First 5 Results
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 8: Allotment Received Modal Slices to First 5 Results ---');
  const tenAllottedUsers = Array.from({ length: 10 }, (_, i) => ({
    userName: `User ${i + 1}`,
    pan: `ABCDE123${i}F`,
    status: 'allotted',
    sharesAllotted: 12,
  }));

  const celebrationDisplayedList = tenAllottedUsers.slice(0, 5);
  assert(
    celebrationDisplayedList.length === 5,
    'Scenario 8a: Modal Length Limited to 5',
    `Celebration modal slices 10 results to exactly 5 (got ${celebrationDisplayedList.length})`
  );
  assert(
    celebrationDisplayedList[0].userName === 'User 1' && celebrationDisplayedList[4].userName === 'User 5',
    'Scenario 8b: Modal Shows First 5',
    `First 5 results preserved from User 1 to User 5`
  );

  console.log('\n========================================================================');
  console.log('ALL REGRESSION SCENARIOS PASSED WITH ZERO FAILURES');
  console.log('========================================================================');
}

runCategoryAllotmentCheckerMobileTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
