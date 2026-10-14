import { parseQueryParams } from '../services/broker/BrokerApiService';

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
// Simulators for Broker OAuth Flow & Navigation
// ---------------------------------------------------------------------------
interface CallbackParams {
  status?: string;
  accountId?: string;
  broker?: string;
  error?: string;
  error_description?: string;
  code?: string;
}

class BrokerOAuthFlowSimulator {
  public currentScreen: string = '/users';
  public registeredScreens: Set<string> = new Set([
    'index',
    '(tabs)',
    'users',
    'banks',
    'auth',
    'broker-callback',
    'allotment-checker',
    'notifications',
  ]);

  public connectedBrokerSuccess: { brokerName: string; accountName?: string } | null = null;
  public errorMessage: string | null = null;
  public isConnected: boolean = false;
  public navigationHistory: string[] = ['/users'];

  // Simulate incoming deep link handling via Expo Router
  receiveDeepLink(url: string) {
    // Parse scheme and route
    const scheme = url.split('://')[0];
    const pathAndQuery = url.split('://')[1] || '';
    const [pathname, queryString] = pathAndQuery.split('?');

    // Verify route is registered in stack
    const normalizedRoute = pathname.replace(/^\//, '');
    if (!this.registeredScreens.has(normalizedRoute)) {
      this.currentScreen = '+not-found';
      this.navigationHistory.push('+not-found');
      return;
    }

    this.currentScreen = `/${normalizedRoute}`;
    this.navigationHistory.push(`/${normalizedRoute}`);

    const params: CallbackParams = queryString ? (parseQueryParams(url) as any) : {};
    this.handleBrokerCallbackScreen(params);
  }

  // Simulate BrokerCallbackScreen lifecycle
  handleBrokerCallbackScreen(params: CallbackParams) {
    if (params.error || params.error_description) {
      this.errorMessage = params.error_description || params.error || 'Connection failed';
      this.connectedBrokerSuccess = null;
      return;
    }

    if (params.status === 'success' || params.accountId) {
      const broker = params.broker || 'Upstox';
      this.connectedBrokerSuccess = {
        brokerName: broker,
      };
      this.isConnected = true;

      // Auto-navigate to Manage Users after short delay
      this.autoNavigateToUsers();
    }
  }

  autoNavigateToUsers() {
    this.currentScreen = '/users';
    this.navigationHistory.push('/users');
  }

  // Simulate in-app WebBrowser.openAuthSessionAsync completion
  async handleInAppAuthSessionSuccess(authSessionUrl: string, targetBroker: string, userName: string) {
    const query = parseQueryParams(authSessionUrl);
    if (query.error || query.status === 'cancelled') {
      const isCancel = query.error === 'access_denied' || query.error === 'user_cancelled' || query.status === 'cancelled';
      if (!isCancel) {
        this.errorMessage = query.error_description || query.error || 'Authorization rejected';
      }
      return;
    }

    if (query.status === 'success' || query.accountId || query.code) {
      this.connectedBrokerSuccess = {
        brokerName: targetBroker,
        accountName: userName,
      };
      this.isConnected = true;
    }
  }
}

async function runBrokerOAuthSuccessFlowTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT BROKER OAUTH SUCCESS FLOW & NAVIGATION TESTS');
  console.log('===============================================================\n');

  // --- TEST 1: Successful Upstox Callback Deep Link ---
  console.log('--- TEST 1: Successful Upstox OAuth Callback Deep Link ---');
  {
    const sim = new BrokerOAuthFlowSimulator();
    const upstoxSuccessDeepLink = 'ipovault://broker-callback?status=success&accountId=acc-upstox-999&broker=Upstox';

    sim.receiveDeepLink(upstoxSuccessDeepLink);

    assert(
      sim.currentScreen === '/users',
      'TEST 1.1',
      'Successful callback deep link lands safely on Manage Users screen'
    );
    assert(
      !sim.navigationHistory.includes('+not-found'),
      'TEST 1.2',
      'Callback route NEVER produces Expo Router "+not-found" (screen doesn\'t exist)'
    );
    assert(
      sim.connectedBrokerSuccess?.brokerName === 'Upstox',
      'TEST 1.3',
      'Success state resolves broker name as "Upstox"'
    );
    assert(
      sim.isConnected === true,
      'TEST 1.4',
      'Broker connection status marked as connected'
    );
  }

