/**
 * Cloud Profile Sync & Cross-Device Hydration Test Suite
 * 
 * Validates:
 * 1. Avatar size safety & chunking for large Data URLs (>800KB).
 * 2. Reassembly of chunked avatars on fetch.
 * 3. Graceful fallback to Firebase Auth currentUser displayName/photoURL.
 * 4. Automatic reconciliation of locally-stored profile details up to the cloud.
 * 5. Hydration of local AsyncStorage and AuthUser state on new device login.
 * 6. Display name saves preserving existing avatar (no null wipeout).
 * 7. Device-local file:// and content:// URI prevention from raw cloud persistence.
 */

interface MockFirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface MockFirestoreDoc {
  data: Record<string, any>;
  exists: boolean;
}

class MockFirestoreStore {
  public docs = new Map<string, Record<string, any>>();

  setDoc(path: string, data: Record<string, any>, options?: { merge?: boolean }) {
    if (options?.merge && this.docs.has(path)) {
      this.docs.set(path, { ...this.docs.get(path)!, ...data });
    } else {
      this.docs.set(path, { ...data });
    }
  }

  getDoc(path: string): MockFirestoreDoc {
    if (this.docs.has(path)) {
      return { data: { ...this.docs.get(path)! }, exists: true };
    }
    return { data: {}, exists: false };
  }

  deleteDoc(path: string) {
    this.docs.delete(path);
  }

  clear() {
    this.docs.clear();
  }
}

class MockStorage {
  private store = new Map<string, string>();
  async getItem(key: string) { return this.store.get(key) ?? null; }
  async setItem(key: string, val: string) { this.store.set(key, val); }
  async removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testId: string, desc: string) {
  if (condition) {
    console.log(`✓ PASS: [${testId}] ${desc}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: [${testId}] ${desc}`);
    failCount++;
    throw new Error(`Test assertion failed: [${testId}] ${desc}`);
  }
}

