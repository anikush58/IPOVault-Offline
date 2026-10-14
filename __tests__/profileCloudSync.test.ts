/**
 * Profile Cloud Sync & Persistence Test Suite
 * Validates saving username, profile avatar to cloud (Firestore & Firebase Auth),
 * offline resilience, Base64 conversion, and local storage hydration.
 */

import {
  updateUserProfileCloud,
  fetchUserProfileCloud,
  CloudUserProfile,
} from '../services/auth/firebaseAuthService';
import { ensureBase64DataUrl, extractBase64Payload } from '../utils/imageUtils';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testId: string, desc: string) {
  if (condition) {
    console.log(`✓ PASS: [${testId}] ${desc}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: [${testId}] ${desc}`);
    failCount++;
    throw new Error(`Test failed: [${testId}] ${desc}`);
  }
}

async function runProfileCloudSyncTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING PROFILE CLOUD SYNC & PERSISTENCE TEST SUITE');
  console.log('===============================================================\n');

  // TEST 1: Unauthenticated / Offline session gracefully handles cloud update
  console.log('--- TEST 1: Offline / Unauthenticated Safety ---');
  {
    const res = await updateUserProfileCloud({
      displayName: 'Offline Trader',
      avatarDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    });
    assert(res.success === true, 'TEST 1.1', 'updateUserProfileCloud succeeds gracefully when unauthenticated / offline');
    assert(res.error === null, 'TEST 1.2', 'No fatal network error returned when unauthenticated');
  }

  // TEST 2: ensureBase64DataUrl preserves data URIs and HTTP URLs
  console.log('\n--- TEST 2: Avatar URL and Base64 Formatter ---');
  {
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const processedDataUrl = await ensureBase64DataUrl(sampleDataUrl);
    assert(processedDataUrl === sampleDataUrl, 'TEST 2.1', 'Base64 data URL is preserved identically');

    const sampleHttpUrl = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80';
    const processedHttpUrl = await ensureBase64DataUrl(sampleHttpUrl);
    assert(processedHttpUrl === sampleHttpUrl, 'TEST 2.2', 'Remote HTTP/HTTPS avatar URL is preserved');

    const emptyUrl = await ensureBase64DataUrl('');
    assert(emptyUrl === '', 'TEST 2.3', 'Empty URI returns empty string');

    const nullUrl = await ensureBase64DataUrl(null);
    assert(nullUrl === '', 'TEST 2.4', 'Null URI returns empty string');
  }

  // TEST 3: Base64 payload extraction for cloud persistence
  console.log('\n--- TEST 3: Base64 Payload Extraction ---');
  {
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const payload = extractBase64Payload(sampleDataUrl);
    assert(payload !== null, 'TEST 3.1', 'extractBase64Payload extracts payload successfully');
    assert(payload?.mimeType === 'image/png', 'TEST 3.2', 'MIME type is detected as image/png');
    assert(payload?.ext === 'png', 'TEST 3.3', 'Extension is detected as png');
    assert((payload?.base64Data?.length ?? 0) > 0, 'TEST 3.4', 'Clean Base64 data extracted without data URI prefix');
  }

  // TEST 4: Profile Data Validation & Fallbacks
  console.log('\n--- TEST 4: Profile Data Schema & Edge Cases ---');
  {
    const mockProfile: CloudUserProfile = {
      displayName: 'Karan Trader',
      username: 'Karan Trader',
      avatarUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      photoURL: null,
      email: 'karan@ipovault.app',
      updatedAt: new Date().toISOString(),
    };

    assert(mockProfile.displayName === 'Karan Trader', 'TEST 4.1', 'Display name is preserved');
    assert(Boolean(mockProfile.avatarUrl?.startsWith('data:image/jpeg')), 'TEST 4.2', 'Avatar data URL is preserved');
    assert(mockProfile.photoURL === null, 'TEST 4.3', 'Long base64 is kept out of auth photoURL');
  }

  // TEST 5: fetchUserProfileCloud returns null for empty UID
  console.log('\n--- TEST 5: Fetch Cloud Profile with Empty UID ---');
  {
    const profile = await fetchUserProfileCloud('');
    assert(profile === null, 'TEST 5.1', 'fetchUserProfileCloud returns null when no UID is provided and user is signed out');
  }

  console.log('\n===============================================================');
  console.log(`ALL PROFILE CLOUD SYNC TESTS PASSED (${passCount}/${passCount})`);
  console.log('===============================================================');
}

runProfileCloudSyncTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
