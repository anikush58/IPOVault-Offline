import { formatAuthError, mapFirebaseUser } from '../services/auth/firebaseAuthService';
import { resolveCanonicalBrokerUserId } from '../utils/brokerMatching';

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

async function runFirebaseAuthTestSuite() {
  console.log('==================================================');
  console.log('RUNNING FIREBASE AUTHENTICATION TEST SUITE');
  console.log('==================================================');

  // Test 1: mapFirebaseUser formats user correctly
  const mockFirebaseUser: any = {
    uid: 'firebase-user-123456',
    email: 'trader@ipovault.app',
    displayName: 'IPO Trader',
    photoURL: 'https://example.com/photo.jpg',
  };

  const mapped = mapFirebaseUser(mockFirebaseUser);
  assert(
    mapped !== null && mapped.id === 'firebase-user-123456' && mapped.uid === 'firebase-user-123456' && mapped.email === 'trader@ipovault.app',
    'Test 1',
    'mapFirebaseUser maps uid to both id and uid properties',
  );

  // Test 2: Null user mapping
  const mappedNull = mapFirebaseUser(null);
  assert(mappedNull === null, 'Test 2', 'mapFirebaseUser returns null for null user');

  // Test 3: formatAuthError user-friendly error messages
  assert(
    formatAuthError({ code: 'auth/email-already-in-use' }).includes('already exists'),
    'Test 3a',
    'Friendly error for existing email',
  );

  assert(
    formatAuthError({ code: 'auth/invalid-email' }).includes('valid email'),
    'Test 3b',
    'Friendly error for invalid email',
  );

  assert(
    formatAuthError({ code: 'auth/weak-password' }).includes('at least 6 characters'),
    'Test 3c',
    'Friendly error for weak password',
  );

  assert(
    formatAuthError({ code: 'auth/invalid-credential' }).includes('Invalid email or password'),
    'Test 3d',
    'Friendly error for invalid credentials',
  );

  assert(
    formatAuthError({ code: 'auth/network-request-failed' }).includes('Network error'),
    'Test 3e',
    'Friendly error for network failure',
  );

  // Test 4: resolveCanonicalBrokerUserId integration
  const resolvedUid = resolveCanonicalBrokerUserId(mapped, null);
  assert(
    resolvedUid === 'firebase-user-123456',
    'Test 4',
    'resolveCanonicalBrokerUserId returns Firebase UID for authenticated user',
  );

  // Test 5: Fallback when user is unauthenticated
  const unauthUid = resolveCanonicalBrokerUserId(null, null);
  assert(
    unauthUid === null,
    'Test 5',
    'resolveCanonicalBrokerUserId returns null for unauthenticated session (never dummy default-user)',
  );

  console.log('==================================================');
  console.log(`ALL FIREBASE AUTH TESTS PASSED (${passCount}/${passCount})`);
  console.log('==================================================');
}

runFirebaseAuthTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
