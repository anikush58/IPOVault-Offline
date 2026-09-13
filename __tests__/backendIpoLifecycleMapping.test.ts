import { normalizeBackendIpo } from '../services/ipo/BackendIpoApiService';
import { BackendIpo } from '../types/backend-ipo';
import { formatDate } from '../utils/formatters';

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

export async function runBackendIpoLifecycleMappingTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING PHASE 33.2 MOBILE LIFECYCLE DATE MAPPING TEST SUITE');
  console.log('===============================================================\n');

  // Test 1: Full backend lifecycle object mapping
  const backendItemFull: BackendIpo = {
    id: 'manika-plastech-id-123',
    symbol: 'MANIKA',
    status: 'UPCOMING',
    marketSegment: 'SME',
    lifecycle: {
      openDate: '2026-09-17',
      closeDate: '2026-09-21',
      listingDate: '2026-09-24',
    },
  };

  const normalizedFull = normalizeBackendIpo(backendItemFull);
  assert(
    normalizedFull.openDate === '2026-09-17',
    'Full Lifecycle - Open Date',
    'openDate mapped from lifecycle.openDate'
  );
  assert(
    normalizedFull.closeDate === '2026-09-21',
    'Full Lifecycle - Close Date',
    'closeDate mapped from lifecycle.closeDate'
  );
  assert(
    normalizedFull.listingDate === '2026-09-24',
    'Full Lifecycle - Listing Date',
    'listingDate mapped from lifecycle.listingDate'
  );
  assert(
    normalizedFull.status === 'UPCOMING',
    'Status Preservation',
    'status remains UPCOMING'
  );

  // Test 2: Date formatting verification
  const openFormatted = formatDate(normalizedFull.openDate);
  const closeFormatted = formatDate(normalizedFull.closeDate);
  const listingFormatted = formatDate(normalizedFull.listingDate);

  assert(
    openFormatted.includes('17') && openFormatted.includes('2026'),
    'Date Formatting - Open',
    `2026-09-17 formatted to "${openFormatted}"`
  );
  assert(
    closeFormatted.includes('21') && closeFormatted.includes('2026'),
    'Date Formatting - Close',
    `2026-09-21 formatted to "${closeFormatted}"`
  );
  assert(
    listingFormatted.includes('24') && listingFormatted.includes('2026'),
    'Date Formatting - Listing',
    `2026-09-24 formatted to "${listingFormatted}"`
  );

  // Test 3: Partial lifecycle (Listing date null)
  const backendItemPartial: BackendIpo = {
    id: 'partial-ipo-456',
    symbol: 'PARTIAL',
    status: 'UPCOMING',
    marketSegment: 'MAINBOARD',
    lifecycle: {
      openDate: '2026-09-17',
      closeDate: '2026-09-21',
      listingDate: null,
    },
  };

  const normalizedPartial = normalizeBackendIpo(backendItemPartial);
  assert(
    normalizedPartial.openDate === '2026-09-17',
    'Partial Lifecycle - Open Date',
    'openDate present'
  );
  assert(
    normalizedPartial.listingDate === null,
    'Partial Lifecycle - Listing Date Null',
    'listingDate is null'
  );
  const partialListingVal = normalizedPartial.listingDate ? formatDate(normalizedPartial.listingDate) : 'Pending';
  assert(
    partialListingVal === 'Pending',
    'Null Semantics - Listing Pending',
    'Null listing date returns Pending'
  );

  // Test 4: All dates null
  const backendItemAllNull: BackendIpo = {
    id: 'null-ipo-789',
    symbol: 'NULLIPO',
    status: 'UPCOMING',
    marketSegment: 'MAINBOARD',
    lifecycle: {
      openDate: null,
      closeDate: null,
      listingDate: null,
    },
  };

  const normalizedAllNull = normalizeBackendIpo(backendItemAllNull);
  const openNullVal = normalizedAllNull.openDate ? formatDate(normalizedAllNull.openDate) : 'Pending';
  const closeNullVal = normalizedAllNull.closeDate ? formatDate(normalizedAllNull.closeDate) : 'Pending';
  const listingNullVal = normalizedAllNull.listingDate ? formatDate(normalizedAllNull.listingDate) : 'Pending';

  assert(openNullVal === 'Pending', 'Null Semantics - All Null Open', 'Open date displays Pending');
  assert(closeNullVal === 'Pending', 'Null Semantics - All Null Close', 'Close date displays Pending');
  assert(listingNullVal === 'Pending', 'Null Semantics - All Null Listing', 'Listing date displays Pending');

  console.log(`\nTEST SUITE COMPLETED: ${passCount} PASSED, ${failCount} FAILED.\n`);
}

if (require.main === module) {
  runBackendIpoLifecycleMappingTestSuite().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
}
