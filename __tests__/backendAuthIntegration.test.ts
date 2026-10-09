/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAuthHeaders } from '../services/api/authHeaders';
import { ApiClient } from '../services/api/ApiClient';
import { ApiError } from '../services/api/ApiError';
import { AllotmentApiService } from '../services/allotment/AllotmentApiService';
import { PanSyncService } from '../services/allotment/PanSyncService';
import { BrokerApiService } from '../services/broker/BrokerApiService';
import { BackendIpoApiService } from '../services/ipo/BackendIpoApiService';
import { firebaseAuth } from '../services/auth/firebaseConfig';

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

async function runBackendAuthIntegrationTests() {
  console.log('==================================================');
  console.log('RUNNING BACKEND AUTH & TOKEN INTEGRATION TEST SUITE');
  console.log('==================================================');

  // Test 1: getAuthHeaders when user is signed out
  (firebaseAuth as any).currentUser = null;
  const signedOutHeaders = await getAuthHeaders();
  assert(
    Object.keys(signedOutHeaders).length === 0,
    'Test 1',
    'getAuthHeaders returns empty headers when signed out',
  );

  // Test 2: getAuthHeaders when user is signed in
  (firebaseAuth as any).currentUser = {
    uid: 'firebase-user-999',
    getIdToken: async (_forceRefresh?: boolean) => 'valid-firebase-id-token-123',
  };
  const signedInHeaders = await getAuthHeaders();
  assert(
    signedInHeaders.Authorization === 'Bearer valid-firebase-id-token-123',
    'Test 2',
    'getAuthHeaders returns Bearer token for authenticated session',
  );

  // Test 3: ApiClient automatic 401 retry with token refresh
  let fetchCallCount = 0;
  let receivedTokens: string[] = [];
  const originalFetch = global.fetch;

  global.fetch = async (url: any, options: any) => {
    fetchCallCount++;
    const authHeader = options?.headers?.Authorization;
    receivedTokens.push(authHeader);

    if (fetchCallCount === 1) {
      // First call fails with 401 (expired token)
      return {
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Token expired' },
        }),
      } as Response;
    }

    // Second call succeeds with refreshed token
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { message: 'success after refresh' },
      }),
    } as Response;
  };

  let tokenRefreshCount = 0;
  (firebaseAuth as any).currentUser = {
    uid: 'firebase-user-999',
    getIdToken: async (forceRefresh?: boolean) => {
      tokenRefreshCount++;
      return forceRefresh ? 'refreshed-token-456' : 'expired-token-123';
    },
  };

  const client = new ApiClient({ baseUrl: 'http://localhost:3000' });
  const retryResult = await client.get<any>(
    '/api/v1/test-protected',
    undefined,
    { Authorization: 'Bearer expired-token-123' },
  );

  assert(
    fetchCallCount === 2,
    'Test 3a',
    'ApiClient attempted a single retry on HTTP 401',
  );
  assert(
    tokenRefreshCount === 1,
    'Test 3b',
    'Firebase ID token forceRefresh was invoked exactly once on 401',
  );
  assert(
    receivedTokens[1] === 'Bearer refreshed-token-456',
    'Test 3c',
    'Retry request carried the refreshed Bearer token',
  );
  assert(
    retryResult.data.message === 'success after refresh',
    'Test 3d',
    'Request resolved successfully after refresh',
  );

  // Test 4: AllotmentApiService.createJob attaches Bearer token and omits x-user-id
  let lastCapturedHeaders: Record<string, string> = {};
  let lastCapturedBody: any;

  (firebaseAuth as any).currentUser = {
    uid: 'firebase-user-999',
    getIdToken: async () => 'test-valid-id-token-abc',
  };

  global.fetch = async (_url: any, options: any) => {
    lastCapturedHeaders = options?.headers || {};
    lastCapturedBody = options?.body ? JSON.parse(options.body) : undefined;
    return {
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        data: {
          id: 'job-1',
          ipoId: 'ipo-uuid-1',
          status: 'QUEUED',
          totalChecks: 1,
          processedChecks: 0,
          successfulChecks: 0,
          failedChecks: 0,
          progressMessage: 'Queued',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          items: [],
        },
      }),
    } as Response;
  };

  const allotmentService = new AllotmentApiService('http://localhost:3000');
  await allotmentService.createJob('ipo-uuid-1');

  assert(
    lastCapturedHeaders.Authorization === 'Bearer test-valid-id-token-abc',
    'Test 4a',
    'Allotment job creation carries Authorization: Bearer <token>',
  );
  assert(
    lastCapturedHeaders['x-user-id'] === undefined,
    'Test 4b',
    'x-user-id header is strictly omitted from job creation',
  );
  assert(
    lastCapturedBody.userId === undefined,
    'Test 4c',
    'userId is omitted from body payload (derived exclusively from token)',
  );

  // Test 4.1: AllotmentApiService.retryJob uses exact /retry endpoint with POST, Bearer auth, and empty body
  let lastCapturedRetryUrl: string = '';
  let lastCapturedRetryMethod: string = '';
  let lastCapturedRetryHeaders: Record<string, string> = {};
  let lastCapturedRetryBody: any;

  global.fetch = async (url: any, options: any) => {
    lastCapturedRetryUrl = String(url);
    lastCapturedRetryMethod = options?.method || 'GET';
    lastCapturedRetryHeaders = options?.headers || {};
    lastCapturedRetryBody = options?.body ? JSON.parse(options.body) : undefined;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          id: 'job-retry-123',
          ipoId: 'ipo-uuid-1',
          status: 'RUNNING',
          totalChecks: 2,
          processedChecks: 0,
          successfulChecks: 0,
          failedChecks: 0,
          progressMessage: 'Retrying failed items',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          items: [],
        },
      }),
    } as Response;
  };

  await allotmentService.retryJob('job-retry-123');

  assert(
    lastCapturedRetryUrl.endsWith('/api/v1/allotment/jobs/job-retry-123/retry'),
    'Test 4.1a',
    'Allotment job retry requests exact ENDPOINTS.ALLOTMENT_JOB_RETRY url (/jobs/:id/retry)',
  );
  assert(
    lastCapturedRetryMethod === 'POST',
    'Test 4.1b',
    'Allotment job retry uses POST HTTP method',
  );
  assert(
    lastCapturedRetryHeaders.Authorization === 'Bearer test-valid-id-token-abc',
    'Test 4.1c',
    'Allotment job retry carries Authorization: Bearer <token>',
  );
  assert(
    lastCapturedRetryHeaders['x-user-id'] === undefined,
    'Test 4.1d',
    'x-user-id header is strictly omitted from job retry',
  );
  assert(
    typeof lastCapturedRetryBody === 'object' && Object.keys(lastCapturedRetryBody).length === 0,
    'Test 4.1e',
    'Allotment job retry sends expected empty object body payload',
  );

  // Test 5: PanSyncService attaches Bearer token and omits x-user-id
  const panService = new PanSyncService('http://localhost:3000');
  const panSyncSuccess = await panService.syncLocalPans('user-any', [
    { userId: 'user-any', pan: 'ABCDE1234F', name: 'Alice' },
  ]);

  assert(panSyncSuccess === true, 'Test 5a', 'PAN sync returns success');
  assert(
    lastCapturedHeaders.Authorization === 'Bearer test-valid-id-token-abc',
    'Test 5b',
    'PAN sync carries Authorization Bearer header',
  );
  assert(
    lastCapturedHeaders['x-user-id'] === undefined,
    'Test 5c',
    'x-user-id header is strictly omitted from PAN sync',
  );

  // Test 6: BrokerApiService attaches Bearer token and omits x-user-id
  const brokerService = new BrokerApiService('http://localhost:3000');
  global.fetch = async (_url: any, options: any) => {
    lastCapturedHeaders = options?.headers || {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [],
      }),
    } as Response;
  };

  await brokerService.getAccounts('user-any');
  assert(
    lastCapturedHeaders.Authorization === 'Bearer test-valid-id-token-abc',
    'Test 6a',
    'BrokerApiService.getAccounts carries Authorization Bearer header',
  );
  assert(
    lastCapturedHeaders['x-user-id'] === undefined,
    'Test 6b',
    'x-user-id header is omitted from broker accounts request',
  );

  // Test 7: Public endpoints do NOT carry user tokens
  const backendIpoService = new BackendIpoApiService('http://localhost:3000');
  global.fetch = async (_url: any, options: any) => {
    lastCapturedHeaders = options?.headers || {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [],
      }),
    } as Response;
  };

  await backendIpoService.listBackendIpos();
  assert(
    lastCapturedHeaders.Authorization === undefined,
    'Test 7',
    'Public IPO list requests do NOT attach Authorization Bearer tokens',
  );

  // Test 8: Signed-out safety — gracefully handles guest/unauthenticated state without crashing
  (firebaseAuth as any).currentUser = null;

  const guestAccounts = await brokerService.getAccounts(null);
  assert(
    Array.isArray(guestAccounts) && guestAccounts.length === 0,
    'Test 8a',
    'BrokerApiService.getAccounts returns [] for guest user without error',
  );

  const guestPanSync = await panService.syncLocalPans(undefined, [
    { userId: 'guest', pan: 'ABCDE1234F' },
  ]);
  assert(
    guestPanSync === true,
    'Test 8b',
    'PanSyncService skips backend call gracefully for guest user',
  );

  let signedOutJobError: any = null;
  try {
    await allotmentService.createJob('ipo-uuid-1');
  } catch (err: any) {
    signedOutJobError = err;
  }
  assert(
    signedOutJobError instanceof ApiError && signedOutJobError.code === 'UNAUTHORIZED',
    'Test 8c',
    'AllotmentApiService.createJob rejects signed out request with 401 ApiError',
  );

  // Restore fetch
  global.fetch = originalFetch;

  console.log('==================================================');
  console.log(`ALL BACKEND AUTH TESTS PASSED (${passCount}/${passCount})`);
  console.log('==================================================');
}

runBackendAuthIntegrationTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
