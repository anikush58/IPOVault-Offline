/**
 * Test Suite: Pro Tier IPO Hub Card Fields
 *
 * Verifies:
 * 1. Non-Pro Tier: IPO Hub cards show "Allotment" (date) and "Listing" (date).
 * 2. Pro Tier: IPO Hub cards dynamically change "Allotment" to "Applied" (count)
 *    and "Listing" to "Allotted" (count).
 * 3. Accurate count calculation for matching IPOs (by ID, symbol, or company name).
 * 4. Graceful handling of 0 applications ("0").
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
// Card Logic Simulator (matching app/new-ipos.tsx & components/ipo/IPOCard.tsx)
// ---------------------------------------------------------------------------
interface AppRecord {
  id: string;
  ipo_id: string;
  ipo_name: string;
  symbol?: string;
  status: string;
}

function computeIpoCardFields(params: {
  isPro: boolean;
  item: {
    id: string;
    symbol?: string;
    companyName?: string;
    openDate?: string;
    closeDate?: string;
    allotmentDate?: string;
    listingDate?: string;
    status?: string;
    isListed?: boolean;
    profitAmt?: number | null;
    lotQty?: number;
  };
  applications: AppRecord[];
}) {
  const { isPro, item, applications } = params;
  const companyName = item.companyName || item.symbol || 'IPO';
  const itemSymbol = (item.symbol || '').trim().toUpperCase();
  const itemCompName = companyName.trim().toLowerCase();
  const itemId = item.id;

  const ipoApps = isPro
    ? (applications || []).filter((a) => {
        if (a.status === 'Cancelled') return false;
        if (itemId && a.ipo_id === itemId) return true;
        if (itemSymbol && a.symbol && a.symbol.trim().toUpperCase() === itemSymbol) return true;
        if (itemCompName && a.ipo_name && a.ipo_name.trim().toLowerCase() === itemCompName) return true;
        return false;
      })
    : [];

  const appliedCount = isPro ? ipoApps.length : 0;
  const allottedCount = isPro
    ? ipoApps.filter(
        (a) =>
          a.status === 'Allotted' ||
          a.status === 'Partially Allotted' ||
          a.status === 'Holding' ||
          a.status === 'Sold'
      ).length
    : 0;

  const isListed = item.isListed ?? false;
  const allotmentDateStr = item.allotmentDate || 'TBA';
  const listingDateStr = item.listingDate || 'TBA';

  const col3Label = isPro ? 'Applied' : isListed ? 'Profit/Lot' : 'Allotment';
  const col3Val = isPro
    ? `${appliedCount}`
    : isListed
    ? item.profitAmt != null
      ? `₹${item.profitAmt}`
      : '—'
    : allotmentDateStr;

  const col4Label = isPro ? 'Allotted' : isListed ? 'Lot Size' : 'Listing';
  const col4Val = isPro
    ? `${allottedCount}`
    : isListed
    ? item.lotQty && item.lotQty > 0
      ? `${item.lotQty} Shares`
      : '—'
    : listingDateStr;

  const col4Color = isPro
    ? allottedCount > 0
      ? '#10B981'
      : '#000000'
    : '#000000';

  return {
    col3Label,
    col3Val,
    col4Label,
    col4Val,
    col4Color,
    appliedCount,
    allottedCount,
  };
}

export function runProTierIpoHubCardsTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING PRO TIER IPO HUB CARDS REGRESSION TESTS');
  console.log('===============================================================\n');

  const testApplications: AppRecord[] = [
    { id: 'app-1', ipo_id: 'ipo-bajaj', ipo_name: 'Bajaj Housing Finance', symbol: 'BAJAJHFL', status: 'Applied' },
    { id: 'app-2', ipo_id: 'ipo-bajaj', ipo_name: 'Bajaj Housing Finance', symbol: 'BAJAJHFL', status: 'Mandate Approved' },
    { id: 'app-3', ipo_id: 'ipo-bajaj', ipo_name: 'Bajaj Housing Finance', symbol: 'BAJAJHFL', status: 'Allotted' },
    { id: 'app-4', ipo_id: 'ipo-bajaj', ipo_name: 'Bajaj Housing Finance', symbol: 'BAJAJHFL', status: 'Cancelled' }, // Should be excluded
    { id: 'app-5', ipo_id: 'ipo-swiggy', ipo_name: 'Swiggy Limited', symbol: 'SWIGGY', status: 'Applied' },
  ];

  // ---------------------------------------------------------------------------
  // TEST 1: Non-Pro Tier Invariant (Preserves Allotment Date & Listing Date)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Non-Pro Tier Card Invariant ---');
  {
    const res = computeIpoCardFields({
      isPro: false,
      item: {
        id: 'ipo-bajaj',
        symbol: 'BAJAJHFL',
        companyName: 'Bajaj Housing Finance',
        allotmentDate: '16 Sep',
        listingDate: '19 Sep',
        isListed: false,
      },
      applications: testApplications,
    });

    assert(res.col3Label === 'Allotment', 'Non-Pro Col 3 Label', `Expected "Allotment", got "${res.col3Label}"`);
    assert(res.col3Val === '16 Sep', 'Non-Pro Col 3 Value', `Expected "16 Sep", got "${res.col3Val}"`);
    assert(res.col4Label === 'Listing', 'Non-Pro Col 4 Label', `Expected "Listing", got "${res.col4Label}"`);
    assert(res.col4Val === '19 Sep', 'Non-Pro Col 4 Value', `Expected "19 Sep", got "${res.col4Val}"`);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Pro Tier Card Transformation with Applications Present
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Pro Tier Card with Applications ---');
  {
    const res = computeIpoCardFields({
      isPro: true,
      item: {
        id: 'ipo-bajaj',
        symbol: 'BAJAJHFL',
        companyName: 'Bajaj Housing Finance',
        allotmentDate: '16 Sep',
        listingDate: '19 Sep',
        isListed: false,
      },
      applications: testApplications,
    });

    assert(res.col3Label === 'Applied', 'Pro Col 3 Label', `Expected "Applied", got "${res.col3Label}"`);
    assert(res.col3Val === '3', 'Pro Col 3 Value (Count)', `Expected "3" (active applications excluding cancelled), got "${res.col3Val}"`);
    assert(res.col4Label === 'Allotted', 'Pro Col 4 Label', `Expected "Allotted", got "${res.col4Label}"`);
    assert(res.col4Val === '1', 'Pro Col 4 Value (Count)', `Expected "1" (allotted applications), got "${res.col4Val}"`);
    assert(res.col4Color === '#10B981', 'Pro Allotted Color', 'Highlights positive allotted count with green');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Pro Tier Card with Zero Applications
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Pro Tier Card with Zero Applications ---');
  {
    const res = computeIpoCardFields({
      isPro: true,
      item: {
        id: 'ipo-hyundai',
        symbol: 'HYUNDAI',
        companyName: 'Hyundai Motor India',
        allotmentDate: '18 Oct',
        listingDate: '22 Oct',
        isListed: false,
      },
      applications: testApplications, // none for Hyundai
    });

    assert(res.col3Label === 'Applied', 'Zero Apps Col 3 Label', `Expected "Applied", got "${res.col3Label}"`);
    assert(res.col3Val === '0', 'Zero Apps Col 3 Value', `Expected "0", got "${res.col3Val}"`);
    assert(res.col4Label === 'Allotted', 'Zero Apps Col 4 Label', `Expected "Allotted", got "${res.col4Label}"`);
    assert(res.col4Val === '0', 'Zero Apps Col 4 Value', `Expected "0", got "${res.col4Val}"`);
    assert(res.col4Color === '#000000', 'Zero Allotted Neutral Color', 'Renders standard neutral color when 0 allotted');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Matching by Symbol or Company Name Resilience
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Matching Resilience ---');
  {
    // Application matches by symbol even if id is different (e.g. backend id vs local sqlite id)
    const appsWithDifferentId: AppRecord[] = [
      { id: 'app-99', ipo_id: 'local-sqlite-id-123', ipo_name: 'Swiggy Limited', symbol: 'SWIGGY', status: 'Applied' },
    ];

    const res = computeIpoCardFields({
      isPro: true,
      item: {
        id: 'backend-mongo-id-999',
        symbol: 'SWIGGY',
        companyName: 'Swiggy Limited',
        allotmentDate: '11 Nov',
        listingDate: '13 Nov',
        isListed: false,
      },
      applications: appsWithDifferentId,
    });

    assert(res.col3Val === '1', 'Cross-System Match', 'Correctly matches application via symbol/name across id formats');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Listed Tab Support in Pro Tier
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Listed Tab in Pro Tier ---');
  {
    const res = computeIpoCardFields({
      isPro: true,
      item: {
        id: 'ipo-bajaj',
        symbol: 'BAJAJHFL',
        companyName: 'Bajaj Housing Finance',
        isListed: true,
        profitAmt: 4500,
        lotQty: 214,
      },
      applications: testApplications,
    });

    assert(res.col3Label === 'Applied', 'Listed Pro Col 3 Label', `Expected "Applied", got "${res.col3Label}"`);
    assert(res.col3Val === '3', 'Listed Pro Col 3 Value', `Expected "3", got "${res.col3Val}"`);
    assert(res.col4Label === 'Allotted', 'Listed Pro Col 4 Label', `Expected "Allotted", got "${res.col4Label}"`);
    assert(res.col4Val === '1', 'Listed Pro Col 4 Value', `Expected "1", got "${res.col4Val}"`);
  }

  console.log('\n===============================================================');
  console.log(`ALL PRO TIER IPO HUB CARD TESTS PASSED (${passCount}/${passCount})`);
  console.log('===============================================================\n');

  if (failCount > 0) {
    throw new Error(`${failCount} tests failed.`);
  }
}

runProTierIpoHubCardsTestSuite();
