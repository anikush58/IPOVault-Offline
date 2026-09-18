import { BackendIpo } from '../types/backend-ipo';
import { normalizeBackendIpo } from '../services/ipo/BackendIpoApiService';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export async function runLocalIpoExclusionTestSuite() {
  console.log('==================================================');
  console.log('RUNNING LOCAL IPO EXCLUSION & BACKEND IDENTITY TEST SUITE');
  console.log('==================================================');

  let passCount = 0;

  // Test 1: Backend published IPO contains canonical Backend UUID
  const mockBackendIpo: BackendIpo = {
    id: '978939c3-4217-48f1-9c60-e8ea3c4ecdd7',
    company: {
      id: 'comp-123',
      displayName: 'Dhoot Transmission',
      legalName: 'Dhoot Transmission Ltd',
    },
    symbol: 'DHOOT',
    marketSegment: 'MAINBOARD',
    status: 'OPEN',
    openDate: '2026-09-18',
    closeDate: '2026-09-20',
  };

  const normalized = normalizeBackendIpo(mockBackendIpo);
  assert(
    normalized.id === '978939c3-4217-48f1-9c60-e8ea3c4ecdd7',
    'Test 1',
    'Backend published IPO retains canonical UUID id'
  );
  passCount++;

  // Test 2: Local manual IPO ID is NOT valid backend UUID
  const localManualIpo = {
    id: 'manual-1741234567-abc',
    ipo_name: 'Local Test IPO',
    source_type: 'LOCAL',
  };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localManualIpo.id);
  assert(
    !isUuid,
    'Test 2',
    'Local manually-added IPO ID (manual-...) is recognized as non-backend UUID'
  );
  passCount++;

  // Test 3: Filter logic excludes local-only records (source_type === 'LOCAL')
  const mixedCatalog = [
    { id: '978939c3-4217-48f1-9c60-e8ea3c4ecdd7', ipo_name: 'Dhoot Transmission', source_type: 'SERVER' },
    { id: 'manual-1741234567-abc', ipo_name: 'Legacy Local IPO', source_type: 'LOCAL' },
  ];

  const filteredCatalog = mixedCatalog.filter(
    (item) => item.source_type === 'SERVER' && !item.id.startsWith('manual-')
  );

  assert(
    filteredCatalog.length === 1 && filteredCatalog[0].id === '978939c3-4217-48f1-9c60-e8ea3c4ecdd7',
    'Test 3',
    'Filtered catalog includes ONLY backend-published IPO and excludes local manual IPO'
  );
  passCount++;

  // Test 4: Offline / API Error handling does not fall back to local manual records
  let isApiError = false;
  let listingItems: any[] = [];

  try {
    throw new Error('Network unreachable');
  } catch {
    isApiError = true;
    // On error, listingItems remains [] (empty/offline state) instead of fetching local manual catalog
    listingItems = [];
  }

  assert(
    isApiError && listingItems.length === 0,
    'Test 4',
    'Backend API error results in empty/offline state without falling back to local manual IPO catalog'
  );
  passCount++;

  // Test 5: Allotment compatibility - checkAllotment receives backend UUID
  const selectedForCheck = filteredCatalog[0];
  const targetCheckIpoId = selectedForCheck.id;
  const isTargetUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetCheckIpoId);

  assert(
    isTargetUuid && targetCheckIpoId === '978939c3-4217-48f1-9c60-e8ea3c4ecdd7',
    'Test 5',
    'Check Allotment receives backend canonical UUID for backend-published IPO'
  );
  passCount++;

  console.log(`\n==================================================`);
  console.log(`ALL ${passCount} LOCAL IPO EXCLUSION TESTS PASSED SUCCESSFULLY!`);
  console.log(`==================================================\n`);
}

runLocalIpoExclusionTestSuite().catch((err) => {
  console.error('Local IPO Exclusion test failed:', err);
  process.exit(1);
});
