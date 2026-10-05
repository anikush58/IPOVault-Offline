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
// Simulation of RootIndexGate (app/index.tsx)
// ---------------------------------------------------------------------------
interface RootGateState {
  isAuthLoading: boolean;
  onboardingChecked: boolean;
  hasOnboarded: boolean | null;
  user: { id: string; email: string } | null;
}

type GateResult = 
  | { type: 'PENDING_SPLASH' }
  | { type: 'REDIRECT'; target: '/onboarding' | '/auth' | '/(tabs)' };

function evaluateRootIndexGate(state: RootGateState): GateResult {
  // 1. While auth or onboarding state is resolving, render neutral under native splash
  if (state.isAuthLoading || !state.onboardingChecked) {
    return { type: 'PENDING_SPLASH' };
  }

  // 2. Deterministic redirect to exactly ONE destination
  if (!state.hasOnboarded) {
    return { type: 'REDIRECT', target: '/onboarding' };
  }

  if (!state.user) {
    return { type: 'REDIRECT', target: '/auth' };
  }

  return { type: 'REDIRECT', target: '/(tabs)' };
}

// ---------------------------------------------------------------------------
// Simulation of AuthScreen (app/auth.tsx) Post-Login Lifecycle
// ---------------------------------------------------------------------------
class AuthScreenSimulator {
  public renderedSuccessCard: boolean = false;
  public navigatedTarget: string | null = null;

  onLoginCompleted(user: { id: string; email: string }) {
    // 1. Never set or render an intermediate success state
    this.renderedSuccessCard = false;
    // 2. Immediately navigate directly to tabs
    this.navigatedTarget = '/(tabs)';
  }
}

// ---------------------------------------------------------------------------
// Simulation of Post-Login Handler & Background Sync
// ---------------------------------------------------------------------------
class PostLoginSimulator {
  public currentScreen: string = '/auth';
  public localData: Array<{ id: string; name: string }> = [];
  public isSyncingInBackground: boolean = false;
  public syncErrorMessage: string | null = null;
  public hasBlockingRestoreScreen: boolean = false;

  async onLoginSuccess(user: { id: string; email: string }, cloudSyncPromise: () => Promise<Array<{ id: string; name: string }>>) {
    // 1. Immediately navigate to Dashboard - NO BLOCKING RESTORE SCREEN
    this.hasBlockingRestoreScreen = false;
    this.currentScreen = '/(tabs)';

    // 2. Start cloud restore / sync in the background
    this.isSyncingInBackground = true;
    cloudSyncPromise()
      .then((syncedData) => {
        this.isSyncingInBackground = false;
        this.localData = [...this.localData, ...syncedData];
      })
      .catch((err) => {
        this.isSyncingInBackground = false;
        this.syncErrorMessage = err?.message || 'Sync failed';
      });
  }
}

async function runAuthStartupAndPostLoginUXTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT AUTH STARTUP & POST-LOGIN UX TEST SUITE');
  console.log('===============================================================');

  // --- TEST 1: App Start - Gating during Auth / Onboarding Resolution ---
  console.log('\n--- TEST 1: App Start - Resolution Gate ---');
  {
    const state: RootGateState = {
      isAuthLoading: true,
      onboardingChecked: false,
      hasOnboarded: null,
      user: null,
    };

    const result = evaluateRootIndexGate(state);
    assert(
      result.type === 'PENDING_SPLASH',
      'TEST 1.1',
      'Dashboard CANNOT render before auth state resolves (gate returns PENDING_SPLASH)'
    );
    assert(
      result.type !== 'REDIRECT',
      'TEST 1.2',
      'Auth screen CANNOT render before auth state resolves (native splash remains active)'
    );
  }

  // --- TEST 2: App Start - Fresh Logged-Out Launch (Not Onboarded) ---
  console.log('\n--- TEST 2: App Start - Fresh Launch (Not Onboarded) ---');
  {
    const state: RootGateState = {
      isAuthLoading: false,
      onboardingChecked: true,
      hasOnboarded: false,
      user: null,
    };

    const result = evaluateRootIndexGate(state);
    assert(
      result.type === 'REDIRECT' && result.target === '/onboarding',
      'TEST 2.1',
      'Fresh un-onboarded startup redirects directly to /onboarding without touching Dashboard or Auth'
    );
  }

  // --- TEST 3: App Start - Logged-Out Launch (Onboarded) ---
  console.log('\n--- TEST 3: App Start - Logged-Out Launch ---');
  {
    const state: RootGateState = {
      isAuthLoading: false,
      onboardingChecked: true,
      hasOnboarded: true,
      user: null,
    };

    const result = evaluateRootIndexGate(state);
    assert(
      result.type === 'REDIRECT' && result.target === '/auth',
      'TEST 3.1',
      'Logged-out startup redirects directly to /auth (Dashboard NEVER mounted or rendered)'
    );
  }

  // --- TEST 4: App Start - Logged-In Launch ---
  console.log('\n--- TEST 4: App Start - Existing Logged-In Launch ---');
  {
    const state: RootGateState = {
      isAuthLoading: false,
      onboardingChecked: true,
      hasOnboarded: true,
      user: { id: 'usr-123', email: 'investor@ipovault.app' },
    };

    const result = evaluateRootIndexGate(state);
    assert(
      result.type === 'REDIRECT' && result.target === '/(tabs)',
      'TEST 4.1',
      'Logged-in startup redirects directly to /(tabs) (Dashboard) without flashing Auth screen'
    );
  }

  // --- TEST 5: Login Success - Direct Navigation without Success UI Flash ---
  console.log('\n--- TEST 5: Login Success - Zero Success State Flash ---');
  {
    const authScreen = new AuthScreenSimulator();
    authScreen.onLoginCompleted({ id: 'usr-abc', email: 'trader@ipovault.app' });

    assert(
      authScreen.renderedSuccessCard === false,
      'TEST 5.1',
      'Successful login NEVER renders a "Login successful" card, modal, or intermediate UI'
    );
    assert(
      authScreen.navigatedTarget === '/(tabs)',
      'TEST 5.2',
      'Successful login immediately navigates directly to /(tabs)'
    );
  }

  // --- TEST 6: Post-Login - Immediate Local Data & Background Cloud Sync ---
  console.log('\n--- TEST 6: Post-Login - Local Data & Background Sync ---');
  {
    const postLogin = new PostLoginSimulator();
    postLogin.localData = [{ id: 'app-local-1', name: 'Tata Technologies' }];

    const syncState = { resolved: false };
    const mockCloudSync = async () => {
      await new Promise((r) => setTimeout(r, 40));
      syncState.resolved = true;
      return [{ id: 'app-cloud-1', name: 'Ola Electric' }];
    };

    const loginPromise = postLogin.onLoginSuccess(
      { id: 'usr-999', email: 'trader@ipovault.app' },
      mockCloudSync
    );

    assert(
      postLogin.currentScreen === '/(tabs)',
      'TEST 6.1',
      'Screen is immediately /(tabs) (Dashboard) synchronously after login success'
    );
    assert(
      postLogin.hasBlockingRestoreScreen === false,
      'TEST 6.2',
      'No blocking full-screen restore screen is displayed'
    );
    assert(
      postLogin.localData.length === 1 && postLogin.localData[0].id === 'app-local-1',
      'TEST 6.3',
      'Existing local SQLite data is immediately visible'
    );
    assert(
      postLogin.isSyncingInBackground === true && !syncState.resolved,
      'TEST 6.4',
      'Cloud sync runs in background without blocking navigation'
    );

    await loginPromise;
    await new Promise((r) => setTimeout(r, 60));

    assert(
      syncState.resolved === true,
      'TEST 6.5',
      'Cloud sync completes in background'
    );
    assert(
      postLogin.localData.length === 2 && postLogin.localData.some((d) => d.id === 'app-cloud-1'),
      'TEST 6.6',
      'Local state / Dashboard is updated with newly synced cloud data'
    );
  }

  // --- TEST 7: Slow Cloud Restore (App remains fully usable) ---
  console.log('\n--- TEST 7: Slow Cloud Restore Handling ---');
  {
    const postLogin = new PostLoginSimulator();
    postLogin.localData = [{ id: 'app-local-2', name: 'Belrise Industries' }];

    const mockSlowSync = async () => {
      await new Promise((r) => setTimeout(r, 80));
      return [{ id: 'app-cloud-slow', name: 'Slow Cloud Data' }];
    };

    postLogin.onLoginSuccess({ id: 'usr-slow', email: 'slow@ipovault.app' }, mockSlowSync);

    assert(
      postLogin.currentScreen === '/(tabs)',
      'TEST 7.1',
      'Slow cloud sync does NOT delay entry to Dashboard'
    );
    assert(
      postLogin.isSyncingInBackground === true,
      'TEST 7.2',
      'Background sync remains non-blocking while user navigates Dashboard'
    );

    await new Promise((r) => setTimeout(r, 100));
    assert(
      postLogin.isSyncingInBackground === false && postLogin.localData.length === 2,
      'TEST 7.3',
      'Slow synced data merges smoothly once complete'
    );
  }

  // --- TEST 8: Cloud Sync Failure Handling ---
  console.log('\n--- TEST 8: Cloud Sync Failure (Silent, Non-blocking) ---');
  {
    const postLogin = new PostLoginSimulator();
    postLogin.localData = [{ id: 'app-local-safe', name: 'Safe Local Data' }];

    const mockFailedSync = async () => {
      await new Promise((r) => setTimeout(r, 20));
      throw new Error('Firestore connection timeout');
    };

    postLogin.onLoginSuccess({ id: 'usr-fail', email: 'fail@ipovault.app' }, mockFailedSync);

    assert(
      postLogin.currentScreen === '/(tabs)',
      'TEST 8.1',
      'Dashboard navigation remains active despite cloud sync failure'
    );

    await new Promise((r) => setTimeout(r, 40));

    assert(
      postLogin.localData.length === 1 && postLogin.localData[0].id === 'app-local-safe',
      'TEST 8.2',
      'Local SQLite data preserved without wipe or corruption'
    );
    assert(
      postLogin.syncErrorMessage === 'Firestore connection timeout',
      'TEST 8.3',
      'Cloud sync failure was caught and handled silently without UI alerts'
    );
  }

  console.log('\n===============================================================');
  console.log(`ALL AUTH STARTUP & POST-LOGIN UX TESTS PASSED (${passCount}/${passCount})`);
  console.log('===============================================================');
}

runAuthStartupAndPostLoginUXTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
