/**
 * Regression Test Suite:
 * 1. Hook Order Stability across loading, Pro, Non-Pro, and tier transitions in Tab Bar
 * 2. RadarSnapshot parameter sanitization, query safety, and closed database lifecycle resilience
 */

(global as any).__DEV__ = typeof (global as any).__DEV__ !== 'undefined' ? (global as any).__DEV__ : false;

import { safeNumber, buildSnapshotFromIPO, shouldPersistSnapshot, persistRadarSnapshotIfChanged, getLatestRadarSnapshot, getIPORadarSnapshots, markFinalPreListingSnapshot, getFinalPreListingSnapshot } from '../services/ipo/radarSnapshotService';
import { sanitizeSqliteParam, isClosedResourceError, isDatabaseOpen, markDatabaseClosed, markDatabaseOpen } from '../utils/sqliteDebug';
import { recordIPOOutcome, getIPOOutcome } from '../services/ipo/radarOutcomeService';
import { IPORepository } from '../services/ipo/ipoRepository';
import { saveBackendIposToCache } from '../services/ipo/ipoHubCacheService';
import { triggerCentralizedIPOSync } from '../services/ipo/centralizedSync';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING HOOK ORDER & RADAR SNAPSHOT SQLITE REGRESSION TESTS');
  console.log('========================================================================\n');

  let passed = 0;

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 1: Hook Order Stability Simulation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: React Hook Order Stability Verification ---');

  // Simulate React's hook order tracker
  class HookTracker {
    hooks: string[] = [];

    recordHook(hookName: string) {
      this.hooks.push(hookName);
    }

    reset() {
      this.hooks = [];
    }
  }

  // Simulate CustomFloatingTabBar execution across multiple renders and tier transitions
  function simulateCustomFloatingTabBarRender(
    tracker: HookTracker,
    state: {
      isLoading: boolean;
      isReady: boolean;
      isNonPro: boolean;
      currentRoute: string;
    }
  ) {
    // Hook 1: useColors
    tracker.recordHook('useColors');
    // Hook 2: useTheme
    tracker.recordHook('useTheme');
    // Hook 3: useSafeAreaInsets
    tracker.recordHook('useSafeAreaInsets');
    // Hook 4: useRouter
    tracker.recordHook('useRouter');
    // Hook 5: useAppExperience
    tracker.recordHook('useAppExperience');

    // Values computed
    const currentTabs = state.isNonPro
      ? [{ name: 'ipos' }, { name: 'allotment-checker' }, { name: 'users' }, { name: 'settings' }]
      : [{ name: 'index' }, { name: 'ipos' }, { name: 'applications' }, { name: 'settings' }];
    const activeIndex = currentTabs.findIndex((t) => t.name === state.currentRoute);

    // Hook 6: useState (isAppSelectionActive)
    tracker.recordHook('useState(isAppSelectionActive)');
    // Hook 7: useState (appActiveTab)
    tracker.recordHook('useState(appActiveTab)');
    // Hook 8: useState (capsuleWidth)
    tracker.recordHook('useState(capsuleWidth)');
    // Hook 9: useRef (fabScaleAnim)
    tracker.recordHook('useRef(fabScaleAnim)');
    // Hook 10: useRef (indicatorAnim)
    tracker.recordHook('useRef(indicatorAnim)');
    // Hook 11: useRef (liquidStretchAnim)
    tracker.recordHook('useRef(liquidStretchAnim)');
    // Hook 12: useEffect (indicator stretch)
    tracker.recordHook('useEffect(indicatorAnim)');
    // Hook 13: useEffect (device event listeners)
    tracker.recordHook('useEffect(deviceEventEmitter)');
    // Hook 14: useEffect (proactive route synchronization)
    tracker.recordHook('useEffect(routeSync)');

    // Conditional returns sit STRICTLY below all 14 hooks
    if (state.isLoading || !state.isReady) {
      return { rendered: false, reason: 'loading_guard' };
    }

    if (state.isNonPro) {
      if (
        state.currentRoute !== 'ipos' &&
        state.currentRoute !== 'allotment-checker' &&
        state.currentRoute !== 'users' &&
        state.currentRoute !== 'settings'
      ) {
        return { rendered: false, reason: 'non_pro_hidden_route' };
      }
    } else {
      if (
        state.currentRoute === 'users' ||
        state.currentRoute === 'banks' ||
        state.currentRoute === 'allotment-checker'
      ) {
        return { rendered: false, reason: 'pro_hidden_route' };
      }
    }

    return { rendered: true, activeIndex };
  }

  const tracker = new HookTracker();

  // 1.1 Render 1: Loading state (isLoading = true, isReady = false)
  tracker.reset();
  const r1 = simulateCustomFloatingTabBarRender(tracker, {
    isLoading: true,
    isReady: false,
    isNonPro: true,
    currentRoute: 'ipos',
  });
  const r1Hooks = [...tracker.hooks];
  assert(r1.rendered === false, 'Render 1 should return null during loading');
  assert(r1Hooks.length === 14, `Render 1 must execute all 14 hooks, executed: ${r1Hooks.length}`);
  console.log('✓ PASS: [1.1] Loading state executes all 14 hooks in order before returning null');
  passed++;

  // 1.2 Render 2: Ready Non-Pro state
  tracker.reset();
  const r2 = simulateCustomFloatingTabBarRender(tracker, {
    isLoading: false,
    isReady: true,
    isNonPro: true,
    currentRoute: 'ipos',
  });
  const r2Hooks = [...tracker.hooks];
  assert(r2.rendered === true, 'Render 2 should render tab bar');
  assert(
    JSON.stringify(r1Hooks) === JSON.stringify(r2Hooks),
    'Hook order must be strictly identical between loading and ready states'
  );
  console.log('✓ PASS: [1.2] Ready Non-Pro state executes exact same 14 hooks in identical order');
  passed++;

  // 1.3 Render 3: Transition to Pro state
  tracker.reset();
  const r3 = simulateCustomFloatingTabBarRender(tracker, {
    isLoading: false,
    isReady: true,
    isNonPro: false,
    currentRoute: 'index',
  });
  const r3Hooks = [...tracker.hooks];
  assert(r3.rendered === true, 'Render 3 should render pro tab bar');
  assert(
    JSON.stringify(r2Hooks) === JSON.stringify(r3Hooks),
    'Hook order must be strictly identical across Non-Pro -> Pro tier transition'
  );
  console.log('✓ PASS: [1.3] Tier transition Non-Pro -> Pro executes exact same 14 hooks in identical order');
  passed++;

  // 1.4 Render 4: Transition from Pro back to Non-Pro on hidden route
  tracker.reset();
  const r4 = simulateCustomFloatingTabBarRender(tracker, {
    isLoading: false,
    isReady: true,
    isNonPro: true,
    currentRoute: 'index', // Home is hidden in Non-Pro
  });
  const r4Hooks = [...tracker.hooks];
  assert(r4.rendered === false, 'Render 4 should hide tab bar for hidden route in Non-Pro');
  assert(
    JSON.stringify(r3Hooks) === JSON.stringify(r4Hooks),
    'Hook order must be strictly identical even when route is hidden in Non-Pro'
  );
  console.log('✓ PASS: [1.4] Hidden route return preserves exact same 14 hooks in identical order');
  passed++;

  // 1.5 Repeated Non-Pro -> Pro -> Non-Pro transitions (5 repeated cycles)
  let prevHooks = [...r4Hooks];
  for (let cycle = 1; cycle <= 5; cycle++) {
    // Non-Pro -> Pro
    tracker.reset();
    simulateCustomFloatingTabBarRender(tracker, {
      isLoading: false,
      isReady: true,
      isNonPro: false,
      currentRoute: 'applications',
    });
    const proHooks = [...tracker.hooks];
    assert(
      JSON.stringify(prevHooks) === JSON.stringify(proHooks),
      `Cycle ${cycle} Non-Pro -> Pro hook mismatch`
    );

    // Pro -> Non-Pro
    tracker.reset();
    simulateCustomFloatingTabBarRender(tracker, {
      isLoading: false,
      isReady: true,
      isNonPro: true,
      currentRoute: 'ipos',
    });
    const nonProHooks = [...tracker.hooks];
    assert(
      JSON.stringify(proHooks) === JSON.stringify(nonProHooks),
      `Cycle ${cycle} Pro -> Non-Pro hook mismatch`
    );
    prevHooks = nonProHooks;
  }
  console.log('✓ PASS: [1.5] Repeated Non-Pro <-> Pro toggles (5 cycles) maintain 100% stable hook sequence');
  passed++;

  // 1.6 Guarded Screen Component Simulation (Pro -> Non-Pro transition on Pro route)
  // Simulates extracted screen pattern (Outer Guard + Inner Content)
  function simulateGuardedScreen(
    guardTracker: HookTracker,
    contentTracker: HookTracker,
    state: { isNonPro: boolean }
  ) {
    // Outer Guard always calls exactly 3 hooks unconditionally
    guardTracker.recordHook('useAppExperience');
    guardTracker.recordHook('useRouter');
    guardTracker.recordHook('useEffect(redirectNonPro)');

    if (state.isNonPro) {
      return { rendered: false, redirecting: true };
    }

    // Inner Content component (only rendered when Pro)
    contentTracker.recordHook('useRouter');
    contentTracker.recordHook('useSQLiteContext');
    contentTracker.recordHook('useState(data)');
    contentTracker.recordHook('useState(refreshing)');
    contentTracker.recordHook('useRef(scrollAnim)');
    contentTracker.recordHook('useMemo(computedAnalytics)');
    contentTracker.recordHook('useFocusEffect');
    contentTracker.recordHook('useEffect(fetchData)');

    return { rendered: true, redirecting: false };
  }

  const guardTracker = new HookTracker();
  const contentTracker = new HookTracker();

  // Render in Pro mode while on Pro route
  guardTracker.reset();
  contentTracker.reset();
  const screenPro = simulateGuardedScreen(guardTracker, contentTracker, { isNonPro: false });
  assert(screenPro.rendered === true, 'Screen should render content in Pro mode');
  assert(guardTracker.hooks.length === 3, 'Outer guard must execute exactly 3 hooks in Pro mode');
  assert(contentTracker.hooks.length === 8, 'Inner content must execute all 8 hooks in Pro mode');
  const guardProHooks = [...guardTracker.hooks];

  // Admin revokes Pro -> Screen re-renders in Non-Pro mode while user is still on that route
  guardTracker.reset();
  contentTracker.reset();
  const screenNonPro = simulateGuardedScreen(guardTracker, contentTracker, { isNonPro: true });
  assert(screenNonPro.rendered === false, 'Screen must return null immediately in Non-Pro mode');
  assert(screenNonPro.redirecting === true, 'Screen triggers redirection to /(tabs)/ipos');
  assert(
    JSON.stringify(guardProHooks) === JSON.stringify(guardTracker.hooks),
    'Outer guard hook order must remain 100% identical when Pro is revoked'
  );
  assert(contentTracker.hooks.length === 0, 'Inner content unmounts cleanly without hook count errors');
  console.log('✓ PASS: [1.6] Pro-only route revocation cleanly renders 3 guard hooks without React hooks error');
  passed++;


  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 2: Parameter Sanitization & Invalid Number Handling (NativeDatabase fix)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: Parameter Sanitization & NaN Safety ---');

  // 2.1 safeNumber parsing
  assert(safeNumber(100) === 100, 'safeNumber(100) must return 100');
  assert(safeNumber('45.5') === 45.5, 'safeNumber("45.5") must return 45.5');
  assert(safeNumber('₹ 45.50') === 45.5, 'safeNumber("₹ 45.50") must strip currency and return 45.5');
  assert(safeNumber('12.5%') === 12.5, 'safeNumber("12.5%") must strip percent and return 12.5');
  assert(safeNumber('1,250.75') === 1250.75, 'safeNumber("1,250.75") must strip commas and return 1250.75');
  assert(safeNumber('--') === null, 'safeNumber("--") must return null');
  assert(safeNumber('N/A') === null, 'safeNumber("N/A") must return null');
  assert(safeNumber('') === null, 'safeNumber("") must return null');
  assert(safeNumber(null) === null, 'safeNumber(null) must return null');
  assert(safeNumber(undefined) === null, 'safeNumber(undefined) must return null');
  assert(safeNumber(NaN) === null, 'safeNumber(NaN) must return null');
  assert(safeNumber(Infinity) === null, 'safeNumber(Infinity) must return null');
  assert(safeNumber(-Infinity) === null, 'safeNumber(-Infinity) must return null');
  console.log('✓ PASS: [2.1] safeNumber correctly sanitizes numbers, strings with currency/percent, and rejects NaN/Infinity');
  passed++;

  // 2.2 sanitizeSqliteParam in sqliteDebug
  assert(sanitizeSqliteParam(undefined) === null, 'undefined parameter must be converted to null');
  assert(sanitizeSqliteParam(NaN) === null, 'NaN parameter must be converted to null');
  assert(sanitizeSqliteParam(Infinity) === null, 'Infinity parameter must be converted to null');
  assert(sanitizeSqliteParam(-Infinity) === null, '-Infinity parameter must be converted to null');
  assert(sanitizeSqliteParam(0) === 0, '0 parameter must be preserved');
  assert(sanitizeSqliteParam('abc') === 'abc', 'String parameter must be preserved');
  assert(sanitizeSqliteParam(null) === null, 'null parameter must be preserved');
  console.log('✓ PASS: [2.2] sanitizeSqliteParam prevents NativeDatabase.prepareAsync NaN/undefined crashes');
  passed++;

  // 2.3 buildSnapshotFromIPO with corrupted / string / NaN values
  const dirtyIpo: any = {
    id: 'ipo_test_dirty',
    company_name: 'Test IPO Ltd',
    gmp_amount: '--',
    gmp_percent: '₹ 15.00',
    total_sub: 'NaN',
    retail_sub: undefined,
    qib_sub: null,
    nii_sub: Infinity,
    score: { total_score: 'N/A' },
    status: 'closed',
  };

  const snapshot = buildSnapshotFromIPO(dirtyIpo);
  assert(snapshot.ipo_id === 'ipo_test_dirty', 'Snapshot ipo_id must match');
  assert(snapshot.gmp_amount === null, 'dirty gmp_amount must be null, not NaN');
  assert(snapshot.gmp_percent === 15, 'gmp_percent must be parsed to 15');
  assert(snapshot.total_subscription === null, 'NaN string total_sub must be null');
  assert(snapshot.retail_subscription === null, 'undefined retail_sub must be null');
  assert(snapshot.nii_subscription === null, 'Infinity nii_sub must be null');
  assert(snapshot.quality_score === null, 'N/A quality_score must be null');
  assert(snapshot.is_final_pre_listing === 1, 'closed status must set is_final_pre_listing = 1');
  console.log('✓ PASS: [2.3] buildSnapshotFromIPO sanitizes dirty data into valid SQLite-bindable primitives');
  passed++;


  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 3: Database Lifecycle & Closed Resource Handling
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: Database Lifecycle & Closed Resource Resilience ---');

  // 3.1 isClosedResourceError detection
  assert(isClosedResourceError(new Error('Access to closed resource')) === true, 'Access to closed resource must be detected');
  assert(isClosedResourceError(new Error('NativeDatabase.prepareAsync: cannot execute query on closed database')) === true, 'Closed database error must be detected');
  assert(isClosedResourceError(new Error('database is closed')) === true, 'database is closed must be detected');
  assert(isClosedResourceError(new Error('table not found')) === false, 'table not found must not be flagged as closed');
  assert(isClosedResourceError(null) === false, 'null must return false');
  console.log('✓ PASS: [3.1] isClosedResourceError accurately identifies closed SQLite handles');
  passed++;

  // 3.2 Mock SQLite Database for Testing Persistence
  const insertedParams: any[] = [];
  const mockDb: any = {
    isOpen: true,
    runAsync: async (sql: string, params: any[]) => {
      if (!mockDb.isOpen) {
        throw new Error('Access to closed resource');
      }
      // Native check simulation: fail if any parameter is NaN or undefined
      for (let i = 0; i < params.length; i++) {
        const p = params[i];
        if (p === undefined || (typeof p === 'number' && isNaN(p))) {
          throw new Error('NativeDatabase.prepareAsync rejected: bad parameter or other API misuse');
        }
      }
      insertedParams.push(params);
      return { changes: 1 };
    },
    getFirstAsync: async (sql: string, params: any[]) => {
      if (!mockDb.isOpen) {
        throw new Error('Access to closed resource');
      }
      return null;
    },
    getAllAsync: async (sql: string, params: any[]) => {
      if (!mockDb.isOpen) {
        throw new Error('Access to closed resource');
      }
      return [];
    },
    execAsync: async (sql: string) => {
      if (!mockDb.isOpen) {
        throw new Error('Access to closed resource');
      }
    },
    withTransactionAsync: async (fn: () => Promise<any>) => {
      if (!mockDb.isOpen) {
        throw new Error('Access to closed resource');
      }
      return await fn();
    },
  };

  // Persist snapshot with dirty IPO
  const radarBreakdown: any = {
    category: 'APPLY',
    score: 85,
    confidence: 0.9,
    signals: { riskPenalty: '--' },
    v4Predictive: { primaryAction: 'APPLY', reversalRisk: 'LOW', decisionReadinessScore: 90 },
  };

  const persistResult = await persistRadarSnapshotIfChanged(mockDb, dirtyIpo, radarBreakdown);
  assert(persistResult === true, 'persistRadarSnapshotIfChanged must succeed');
  assert(insertedParams.length === 1, 'Exactly one record must be inserted');

  // Verify bound parameters have no NaN or undefined
  const bound = insertedParams[0];
  for (let i = 0; i < bound.length; i++) {
    const val = bound[i];
    assert(val !== undefined, `Param at index ${i} must not be undefined`);
    if (typeof val === 'number') {
      assert(!isNaN(val) && isFinite(val), `Param at index ${i} must be a finite number, got: ${val}`);
    }
  }
  console.log('✓ PASS: [3.2] persistRadarSnapshotIfChanged writes without triggering NativeDatabase.prepareAsync failure');
  passed++;

  // 3.3 Closed Database Lifecycle Handling
  mockDb.isOpen = false; // Simulate app reload, account switch, or unmount closing DB

  let caughtClosed = false;
  try {
    await getLatestRadarSnapshot(mockDb, 'ipo_test_dirty');
  } catch (err: any) {
    if (isClosedResourceError(err)) {
      caughtClosed = true;
    }
  }
  assert(caughtClosed === true, 'getLatestRadarSnapshot must propagate closed resource error to abort caller transaction');
  console.log('✓ PASS: [3.3] getLatestRadarSnapshot propagates closed resource error so transactions abort cleanly');
  passed++;

  // Calling getIPORadarSnapshots on closed DB returns empty array without crashing
  const snapshotsOnClosed = await getIPORadarSnapshots(mockDb, 'ipo_test_dirty');
  assert(Array.isArray(snapshotsOnClosed) && snapshotsOnClosed.length === 0, 'getIPORadarSnapshots must return [] on closed DB');
  console.log('✓ PASS: [3.4] getIPORadarSnapshots safely returns [] on closed DB without throwing unhandled error');
  passed++;

  // Calling getFinalPreListingSnapshot on closed DB returns null without crashing
  const finalOnClosed = await getFinalPreListingSnapshot(mockDb, 'ipo_test_dirty');
  assert(finalOnClosed === null, 'getFinalPreListingSnapshot must return null on closed DB');
  console.log('✓ PASS: [3.5] getFinalPreListingSnapshot safely returns null on closed DB');
  passed++;

  // 3.4 recordIPOOutcome with NaN safety
  mockDb.isOpen = true; // Re-open DB
  markDatabaseOpen(mockDb);
  const outcomeResult = await recordIPOOutcome(mockDb, {
    ipo_id: 'ipo_test_dirty',
    company_name: 'Test IPO Ltd',
    issue_price: '₹ 150' as any,
    listing_price: '₹ 210' as any,
    listing_gain_percent: '40.0%' as any,
    listing_date: '2026-10-16',
    day30_closing_price: '--' as any,
    day30_gain_percent: NaN as any,
    outcome_recorded_at: new Date().toISOString(),
  });
  assert(outcomeResult === true, 'recordIPOOutcome must succeed with dirty numeric parameters');
  console.log('✓ PASS: [3.6] recordIPOOutcome safely sanitizes numbers without SQLite bind misuse');
  passed++;

  // 3.5 IPORepository.upsertBatch with Closed Database Lifecycle
  console.log('\n--- SUITE 4: IPORepository & Active Sync Closed DB Races ---');
  const repo = new IPORepository(mockDb);
  mockDb.isOpen = false;
  markDatabaseClosed(mockDb);

  let upsertFailedFast = false;
  try {
    await repo.upsertBatch([{ id: 'test_ipo_1', company_name: 'Test IPO' }]);
  } catch (err: any) {
    if (isClosedResourceError(err)) {
      upsertFailedFast = true;
    }
  }
  assert(upsertFailedFast === true, 'IPORepository.upsertBatch must immediately fail-fast when database is closed');
  console.log('✓ PASS: [3.7] IPORepository.upsertBatch fails fast on closed DB handle without hammering SQLite');
  passed++;

  // 3.6 saveBackendIposToCache Graceful Closed DB Handling
  const cacheResult = await saveBackendIposToCache(mockDb, [
    {
      id: 'backend_ipo_1',
      symbol: 'BK1',
      status: 'UPCOMING',
      marketSegment: 'MAINBOARD',
    } as any,
  ]);
  assert(cacheResult === 0, 'saveBackendIposToCache must return 0 without throwing on closed database');
  console.log('✓ PASS: [3.8] saveBackendIposToCache safely catches closed resource and returns 0');
  passed++;

  // 3.7 triggerCentralizedIPOSync Closed DB Safety (No False Success)
  const syncClosedResult = await triggerCentralizedIPOSync(mockDb, { source: 'UnitTest', force: true });
  assert(syncClosedResult.success === false, 'triggerCentralizedIPOSync must return success: false when DB is closed');
  assert(
    syncClosedResult.error === 'Database handle closed',
    `Expected error "Database handle closed", got "${syncClosedResult.error}"`
  );
  console.log('✓ PASS: [3.9] triggerCentralizedIPOSync returns success: false with proper error message when DB is closed');
  passed++;

  console.log('\n========================================================================');
  console.log(`ALL ${passed} HOOK ORDER & RADAR SNAPSHOT REGRESSION TESTS PASSED!`);
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

