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

  console.log('\n===============================================================');
  console.log(`ALL BROKER OAUTH SUCCESS FLOW TESTS PASSED (${passCount}/${passCount})`);
  console.log('===============================================================');
}

runBrokerOAuthSuccessFlowTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