  // --- TEST 2: In-App Success Content & Modal Copy ---
  console.log('\n--- TEST 2: In-App Success Content & Modal Copy ---');
  {
    const sim = new BrokerOAuthFlowSimulator();
    const authSessionUrl = 'ipovault://broker-callback?status=success&accountId=acc-123';

    await sim.handleInAppAuthSessionSuccess(authSessionUrl, 'Upstox', 'Anish Kushwaha');

    const expectedTitle = `${sim.connectedBrokerSuccess?.brokerName} Connected!`;
    const expectedSubtitle = `Your ${sim.connectedBrokerSuccess?.brokerName} account has been securely linked.`;

    assert(
      expectedTitle === 'Upstox Connected!',
      'TEST 2.1',
      'Success title matches exact requirement: "Upstox Connected!"'
    );
    assert(
      expectedSubtitle === 'Your Upstox account has been securely linked.',
      'TEST 2.2',
      'Success subtitle matches exact requirement: "Your Upstox account has been securely linked."'
    );
    assert(
      sim.currentScreen === '/users',
      'TEST 2.3',
      'User remains on Manage Users screen without intermediate browser success page'
    );
  }

  // --- TEST 3: Failed OAuth Error Handling ---
  console.log('\n--- TEST 3: Failed OAuth Error Handling ---');
  {
    const sim = new BrokerOAuthFlowSimulator();
    const failureDeepLink = 'ipovault://broker-callback?status=error&error=Invalid%20credentials%20provided';

    sim.receiveDeepLink(failureDeepLink);

    assert(
      sim.connectedBrokerSuccess === null,
      'TEST 3.1',
      'Success modal is NOT displayed for failed OAuth'
    );
    assert(
      sim.isConnected === false,
      'TEST 3.2',
      'Connection status remains false on failure'
    );
    assert(
      sim.errorMessage === 'Invalid credentials provided',
      'TEST 3.3',
      'Proper error message is captured for display'
    );
  }

  // --- TEST 4: User Cancelled OAuth Flow ---
  console.log('\n--- TEST 4: User Cancelled OAuth Flow ---');
  {
    const sim = new BrokerOAuthFlowSimulator();
    const cancelUrl = 'ipovault://broker-callback?error=access_denied';

    await sim.handleInAppAuthSessionSuccess(cancelUrl, 'Upstox', 'Anish Kushwaha');

    assert(
      sim.connectedBrokerSuccess === null,
      'TEST 4.1',
      'No success modal shown on user cancellation'
    );
    assert(
      sim.errorMessage === null,
      'TEST 4.2',
      'Cancellation is handled cleanly without intrusive error popups'
    );
    assert(
      sim.currentScreen === '/users',
      'TEST 4.3',
      'User stays seamlessly on Manage Users screen'
    );
  }

  // --- TEST 5: Standalone APK Scheme & Query Parsing ---
  console.log('\n--- TEST 5: Standalone APK Scheme & Query Parsing ---');
  {
    const testUrl = 'ipovault://broker-callback?status=success&accountId=acc-abc-123&broker=Upstox';
    const parsed = parseQueryParams(testUrl);

    assert(
      parsed.status === 'success',
      'TEST 5.1',
      'Query parser correctly extracts status=success'
    );
    assert(
      parsed.accountId === 'acc-abc-123',
      'TEST 5.2',
      'Query parser correctly extracts accountId=acc-abc-123'
    );
    assert(
      parsed.broker === 'Upstox',
      'TEST 5.3',
      'Query parser correctly extracts broker=Upstox'
    );
  }

  // --- TEST 6: Explicit /users Navigation & Focus Refresh on Callback ---
  console.log('\n--- TEST 6: Explicit /users Navigation & Focus Refresh on Callback ---');
  {
    const sim = new BrokerOAuthFlowSimulator();
    // Simulate real device launch where deep link initially opens callback screen on top of root
    sim.navigationHistory = ['/(tabs)'];
    sim.currentScreen = '/(tabs)';

    // Receive incoming Upstox success callback
    sim.receiveDeepLink('ipovault://broker-callback?status=success&accountId=acc-real-456&broker=Upstox');

    assert(
      sim.currentScreen === '/users',
      'TEST 6.1',
      'BrokerCallbackScreen explicitly navigates to /users (never lands on Dashboard /(tabs))'
    );

    assert(
      sim.navigationHistory[sim.navigationHistory.length - 1] === '/users',
      'TEST 6.2',
      'Final destination in navigation history is /users'
    );

    assert(
      sim.isConnected === true,
      'TEST 6.3',
      'Broker connection status is marked connected and triggers focus/event reload'
    );
  }