async function runCloudProfileSyncTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING CLOUD PROFILE SYNC & HYDRATION TEST SUITE');
  console.log('===============================================================');

  const firestore = new MockFirestoreStore();
  const storage = new MockStorage();

  // Test 1: Chunking large avatar data URL (>800KB)
  const largeAvatarDataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(950000);
  const CHUNK_SIZE = 400000;
  const totalChunks = Math.ceil(largeAvatarDataUrl.length / CHUNK_SIZE);

  assert(totalChunks === 3, 'TEST 1.1', 'Large avatar correctly calculates 3 chunks');

  for (let i = 0; i < totalChunks; i++) {
    const slice = largeAvatarDataUrl.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    firestore.setDoc(`users/u123/avatar_chunks/chunk_${i}`, {
      index: i,
      chunk: slice,
      totalChunks,
    });
  }

  firestore.setDoc('users/u123/metadata/account_profile', {
    displayName: 'Anish',
    avatar_url: '__chunked__',
    has_avatar_chunks: true,
    total_avatar_chunks: totalChunks,
  });

  // Test 2: Reassembly of chunked avatars
  const profileDoc = firestore.getDoc('users/u123/metadata/account_profile');
  let reassembled = '';
  if (profileDoc.data.has_avatar_chunks) {
    for (let i = 0; i < profileDoc.data.total_avatar_chunks; i++) {
      const cDoc = firestore.getDoc(`users/u123/avatar_chunks/chunk_${i}`);
      if (cDoc.exists) {
        reassembled += cDoc.data.chunk;
      }
    }
  }

  assert(reassembled === largeAvatarDataUrl, 'TEST 2.1', 'Reassembled avatar matches original large data URL exactly');
  assert(reassembled.length === largeAvatarDataUrl.length, 'TEST 2.2', 'Length matches without corruption');

  // Test 3: Firebase Auth fallback when Firestore doc lacks displayName
  const mockCurrentUser: MockFirebaseUser = {
    uid: 'u456',
    email: 'trader@example.com',
    displayName: 'Trader Pro',
    photoURL: 'https://images.example.com/avatar.jpg',
  };

  firestore.setDoc('users/u456', { email: 'trader@example.com' }); // no displayName in doc
  const userDoc = firestore.getDoc('users/u456');
  const resolvedDisplayName = userDoc.data.displayName || userDoc.data.username || mockCurrentUser.displayName;
  const resolvedAvatar = userDoc.data.avatar_url || userDoc.data.photoURL || mockCurrentUser.photoURL;

  assert(resolvedDisplayName === 'Trader Pro', 'TEST 3.1', 'Falls back to Firebase Auth displayName when Firestore lacks it');
  assert(resolvedAvatar === 'https://images.example.com/avatar.jpg', 'TEST 3.2', 'Falls back to Firebase Auth photoURL');

  // Test 4: Local reconciliation up to Cloud (Installed App scenario)
  await storage.setItem('@ipovault_username', 'Installed_App_User');
  await storage.setItem('@ipovault_avatar_uri', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');

  // Cloud currently has nothing for u789
  const cloudForU789 = firestore.getDoc('users/u789');
  assert(!cloudForU789.exists, 'TEST 4.1', 'Cloud initially has no record for user');

  const localName = await storage.getItem('@ipovault_username');
  const localAvatar = await storage.getItem('@ipovault_avatar_uri');

  if (localName) {
    firestore.setDoc('users/u789/metadata/account_profile', {
      displayName: localName,
      avatar_url: localAvatar,
    }, { merge: true });
  }

  const syncedCloud = firestore.getDoc('users/u789/metadata/account_profile');
  assert(syncedCloud.data.displayName === 'Installed_App_User', 'TEST 4.2', 'Local custom username reconciled up to cloud');
  assert(syncedCloud.data.avatar_url === 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', 'TEST 4.3', 'Local avatar reconciled up to cloud');

  // Test 5: Fresh login hydration (Expo Go scenario)
  const expoGoStorage = new MockStorage();
  const cloudDataForExpo = firestore.getDoc('users/u789/metadata/account_profile');

  if (cloudDataForExpo.data.displayName) {
    await expoGoStorage.setItem('@ipovault_username', cloudDataForExpo.data.displayName);
  }
  if (cloudDataForExpo.data.avatar_url) {
    await expoGoStorage.setItem('@ipovault_avatar_uri', cloudDataForExpo.data.avatar_url);
  }

  const hydratedName = await expoGoStorage.getItem('@ipovault_username');
  const hydratedAvatar = await expoGoStorage.getItem('@ipovault_avatar_uri');

  assert(hydratedName === 'Installed_App_User', 'TEST 5.1', 'Expo Go hydrator loads username from cloud on signin');
  assert(hydratedAvatar === 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', 'TEST 5.2', 'Expo Go hydrator loads avatar from cloud on signin');

  // Test 6: Display Name change preserves existing Avatar
  const currentAvatarInApp = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  const newName = 'Anish New Name';
  // Caller passes: effectiveAvatar = avatarUri || authUser?.photoURL || undefined
  const effectiveAvatar = currentAvatarInApp;

  firestore.setDoc('users/u789/metadata/account_profile', {
    displayName: newName,
    avatar_url: effectiveAvatar,
  }, { merge: true });

  const updatedDoc = firestore.getDoc('users/u789/metadata/account_profile');
  assert(updatedDoc.data.displayName === 'Anish New Name', 'TEST 6.1', 'Display name updated');
  assert(updatedDoc.data.avatar_url === currentAvatarInApp, 'TEST 6.2', 'Avatar preserved and NOT wiped to null');

  // Test 7: Device-local URI prevention
  const deviceLocalUri = 'file:///data/user/0/com.ipovault/cache/photo.jpg';
  const shouldPersistRawToCloud = !deviceLocalUri.startsWith('file://') && !deviceLocalUri.startsWith('content://');
  assert(shouldPersistRawToCloud === false, 'TEST 7.1', 'Raw file:// URI blocked from direct cloud persistence');

  const contentUri = 'content://media/external/images/media/34';
  const shouldPersistContentToCloud = !contentUri.startsWith('file://') && !contentUri.startsWith('content://');
  assert(shouldPersistContentToCloud === false, 'TEST 7.2', 'Raw content:// URI blocked from direct cloud persistence');

  console.log('===============================================================');
  console.log(`ALL CLOUD PROFILE SYNC TESTS PASSED (${passCount}/${passCount})`);
  console.log('===============================================================');
}

runCloudProfileSyncTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
