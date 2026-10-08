import { BackendIpoApiService } from '../services/ipo/BackendIpoApiService';
import { LiveIPOProvider } from '../services/ipo/providers/LiveIPOProvider';
import { ENDPOINTS } from '../services/api/Endpoints';

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

export async function runListedPaginationTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT LISTED IPO PAGINATION TEST SUITE');
  console.log('===============================================================\n');

  const backendIpoService = new BackendIpoApiService('http://127.0.0.1:3000');

  // Test 1: ENDPOINTS contains LISTED endpoint
  assert(
    ENDPOINTS.LISTED === '/api/v1/ipos/listed',
    'ENDPOINTS.LISTED',
    `Endpoint is correctly defined as ${ENDPOINTS.LISTED}`
  );

  // Test 2: Multi-page pagination on GET /api/v1/ipos/listed (156 items across 2 pages)
  const page1Items = Array.from({ length: 100 }, (_, i) => ({
    id: `ipo-listed-${i + 1}`,
    symbol: `LISTED_${i + 1}`,
    companyName: `Listed Company ${i + 1}`,
    status: 'LISTED',
    listingDate: '2026-09-01',
  }));

  const page2Items = Array.from({ length: 56 }, (_, i) => ({
    id: `ipo-listed-${i + 101}`,
    symbol: `LISTED_${i + 101}`,
    companyName: `Listed Company ${i + 101}`,
    status: 'LISTED',
    listingDate: '2026-08-01',
  }));

  const requestedUrls: string[] = [];

  (global as any).fetch = async (url: string) => {
    requestedUrls.push(url);
    if (url.includes('page=2')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          success: true,
          data: page2Items,
          meta: { page: 2, limit: 100, total: 156, totalPages: 2 },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        success: true,
        data: page1Items,
        meta: { page: 1, limit: 100, total: 156, totalPages: 2 },
      }),
    };
  };

  const listedIpos = await backendIpoService.listListedIpos();
  assert(
    listedIpos.length === 156,
    'Pagination Total Count',
    `Fetched all ${listedIpos.length} items across 2 pages (expected 156)`
  );
  assert(
    requestedUrls.some((u) => u.includes('/api/v1/ipos/listed') && u.includes('page=2')),
    'Pagination Request Trigger',
    'Triggered page 2 request based on meta.totalPages'
  );

  // Test 3: Deduplication when combining pages
  const page1WithDup = [
    { id: 'ipo-dup-1', symbol: 'DUP_1', status: 'LISTED' },
    { id: 'ipo-dup-2', symbol: 'DUP_2', status: 'LISTED' },
  ];
  const page2WithDup = [
    { id: 'ipo-dup-2', symbol: 'DUP_2', status: 'LISTED' }, // Duplicate of page 1
    { id: 'ipo-dup-3', symbol: 'DUP_3', status: 'LISTED' },
  ];

  (global as any).fetch = async (url: string) => {
    if (url.includes('page=2')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          data: page2WithDup,
          meta: { page: 2, limit: 2, total: 3, totalPages: 2 },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        data: page1WithDup,
        meta: { page: 1, limit: 2, total: 3, totalPages: 2 },
      }),
    };
  };

  const dedupedIpos = await backendIpoService.listListedIpos();
  assert(
    dedupedIpos.length === 3,
    'Deduplication Prevention',
    `Deduplicated overlapping items to ${dedupedIpos.length} unique items (expected 3)`
  );

  // Test 4: LiveIPOProvider pagination and deduplication
  const liveProvider = new LiveIPOProvider({ baseUrl: 'http://127.0.0.1:3000/api/v1/ipos' });
  (global as any).fetch = async (url: string) => {
    if (url.includes('page=2')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          data: page2Items,
          meta: { page: 2, limit: 100, total: 156, totalPages: 2 },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        data: page1Items,
        meta: { page: 1, limit: 100, total: 156, totalPages: 2 },
      }),
    };
  };

  const syncResult = await liveProvider.fetchIPOs(null);
  assert(
    syncResult.success && syncResult.data.length === 156,
    'LiveIPOProvider Pagination',
    `LiveIPOProvider synced all ${syncResult.data.length} records across pages`
  );

  console.log(`\nTEST SUITE COMPLETED: ${passCount} PASSED, ${failCount} FAILED.\n`);
}

if (require.main === module) {
  runListedPaginationTestSuite().catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
}
