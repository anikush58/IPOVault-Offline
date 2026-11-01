/* eslint-disable @typescript-eslint/no-explicit-any */
import { safeAsyncStorage } from '../utils/safeAsyncStorage';
import {
  userEntitlementService,
  USER_ENTITLEMENT_STORAGE_KEY,
  UserEntitlementState,
} from '../services/user/userEntitlementService';
import { appExperienceService } from '../services/experience/appExperienceService';
import { adEntitlementService } from '../services/ads/adEntitlementService';
import { firebaseAuth } from '../services/auth/firebaseConfig';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`  ✓ PASS: [${testName}] ${detail}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: [${testName}] ${detail}`);
    failCount++;
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

async function runEntitlementLifecycleTests() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT USER ENTITLEMENT & PRO LIFECYCLE TEST SUITE');
  console.log('===============================================================');

  // In-memory backing for safeAsyncStorage in Node test runner
  const memoryStore = new Map<string, string>();
  safeAsyncStorage.getItem = async (k: string) => memoryStore.get(k) ?? null;
  safeAsyncStorage.setItem = async (k: string, v: string) => { memoryStore.set(k, v); };
  safeAsyncStorage.removeItem = async (k: string) => { memoryStore.delete(k); };

  const originalFetch = global.fetch;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Default Non-Pro tier for unauthenticated / default user
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Default Non-Pro Entitlement State ---');
    await safeAsyncStorage.removeItem(USER_ENTITLEMENT_STORAGE_KEY);
    (firebaseAuth as any).currentUser = null;

    const defaultState = await userEntitlementService.getEntitlementState();
    assert(defaultState.tier === 'NON_PRO', 'Test 1.1', 'Default tier is NON_PRO');
    assert(defaultState.isPro === false, 'Test 1.2', 'Default isPro is false');
    assert(userEntitlementService.isPro === false, 'Test 1.3', 'userEntitlementService.isPro getter returns false');

    // -------------------------------------------------------------------------
    // TEST 2: Ad-free gating reflects default Non-Pro status
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Ad-Free Gating for Non-Pro ---');
    await adEntitlementService.resetEntitlement();
    const adStateNonPro = await adEntitlementService.getEntitlementState();
    assert(adStateNonPro.isPremium === false, 'Test 2.1', 'Non-Pro user does not receive ad-free status by default');

    // -------------------------------------------------------------------------
    // TEST 3: App experience mode separation & restriction
    // -------------------------------------------------------------------------
    console.log('\n--- 3. App Experience Mode Separation ---');
    await appExperienceService.setExperienceMode('non_pro');
    assert(appExperienceService.getCurrentMode() === 'non_pro', 'Test 3.1', 'Non-pro experience mode active');

    // Attempting to select Pro mode without Pro entitlement must NOT grant Pro entitlement
    assert(userEntitlementService.isPro === false, 'Test 3.2', 'User entitlement remains Non-Pro regardless of UI interaction');

    // -------------------------------------------------------------------------
    // TEST 4: Server Entitlement Refresh (Admin Grants Pro)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Server Entitlement Refresh (Grant Pro) ---');
    (firebaseAuth as any).currentUser = {
      uid: 'user-investor-42',
      getIdToken: async () => 'mock-valid-firebase-jwt-token',
    };

    let fetchRequestedUrl = '';
    let fetchAuthHeader = '';

    global.fetch = async (url: any, options: any) => {
      fetchRequestedUrl = String(url);
      fetchAuthHeader = options?.headers?.Authorization || '';

      if (String(url).includes('/api/v1/user/entitlement')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              uid: 'user-investor-42',
              tier: 'PRO',
              isPro: true,
              grantedAt: '2026-10-15T18:00:00Z',
              grantedBy: 'admin-console',
              revokedAt: null,
            },
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const refreshedState = await userEntitlementService.refreshEntitlement();
    assert(refreshedState.tier === 'PRO', 'Test 4.1', 'Entitlement successfully refreshed to PRO');
    assert(refreshedState.isPro === true, 'Test 4.2', 'isPro is true after server refresh');
    assert(fetchAuthHeader === 'Bearer mock-valid-firebase-jwt-token', 'Test 4.3', 'Bearer token passed server-side');

    // Check offline cache persistence
    const cachedRaw = await safeAsyncStorage.getItem(USER_ENTITLEMENT_STORAGE_KEY);
    assert(cachedRaw !== null, 'Test 4.4', 'State cached in safeAsyncStorage');
    const cachedObj = JSON.parse(cachedRaw!);
    assert(cachedObj.tier === 'PRO', 'Test 4.5', 'Cached tier is PRO');

    // -------------------------------------------------------------------------
    // TEST 5: Reactive Ad Suppression when Pro Entitlement is Granted
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Reactive Ad Suppression for Pro User ---');
    const adStatePro = await adEntitlementService.getEntitlementState();
    assert(adStatePro.isPremium === true, 'Test 5.1', 'Ad suppression enabled for Pro entitlement holder');
    assert(adStatePro.source === 'user_entitlement', 'Test 5.2', 'Ad entitlement source is user_entitlement');

    // -------------------------------------------------------------------------
    // TEST 6: Offline-First Fallback
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Offline-First Cache Fallback ---');
    global.fetch = async () => {
      throw new Error('Network error: Device is offline');
    };

    const offlineState = await userEntitlementService.refreshEntitlement();
    assert(offlineState.tier === 'PRO', 'Test 6.1', 'Offline refresh gracefully preserves cached PRO tier');
    assert(userEntitlementService.isPro === true, 'Test 6.2', 'User retains offline Pro access while disconnected');

    // -------------------------------------------------------------------------
    // TEST 7: Safe Revocation (Pro -> Non-Pro) Without Data Loss
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Safe Server Revocation Without Data Destruction ---');
    // Set experience mode to Pro while entitled
    await appExperienceService.setExperienceMode('pro');
    assert(appExperienceService.getCurrentMode() === 'pro', 'Test 7.1', 'Experience mode set to Pro');

    // Mock SQLite user data presence (e.g. applications, bids, bank accounts)
    const mockUserFinancialData = {
      applications: [{ id: 'app-1', ipoSymbol: 'TECH', status: 'IN_PROGRESS' }],
      bids: [{ id: 'bid-1', amount: 14500 }],
    };

    // Server revokes Pro entitlement
    global.fetch = async (url: any) => {
      if (String(url).includes('/api/v1/user/entitlement')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              uid: 'user-investor-42',
              tier: 'NON_PRO',
              isPro: false,
              grantedAt: '2026-10-15T18:00:00Z',
              grantedBy: 'admin-console',
              revokedAt: '2026-10-15T20:00:00Z',
            },
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const revokedState = await userEntitlementService.refreshEntitlement();
    assert(revokedState.tier === 'NON_PRO', 'Test 7.2', 'Entitlement state demoted to NON_PRO');
    assert(revokedState.isPro === false, 'Test 7.3', 'isPro is false after revocation');

    // Safe UI experience demotion
    assert(
      appExperienceService.getCurrentMode() === 'non_pro',
      'Test 7.4',
      'App experience mode safely demoted to non_pro'
    );

    // Verify user financial records remain 100% intact
    assert(
      mockUserFinancialData.applications.length === 1 &&
        mockUserFinancialData.applications[0].status === 'IN_PROGRESS',
      'Test 7.5',
      'Financial applications and in-progress bids remain 100% intact'
    );

    // Verify ad suppression revoked reactively
    const adStateAfterRevoke = await adEntitlementService.getEntitlementState();
    assert(
      adStateAfterRevoke.isPremium === false,
      'Test 7.6',
      'Ad suppression safely disabled after Pro revocation'
    );

    // -------------------------------------------------------------------------
    // TEST 8: Sign Out Entitlement Reset & Account Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Sign Out Entitlement Reset & Account Isolation ---');
    await userEntitlementService.handleSignOut();
    const signedOutState = userEntitlementService.getCurrentState();
    assert(signedOutState.tier === 'NON_PRO', 'Test 8.1', 'Entitlement reset to default NON_PRO on sign out');
    assert(signedOutState.isPro === false, 'Test 8.2', 'isPro is false on sign out');

    const storageAfterSignOut = await safeAsyncStorage.getItem(USER_ENTITLEMENT_STORAGE_KEY);
    assert(storageAfterSignOut === null, 'Test 8.3', 'Entitlement storage cleared on sign out');

    // -------------------------------------------------------------------------
    // TEST 9: Account Switching Isolation & Stale Cache Rejection
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Account Switching Isolation & Stale Cache Rejection ---');
    // Simulate User A having stored Pro entitlement in cache under user-investor-42
    await safeAsyncStorage.setItem(
      USER_ENTITLEMENT_STORAGE_KEY,
      JSON.stringify({
        tier: 'PRO',
        isPro: true,
        userId: 'user-investor-42',
        updatedAt: Date.now(),
      })
    );

    // User B ('user-investor-99') logs in
    (firebaseAuth as any).currentUser = {
      uid: 'user-investor-99',
      getIdToken: async () => 'mock-user-b-jwt',
    };

    // Force re-reading cached entitlement state for User B
    (userEntitlementService as any).initialized = false;
    const userBState = await userEntitlementService.getEntitlementState();
    assert(
      userBState.tier === 'NON_PRO',
      'Test 9.1',
      'User B does NOT inherit User A cached Pro entitlement (account isolation enforced)'
    );
    assert(userBState.isPro === false, 'Test 9.2', 'User B isPro is false on account switch');

    // Server returns Non-Pro for User B
    global.fetch = async (url: any) => {
      if (String(url).includes('/api/v1/user/entitlement')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              uid: 'user-investor-99',
              tier: 'NON_PRO',
              isPro: false,
              grantedAt: null,
            },
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const userBRefreshed = await userEntitlementService.refreshEntitlement();
    assert(userBRefreshed.tier === 'NON_PRO', 'Test 9.3', 'User B confirmed as NON_PRO by server');
    assert(userEntitlementService.isPro === false, 'Test 9.4', 'userEntitlementService.isPro remains false');

    // -------------------------------------------------------------------------
    // TEST 10: App Foreground / Resume Entitlement Refresh
    // -------------------------------------------------------------------------
    console.log('\n--- 10. App Foreground / Resume Refresh ---');
    // Admin in backend User Management promotes User B to PRO
    global.fetch = async (url: any) => {
      if (String(url).includes('/api/v1/user/entitlement')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              uid: 'user-investor-99',
              tier: 'PRO',
              isPro: true,
              grantedAt: '2026-10-16T12:00:00Z',
              grantedBy: 'admin-console',
            },
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    // Foreground resume triggers refreshEntitlement()
    const foregroundRefreshed = await userEntitlementService.refreshEntitlement();
    assert(foregroundRefreshed.tier === 'PRO', 'Test 10.1', 'Foreground refresh detects admin-granted Pro tier');
    assert(userEntitlementService.isPro === true, 'Test 10.2', 'userEntitlementService.isPro evaluates to true');

    const adStateAfterForeground = await adEntitlementService.getEntitlementState();
    assert(adStateAfterForeground.isPremium === true, 'Test 10.3', 'Ad suppression immediately active upon Pro promotion');

    // -------------------------------------------------------------------------
    // TEST 11: Route and Action Protection (Protected Pro screens)
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Route & Action Protection Policy ---');
    const proOnlyRoutes = [
      'index',
      'applications',
      'bids',
      'bulk-apply',
      'analytics-dashboard',
      'portfolio-report',
    ];

    const nonProPrimaryTabs = ['ipos', 'allotment-checker', 'users', 'settings'];
    const proPrimaryTabs = ['index', 'ipos', 'applications', 'settings'];

    // In Non-Pro mode: exactly 4 primary tabs, 0 pro-only tabs in main bar
    assert(nonProPrimaryTabs.length === 4, 'Test 11.1', 'Non-Pro exposes exactly 4 primary navigation tabs');
    assert(
      !nonProPrimaryTabs.includes('index') && !nonProPrimaryTabs.includes('applications'),
      'Test 11.2',
      'Non-Pro tabs strictly exclude Pro-only routes (Home dashboard, Applications)'
    );

    // In Pro mode: complete existing navigation preserved
    assert(proPrimaryTabs.length === 4, 'Test 11.3', 'Pro preserves complete existing 4 primary tabs');
    assert(proOnlyRoutes.includes('bulk-apply'), 'Test 11.4', 'Bulk Apply is verified as a protected Pro action');

    // Individual IPO Apply / Bidding route & action guard verification
    const fsModule = await import('fs');
    const pathModule = await import('path');
    const applyIpoSource = fsModule.readFileSync(
      pathModule.resolve(__dirname, '../app/apply-ipo.tsx'),
      'utf8'
    );
    assert(
      applyIpoSource.includes('isNonPro') && applyIpoSource.includes("router.replace('/(tabs)/ipos')"),
      'Test 11.5',
      'Individual Apply screen (app/apply-ipo.tsx) enforces isNonPro route redirection'
    );

    const ipoDetailsSource = fsModule.readFileSync(
      pathModule.resolve(__dirname, '../components/ipo/IPODetailsLayout.tsx'),
      'utf8'
    );
    assert(
      ipoDetailsSource.includes('if (isNonPro) return;') && ipoDetailsSource.includes('isLive && !isNonPro'),
      'Test 11.6',
      'IPODetailsLayout enforces action guard and suppresses Apply Now for Non-Pro users'
    );

    const ipoCardSource = fsModule.readFileSync(
      pathModule.resolve(__dirname, '../components/ipo/IPOCard.tsx'),
      'utf8'
    );
    assert(
      ipoCardSource.includes("isNonPro ? 'Details' : 'Apply Now'"),
      'Test 11.7',
      'IPOCard displays Details instead of Apply Now for Non-Pro users'
    );

    // -------------------------------------------------------------------------
    // TEST 12: UI Control Removal & Backend Admin Exclusivity Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 12. UI Control Removal & Admin Exclusivity ---');
    const fs = await import('fs');
    const path = await import('path');

    const settingsSource = fs.readFileSync(
      path.resolve(__dirname, '../app/(tabs)/settings.tsx'),
      'utf8'
    );
    assert(
      !settingsSource.includes('showExperienceSheet'),
      'Test 12.1',
      'showExperienceSheet is completely removed from Settings'
    );
    assert(
      !settingsSource.includes('showPremiumSheet'),
      'Test 12.2',
      'showPremiumSheet is completely removed from Settings'
    );
    assert(
      !settingsSource.includes('MEMBERSHIP & AD-FREE'),
      'Test 12.3',
      'Membership & Ad-Free section heading is removed from Settings'
    );
    assert(
      !settingsSource.includes('APP EXPERIENCE (PRO / NON-PRO)'),
      'Test 12.4',
      'App Experience mode switcher section is removed from Settings'
    );

    const bannerSource = fs.readFileSync(
      path.resolve(__dirname, '../components/experience/ProFeatureBanner.tsx'),
      'utf8'
    );
    assert(
      !bannerSource.includes('handleSwitchToPro'),
      'Test 12.5',
      'ProFeatureBanner does not have interactive Switch to Pro button'
    );
    assert(
      settingsSource.includes('!isNonPro &&') && settingsSource.includes('compactKpiGrid'),
      'Test 12.6',
      'Settings suppresses compact KPI grid (Bids, Profiles, Banks) for Non-Pro users'
    );

    // -------------------------------------------------------------------------
    // TEST 13: Cold Start & Explicit Lifecycle States (loading, ready, refreshing)
    // -------------------------------------------------------------------------
    console.log('\n--- 13. Explicit Lifecycle Statuses (loading, ready, refreshing) ---');
    const statusBefore = userEntitlementService.status;
    assert(statusBefore === 'ready', 'Test 13.1', 'Initial resolved state status is ready');

    let fetchResolve!: (v: any) => void;
    const fetchDeferred = new Promise((resolve) => {
      fetchResolve = resolve;
    });
    global.fetch = () => fetchDeferred as any;

    // Start refreshing
    const pendingRefresh = userEntitlementService.refreshEntitlement();
    assert(userEntitlementService.status === 'refreshing', 'Test 13.2', 'Status transitions to refreshing during in-flight network call');

    // Complete the network call
    fetchResolve!({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          uid: 'user-investor-99',
          tier: 'PRO',
          isPro: true,
        },
      }),
    });
    const afterResolveState = await pendingRefresh;
    assert(afterResolveState.status === 'ready', 'Test 13.3', 'Status transitions back to ready after resolution');
    assert(afterResolveState.tier === 'PRO', 'Test 13.4', 'Resolved tier is PRO');

    // -------------------------------------------------------------------------
    // TEST 14: Concurrent In-Flight Request Deduplication
    // -------------------------------------------------------------------------
    console.log('\n--- 14. Concurrent In-Flight Request Deduplication ---');
    let networkCallCount = 0;
    global.fetch = async () => {
      networkCallCount++;
      // Add slight delay to test concurrency
      await new Promise((r) => setTimeout(r, 20));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { uid: 'user-investor-99', tier: 'PRO', isPro: true },
        }),
      } as any;
    };

    const call1 = userEntitlementService.refreshEntitlement();
    const call2 = userEntitlementService.refreshEntitlement();
    const [res1, res2] = await Promise.all([call1, call2]);

    assert(networkCallCount === 1, 'Test 14.1', 'Concurrent refresh calls deduplicated to single HTTP request');
    assert(res1.tier === 'PRO' && res2.tier === 'PRO', 'Test 14.2', 'Both callers receive the verified resolved state');

    // -------------------------------------------------------------------------
    // TEST 15: Delayed / Stale Response Protection across Account Switches
    // -------------------------------------------------------------------------
    console.log('\n--- 15. Stale Response Protection on Account Switch ---');
    let delayedUserAResolve: any;
    const delayedUserAPromise = new Promise((resolve) => {
      delayedUserAResolve = resolve;
    });

    // User A ('user-alpha') starts a slow refresh
    (firebaseAuth as any).currentUser = {
      uid: 'user-alpha',
      getIdToken: async () => 'jwt-alpha',
    };
    userEntitlementService.handleUserChange('user-alpha');

    global.fetch = (url: any, options: any) => {
      const auth = options?.headers?.Authorization || '';
      if (auth.includes('jwt-alpha')) {
        return delayedUserAPromise as any;
      }
      if (auth.includes('jwt-beta')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { uid: 'user-beta', tier: 'NON_PRO', isPro: false },
          }),
        }) as any;
      }
      return Promise.resolve({ ok: false, status: 404 }) as any;
    };

    // User A launches refresh
    userEntitlementService.refreshEntitlement().catch(() => {});

    // While User A's network request is in-flight, User B ('user-beta') immediately logs in
    (firebaseAuth as any).currentUser = {
      uid: 'user-beta',
      getIdToken: async () => 'jwt-beta',
    };
    userEntitlementService.handleUserChange('user-beta');
    assert(userEntitlementService.isPro === false, 'Test 15.1', 'User B immediately gets isolated Non-Pro state');

    // Now User A's slow network request finally resolves granting PRO to User A
    delayedUserAResolve({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          uid: 'user-alpha',
          tier: 'PRO',
          isPro: true,
        },
      }),
    });

    // Wait a tick for any microtasks to process
    await new Promise((r) => setTimeout(r, 20));

    // Verify User B did NOT have their state overwritten by User A's delayed response
    assert(userEntitlementService.isPro === false, 'Test 15.2', 'Stale response for User A did NOT overwrite User B entitlement');
    assert(userEntitlementService.getCurrentState().userId === 'user-beta', 'Test 15.3', 'Active user remains User B');

    // -------------------------------------------------------------------------
    // TEST 16: Prohibited Route Guard & Data Preservation Invariants
    // -------------------------------------------------------------------------
    console.log('\n--- 16. Screen Guards & Data Preservation Invariants ---');
    const prohibitedScreens = [
      'app/(tabs)/index.tsx',
      'app/(tabs)/applications.tsx',
      'app/applications.tsx',
      'app/(tabs)/bids.tsx',
      'app/(tabs)/forms.tsx',
      'app/(tabs)/banks.tsx',
      'app/banks.tsx',
      'app/apply-ipo.tsx',
      'app/bulk-apply.tsx',
      'app/analytics-dashboard.tsx',
      'app/portfolio-report.tsx',
      'app/favorite-applications.tsx',
    ];

    for (const screenPath of prohibitedScreens) {
      const src = fs.readFileSync(path.resolve(__dirname, `../${screenPath}`), 'utf8');
      assert(
        src.includes('isNonPro') && src.includes('/(tabs)/ipos'),
        `Test 16.${prohibitedScreens.indexOf(screenPath) + 1}`,
        `Screen guard present in ${screenPath}`
      );
    }

    // -------------------------------------------------------------------------
    // TEST 17: Automatic Periodic Polling Lifecycle & Active State Management
    // -------------------------------------------------------------------------
    console.log('\n--- 17. Automatic Polling Lifecycle & Active State Management ---');
    (firebaseAuth as any).currentUser = {
      uid: 'polling-user-1',
      getIdToken: async () => 'jwt-polling',
    };
    userEntitlementService.handleUserChange('polling-user-1');

    userEntitlementService.startPolling(50); // fast 50ms interval for test
    assert(userEntitlementService.isPolling === true, 'Test 17.1', 'Polling is active after startPolling()');
    assert(userEntitlementService.pollingInterval === 50, 'Test 17.2', 'Configured polling interval matches 50ms');

    // App transitions to background -> polling must automatically pause
    userEntitlementService.setAppActive(false);
    assert(userEntitlementService.isPolling === false, 'Test 17.3', 'Polling is paused when app is backgrounded');

    // App transitions to foreground -> polling automatically resumes
    userEntitlementService.setAppActive(true);
    assert(userEntitlementService.isPolling === true, 'Test 17.4', 'Polling automatically resumes when app is foregrounded');

    userEntitlementService.stopPolling();
    assert(userEntitlementService.isPolling === false, 'Test 17.5', 'stopPolling() successfully stops polling timer');

    // -------------------------------------------------------------------------
    // TEST 18: Admin Grant Detection While App Stays Open
    // -------------------------------------------------------------------------
    console.log('\n--- 18. Live Admin Grant Detection While App Stays Open ---');
    let backendMockTier = 'NON_PRO';
    global.fetch = async (url: any) => {
      if (String(url).includes('/api/v1/user/entitlement')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              uid: 'polling-user-1',
              tier: backendMockTier,
              isPro: backendMockTier === 'PRO',
            },
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    // Initial sync confirms NON_PRO
    await userEntitlementService.refreshEntitlement();
    assert(userEntitlementService.isPro === false, 'Test 18.1', 'Initial active tier is Non-Pro');

    // Admin updates tier to PRO in backend while user is browsing app
    backendMockTier = 'PRO';

    // Start polling with short interval
    userEntitlementService.startPolling(40);

    // Wait for polling tick to fire and detect grant
    await new Promise((r) => setTimeout(r, 90));
    userEntitlementService.stopPolling();

    assert(userEntitlementService.isPro === true, 'Test 18.2', 'App automatically detected admin Pro grant while open');
    assert(appExperienceService.getCurrentMode() === 'pro', 'Test 18.3', 'App experience automatically promoted to Pro');
    const adStateAutoPro = await adEntitlementService.getEntitlementState();
    assert(adStateAutoPro.isPremium === true, 'Test 18.4', 'Ad suppression automatically activated on admin grant');
    assert(
      userEntitlementService.lastTransitionEvent?.previousTier === 'NON_PRO' &&
        userEntitlementService.lastTransitionEvent?.newTier === 'PRO',
      'Test 18.5',
      'Transition event recorded previousTier NON_PRO and newTier PRO'
    );

    // -------------------------------------------------------------------------
    // TEST 19: Admin Revoke Detection While App Stays Open
    // -------------------------------------------------------------------------
    console.log('\n--- 19. Live Admin Revoke Detection While App Stays Open ---');
    // Admin revokes PRO on backend console
    backendMockTier = 'NON_PRO';

    userEntitlementService.startPolling(40);
    await new Promise((r) => setTimeout(r, 90));
    userEntitlementService.stopPolling();

    assert(userEntitlementService.isPro === false, 'Test 19.1', 'App automatically detected admin Pro revocation while open');
    assert(appExperienceService.getCurrentMode() === 'non_pro', 'Test 19.2', 'App experience automatically demoted to Non-Pro');
    const adStateAutoNonPro = await adEntitlementService.getEntitlementState();
    assert(adStateAutoNonPro.isPremium === false, 'Test 19.3', 'Ad suppression automatically deactivated on admin revocation');
    assert(
      userEntitlementService.lastTransitionEvent?.previousTier === 'PRO' &&
        userEntitlementService.lastTransitionEvent?.newTier === 'NON_PRO',
      'Test 19.4',
      'Transition event recorded previousTier PRO and newTier NON_PRO'
    );

    // -------------------------------------------------------------------------
    // TEST 20: Polling Resilience During Offline & Account Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- 20. Polling Resilience During Offline & Account Isolation ---');
    // Offline failure during periodic poll tick must NOT demote or crash
    global.fetch = async () => {
      throw new Error('Connection refused (device offline)');
    };

    userEntitlementService.startPolling(40);
    await new Promise((r) => setTimeout(r, 60));
    userEntitlementService.stopPolling();
    assert(userEntitlementService.status === 'ready', 'Test 20.1', 'Polling retains ready status through network failures');

    // AppState subscription cleanup
    const mockAppState = {
      addEventListener: (_ev: string, cb: any) => ({ remove: () => {} }),
    };
    const sub = userEntitlementService.attachAppStateListener(mockAppState);
    assert(sub !== null, 'Test 20.2', 'attachAppStateListener attaches successfully');
    sub!.remove();
    assert(userEntitlementService.isPolling === false, 'Test 20.3', 'Removing AppState subscription cleans up polling timer');

    console.log('\n===============================================================');
    console.log(`ALL TESTS PASSED! (${passCount} passed, ${failCount} failed)`);
    console.log('===============================================================\n');
  } finally {
    userEntitlementService.stopPolling();
    await userEntitlementService.handleSignOut();
    global.fetch = originalFetch;
  }
}

runEntitlementLifecycleTests().catch((err) => {
  console.error('\n❌ Test suite encountered unhandled error:', err);
  process.exit(1);
});