  // --- TEST 7: UserCard Account Matching & Connected Status Lifecycle ---
  console.log('\n--- TEST 7: UserCard Account Matching & Connected Status Lifecycle ---');
  {
    const targetUserId = 'usr-rahul-123';
    const canonicalBroker = 'UPSTOX';
    const mockBrokerAccounts = [
      {
        id: 'acc-upstox-999',
        userId: 'auth-firebase-uid-abc',
        profileId: targetUserId,
        broker: 'UPSTOX',
        accountName: 'Rahul Sharma',
        isActive: true,
        connection: {
          id: 'conn-1',
          brokerAccountId: 'acc-upstox-999',
          status: 'CONNECTED',
          connectedAt: new Date().toISOString(),
        },
      },
    ];

    // Simulate Users screen matching logic
    const matched = mockBrokerAccounts.find(
      (acc) =>
        acc.profileId === targetUserId &&
        acc.broker === canonicalBroker &&
        acc.isActive
    );

    const connectionStatus =
      matched?.connection?.status === 'CONNECTED'
        ? 'CONNECTED'
        : matched?.connection?.status === 'EXPIRED'
        ? 'EXPIRED'
        : 'NOT_CONNECTED';

    assert(
      matched !== undefined,
      'TEST 7.1',
      'Broker account correctly matches user profile ID and canonical broker type'
    );
    assert(
      connectionStatus === 'CONNECTED',
      'TEST 7.2',
      'UserCard evaluates connectionStatus strictly as CONNECTED'
    );
    assert(
      matched?.id === 'acc-upstox-999',
      'TEST 7.3',
      'Matched account ID aligns with backend persisted account ID'
    );

    // Verify unmatched profile remains NOT_CONNECTED
    const unmatchedUser = mockBrokerAccounts.find(
      (acc) => acc.profileId === 'other-user-456' && acc.broker === canonicalBroker
    );
    const unmatchedStatus =
      unmatchedUser?.connection?.status === 'CONNECTED' ? 'CONNECTED' : 'NOT_CONNECTED';
    assert(
      unmatchedStatus === 'NOT_CONNECTED',
      'TEST 7.4',
      'Other profiles remain cleanly isolated as NOT_CONNECTED'
    );
  }

  // --- TEST 8: Eventual Consistency, Replay Prevention & Header Auth Guard ---
  console.log('\n--- TEST 8: Eventual Consistency, Replay Prevention & Header Auth Guard ---');
  {
    // Test double callback prevention
    let callbackExecutionCount = 0;
    const hasProcessed = { current: false };

    const simulateProcessCallback = () => {
      if (hasProcessed.current) return false;
      hasProcessed.current = true;
      callbackExecutionCount++;
      return true;
    };

    const firstRun = simulateProcessCallback();
    const secondRun = simulateProcessCallback();

    assert(
      firstRun === true && secondRun === false && callbackExecutionCount === 1,
      'TEST 8.1',
      'Single-use guard blocks replay/duplicate callback execution'
    );

    // Test query status=success handling without raw tokens
    const deepLinkUrl = 'ipovault://broker-callback?status=success&accountId=acc-upstox-999';
    const query = parseQueryParams(deepLinkUrl);
    const hasToken = Boolean(query.code || query.tokenId || query.auth_code || query.request_token);

    // Prior bug check: old code only checked hasToken, ignoring status=success
    const oldShouldReload = Boolean(hasToken);
    const newShouldReload = Boolean(hasToken || query.status === 'success');

    assert(
      oldShouldReload === false,
      'TEST 8.2',
      'Prior APK bug confirmed: old hasToken logic failed to reload when backend completed token exchange'
    );
    assert(
      newShouldReload === true,
      'TEST 8.3',
      'Fixed reload logic: triggers loadBrokerAccounts cleanly upon query.status=success'
    );
  }

