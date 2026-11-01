/* eslint-disable @typescript-eslint/no-explicit-any */
import { safeAsyncStorage } from '../utils/safeAsyncStorage';
import {
  userEntitlementService,
  USER_ENTITLEMENT_STORAGE_KEY,
  KNOWN_PRO_IDENTIFIERS_STORAGE_KEY,
  getUserEntitlementStorageKey,
  getEntitlementStorageKeyForEmail,
} from '../services/user/userEntitlementService';
import { appExperienceService } from '../services/experience/appExperienceService';
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

async function runProEmailDetectionTests() {
  console.log('===============================================================');
  console.log('RUNNING INSTANT PRO EMAIL/USERNAME AUTO-DETECTION TEST SUITE');
  console.log('===============================================================');

  const memoryStore = new Map<string, string>();
  safeAsyncStorage.getItem = async (k: string) => memoryStore.get(k) ?? null;
  safeAsyncStorage.setItem = async (k: string, v: string) => {
    memoryStore.set(k, v);
  };
  safeAsyncStorage.removeItem = async (k: string) => {
    memoryStore.delete(k);
  };

  const originalFetch = global.fetch;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Initial State & Unknown Email
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Unknown Email Verification ---');
    await userEntitlementService.handleSignOut();
    assert(!userEntitlementService.isPro, 'Test 1.1', 'Starts as Non-Pro');
    assert(
      !userEntitlementService.isKnownProIdentifier('investor@unknown.com'),
      'Test 1.2',
      'Unknown email is not recognized as Pro'
    );

    // -------------------------------------------------------------------------
    // TEST 2: Recording Pro Account into Persistent Registry
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Recording Pro Account into Persistent Registry ---');
    await userEntitlementService.recordProUser({
      uid: 'user-pro-99',
      email: 'PRO_INVESTOR@IPOVAULT.COM',
      username: 'ProTrader99',
    });

    assert(
      userEntitlementService.isKnownProIdentifier('pro_investor@ipovault.com'),
      'Test 2.1',
      'Recognizes email in lowercase'
    );
    assert(
      userEntitlementService.isKnownProIdentifier('PRO_INVESTOR@IPOVAULT.COM'),
      'Test 2.2',
      'Case-insensitive check succeeds for uppercase input'
    );
    assert(
      userEntitlementService.isKnownProIdentifier('  pro_investor@ipovault.com  '),
      'Test 2.3',
      'Whitespace-padded email check succeeds'
    );
    assert(
      userEntitlementService.isKnownProIdentifier('ProTrader99'),
      'Test 2.4',
      'Recognizes username as Pro'
    );
    assert(
      userEntitlementService.isKnownProIdentifier('user-pro-99'),
      'Test 2.5',
      'Recognizes UID as Pro'
    );

    const storedRegistryRaw = await safeAsyncStorage.getItem(KNOWN_PRO_IDENTIFIERS_STORAGE_KEY);
    assert(storedRegistryRaw !== null, 'Test 2.6', 'Pro registry stored in safeAsyncStorage');
    const storedRegistry = JSON.parse(storedRegistryRaw!);
    assert(
      storedRegistry.includes('pro_investor@ipovault.com'),
      'Test 2.7',
      'Normalized email persisted to safeAsyncStorage'
    );

    // -------------------------------------------------------------------------
    // TEST 3: Instant Entitlement Resolution for Known Pro Email (0ms)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Instant Entitlement Resolution on Login ---');
    // Ensure state is unauthenticated prior to login
    await userEntitlementService.handleSignOut();
    assert(appExperienceService.getCurrentMode() === 'non_pro', 'Test 3.1', 'Logged out mode is non_pro');

    // Simulate login resolution for pro_investor@ipovault.com
    const resolvedEnt = await userEntitlementService.resolveEntitlementForLogin({
      uid: 'user-pro-99',
      email: 'pro_investor@ipovault.com',
      username: 'ProTrader99',
    });

    assert(resolvedEnt.tier === 'PRO', 'Test 3.2', 'Resolved tier is PRO');
    assert(resolvedEnt.isPro === true, 'Test 3.3', 'Resolved isPro is true');
    assert(userEntitlementService.isPro === true, 'Test 3.4', 'userEntitlementService.isPro is immediately true');
    assert(appExperienceService.getCurrentMode() === 'pro', 'Test 3.5', 'appExperienceService automatically set to pro');

    // -------------------------------------------------------------------------
    // TEST 4: handleUserChange Immediately Initializes to Pro for Known Email
    // -------------------------------------------------------------------------
    console.log('\n--- 4. handleUserChange Instant Pro Initialization ---');
    await userEntitlementService.handleSignOut();
    assert(userEntitlementService.isPro === false, 'Test 4.1', 'Sign out resets active session');

    // Call handleUserChange with known Pro email
    userEntitlementService.handleUserChange('user-pro-99', 'pro_investor@ipovault.com', 'ProTrader99');
    assert(userEntitlementService.isPro === true, 'Test 4.2', 'handleUserChange immediately initializes isPro=true without Non-Pro flash');
    assert(userEntitlementService.tier === 'PRO', 'Test 4.3', 'handleUserChange immediately sets tier=PRO');
    assert(appExperienceService.getCurrentMode() === 'pro', 'Test 4.4', 'Experience mode is immediately pro');

    // -------------------------------------------------------------------------
    // TEST 5: Persistent Pro Registry Survives Sign-Out
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Registry Survives Sign-Out ---');
    await userEntitlementService.handleSignOut();
    assert(userEntitlementService.isPro === false, 'Test 5.1', 'Active user state demoted to Non-Pro on sign-out');

    // Check that known Pro registry still contains the email
    assert(
      userEntitlementService.isKnownProIdentifier('pro_investor@ipovault.com'),
      'Test 5.2',
      'Email remains in known Pro registry after sign-out'
    );

    // Re-login with the same email instantly resolves to Pro
    const reloginEnt = await userEntitlementService.resolveEntitlementForLogin({
      email: 'pro_investor@ipovault.com',
    });
    assert(reloginEnt.isPro === true, 'Test 5.3', 'Re-login with known email resolves to Pro instantly');

    // -------------------------------------------------------------------------
    // TEST 6: Non-Pro Email Resolves to Non-Pro Smoothly
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Non-Pro User Resolution ---');
    await userEntitlementService.handleSignOut();

    (firebaseAuth as any).currentUser = {
      uid: 'user-free-10',
      email: 'free_user@example.com',
      getIdToken: async () => 'mock-token',
      stsTokenManager: { accessToken: 'mock-token' },
    };

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          uid: 'user-free-10',
          tier: 'NON_PRO',
          isPro: false,
        },
      }),
    } as any);

    const nonProEnt = await userEntitlementService.resolveEntitlementForLogin({
      uid: 'user-free-10',
      email: 'free_user@example.com',
    });
    assert(nonProEnt.tier === 'NON_PRO', 'Test 6.1', 'Non-pro email resolves to NON_PRO');
    assert(nonProEnt.isPro === false, 'Test 6.2', 'Non-pro email isPro is false');
    assert(appExperienceService.getCurrentMode() === 'non_pro', 'Test 6.3', 'Experience mode remains non_pro');

    // -------------------------------------------------------------------------
    // TEST 7: Revocation Cleans Up Registry Safely
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Safe Revocation Cleans Up Pro Registry ---');
    await userEntitlementService.removeProUser({
      uid: 'user-pro-99',
      email: 'pro_investor@ipovault.com',
      username: 'ProTrader99',
    });
    assert(
      !userEntitlementService.isKnownProIdentifier('pro_investor@ipovault.com'),
      'Test 7.1',
      'Revoked email is removed from Pro registry'
    );
    assert(
      !userEntitlementService.isKnownProIdentifier('ProTrader99'),
      'Test 7.2',
      'Revoked username is removed from Pro registry'
    );

    console.log('\n===============================================================');
    console.log(`ALL PRO EMAIL AUTO-DETECTION TESTS PASSED (${passCount} passed, ${failCount} failed)`);
    console.log('===============================================================');
  } finally {
    global.fetch = originalFetch;
    (firebaseAuth as any).currentUser = null;
  }
}

runProEmailDetectionTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