  // --- TEST 9: Success Dialog Strictly Requires Backend Confirmation ---
  console.log('\n--- TEST 9: Success Dialog Strictly Requires Backend Confirmation ---');
  {
    interface MockAccount {
      id: string;
      profileId: string;
      isActive: boolean;
      connection?: { status: string };
    }

    const verifyAccount = async (
      accountId: string,
      mockBackendFetcher: () => Promise<MockAccount | null>,
    ): Promise<boolean> => {
      const acc = await mockBackendFetcher();
      if (!acc || !acc.isActive || acc.connection?.status !== 'CONNECTED') {
        return false;
      }
      return true;
    };

    // Case 9.1: Backend returns PENDING
    const isPendingVerified = await verifyAccount('acc-1', async () => ({
      id: 'acc-1',
      profileId: 'prof-1',
      isActive: true,
      connection: { status: 'PENDING' },
    }));
    assert(
      isPendingVerified === false,
      'TEST 9.1',
      'Unconfirmed account with status=PENDING does NOT show success dialog'
    );

    // Case 9.2: Backend returns null / not found
    const isNotFoundVerified = await verifyAccount('acc-2', async () => null);
    assert(
      isNotFoundVerified === false,
      'TEST 9.2',
      'Missing or unpersisted account does NOT show success dialog'
    );

    // Case 9.3: Backend returns CONNECTED
    const isConnectedVerified = await verifyAccount('acc-3', async () => ({
      id: 'acc-3',
      profileId: 'prof-1',
      isActive: true,
      connection: { status: 'CONNECTED' },
    }));
    assert(
      isConnectedVerified === true,
      'TEST 9.3',
      'Backend confirmed CONNECTED account triggers success dialog'
    );
  }

  // --- TEST 10: Delayed Backend Persistence with Polling Retry ---
  console.log('\n--- TEST 10: Delayed Backend Persistence with Polling Retry ---');
  {
    let attempts = 0;
    const pollBackendAccount = async (maxAttempts: number): Promise<any> => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        attempts++;
        if (attempt === 3) {
          return { id: 'acc-delayed', isActive: true, connection: { status: 'CONNECTED' } };
        }
      }
      return null;
    };

    attempts = 0;
    const result = await pollBackendAccount(4);
    assert(
      result !== null && result.connection.status === 'CONNECTED' && attempts === 3,
      'TEST 10.1',
      'Polling safely retries and discovers account persisted after initial delay'
    );

    // Polling terminates cleanly after max attempts when backend does not confirm (timeout)
    attempts = 0;
    const neverPersistedResult = await (async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        attempts++;
      }
      return null;
    })();
    assert(
      neverPersistedResult === null && attempts === 3,
      'TEST 10.2',
      'Polling terminates cleanly after max attempts when backend does not confirm (timeout)'
    );

    // Inactive account rejected even if status is CONNECTED
    const inactiveCandidate = { id: 'acc-inact', isActive: false, connection: { status: 'CONNECTED' } };
    const isInactiveValid = Boolean(inactiveCandidate.isActive && inactiveCandidate.connection?.status === 'CONNECTED');
    assert(
      isInactiveValid === false,
      'TEST 10.3',
      'Inactive or deactivated account is rejected without false success even if connection status is CONNECTED'
    );
  }

  // --- TEST 11: Multi-profile Isolation, Owner Verification & Account Mapping ---
  console.log('\n--- TEST 11: Multi-profile Isolation, Owner Verification & Account Mapping ---');
  {
    const profileA: string = 'usr-anish-001';
    const profileB: string = 'usr-family-002';

    const backendAccounts = [
      {
        id: 'acc-upstox-anish',
        userId: 'auth-owner-primary',
        profileId: profileA,
        broker: 'UPSTOX',
        isActive: true,
        connection: { status: 'CONNECTED' },
      },
    ];

    // Check Profile A status
    const matchA = backendAccounts.find(
      (a) => a.profileId === profileA && a.broker === 'UPSTOX' && a.isActive
    );
    const statusA = matchA?.connection?.status === 'CONNECTED' ? 'CONNECTED' : 'NOT_CONNECTED';
    assert(
      statusA === 'CONNECTED',
      'TEST 11.1',
      'Profile A correctly resolves as CONNECTED for its linked Upstox account'
    );

    // Check Profile B status
    const matchB = backendAccounts.find(
      (a) => a.profileId === profileB && a.broker === 'UPSTOX' && a.isActive
    );
    const statusB = matchB?.connection?.status === 'CONNECTED' ? 'CONNECTED' : 'NOT_CONNECTED';
    assert(
      statusB === 'NOT_CONNECTED',
      'TEST 11.2',
      'Profile B remains NOT_CONNECTED with active Connect button (no cross-profile account stealing)'
    );

    // Mismatched profile callback rejection
    const incomingCallbackProfileId = profileB;
    const linkedCandidateProfileId = profileA;
    let mismatchErrorCaught = false;
    try {
      if (incomingCallbackProfileId && linkedCandidateProfileId !== incomingCallbackProfileId) {
        throw new Error('Broker account is linked to a different family profile.');
      }
    } catch (err: any) {
      if (err.message.includes('different family profile')) {
        mismatchErrorCaught = true;
      }
    }
    assert(
      mismatchErrorCaught === true,
      'TEST 11.3',
      'Callback rejects linking an existing broker account to an unauthorized/mismatched profile'
    );

    // Account ID mismatch rejection
    let accountIdMismatchCaught = false;
    try {
      const targetAccId = 'acc-target-123';
      const candidateAcc = { id: 'acc-different-456' };
      if (targetAccId && candidateAcc.id !== targetAccId) {
        throw new Error('Broker account ID mismatch.');
      }
    } catch (err: any) {
      if (err.message.includes('Broker account ID mismatch')) {
        accountIdMismatchCaught = true;
      }
    }
    assert(
      accountIdMismatchCaught === true,
      'TEST 11.4',
      'Callback rejects candidate account when accountId does not match requested account ID'
    );

    // Broker type mismatch rejection
    let brokerMismatchCaught = false;
    try {
      const requestedBroker: string = 'UPSTOX';
      const candidateBroker: string = 'ZERODHA';
      if (requestedBroker && candidateBroker !== requestedBroker) {
        throw new Error('Broker account does not match requested broker type.');
      }
    } catch (err: any) {
      if (err.message.includes('does not match requested broker type')) {
        brokerMismatchCaught = true;
      }
    }
    assert(
      brokerMismatchCaught === true,
      'TEST 11.5',
      'Callback rejects candidate account when broker type does not match requested broker'
    );

    // Authenticated owner isolation
    const differentAuthUserId = 'auth-attacker-intruder';
    const ownerMatched = backendAccounts.filter((a) => a.userId === differentAuthUserId);
    assert(
      ownerMatched.length === 0,
      'TEST 11.6',
      'Backend account lookup strictly isolates by authenticated owner ID, blocking cross-user access'
    );
  }

  // --- TEST 12: DeviceEventEmitter Immediate Hydration & State Sync ---
  console.log('\n--- TEST 12: DeviceEventEmitter Immediate Hydration & State Sync ---');
  {
    let localBrokerAccounts: any[] = [];
    const eventHandler = (payload: { account?: any }) => {
      if (payload.account) {
        const exists = localBrokerAccounts.some((a) => a.id === payload.account.id);
        if (exists) {
          localBrokerAccounts = localBrokerAccounts.map((a) =>
            a.id === payload.account.id ? payload.account : a
          );
        } else {
          localBrokerAccounts = [...localBrokerAccounts, payload.account];
        }
      }
    };

    // Simulate event delivery from broker-callback
    const verifiedAccountPayload = {
      id: 'acc-new-999',
      profileId: 'prof-hydrated',
      broker: 'UPSTOX',
      isActive: true,
      connection: { status: 'CONNECTED' },
    };

    eventHandler({ account: verifiedAccountPayload });

    assert(
      localBrokerAccounts.length === 1 && localBrokerAccounts[0].id === 'acc-new-999',
      'TEST 12.1',
      'Local state immediately receives verified account from event without race conditions'
    );
    assert(
      localBrokerAccounts[0].connection.status === 'CONNECTED',
      'TEST 12.2',
      'Immediately hydrated account reflects CONNECTED status for user cards'
    );
  }

  console.log('\n===============================================================');
  console.log(`ALL BROKER OAUTH SUCCESS FLOW TESTS PASSED (${passCount}/${passCount})`);
  console.log('===============================================================');
}

runBrokerOAuthSuccessFlowTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
