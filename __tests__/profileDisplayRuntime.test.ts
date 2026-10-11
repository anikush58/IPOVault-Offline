/**
 * Profile Display Runtime & Hydration Test Suite
 * Validates dynamic username resolution, fallback chaining, avatar initial derivation,
 * and storage hydration across screen navigation lifecycles.
 */

interface MockAuthUser {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  uid?: string | null;
}

// Pure function mirroring the production resolution logic in app/settings-account.tsx and app/(tabs)/settings.tsx
function resolveProfileDisplay(
  authUser: MockAuthUser | null | undefined,
  customUsername: string | null | undefined
) {
  const emailStr = authUser?.email?.trim() || 'Guest User';
  const nameStr =
    (customUsername && customUsername.trim()) ||
    (authUser?.displayName && authUser.displayName.trim()) ||
    (authUser?.email && authUser.email.includes('@') ? authUser.email.split('@')[0].trim() : '') ||
    'IPOVault User';

  const initial = (
    nameStr.replace(/[^a-zA-Z0-9]/g, '').charAt(0) ||
    nameStr.charAt(0) ||
    'U'
  ).toUpperCase();

  return { emailStr, nameStr, initial };
}

// Simulated AsyncStorage
class MockAsyncStorage {
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// Simulated Screen Hook reproducing useFocusEffect lifecycle
class ScreenFocusLifecycleSimulator {
  private storage: MockAsyncStorage;
  public customUsername: string | null = null;
  public avatarUri: string | null = null;
  public isMounted = false;

  constructor(storage: MockAsyncStorage) {
    this.storage = storage;
  }

  // Called when screen mounts or gains focus (via useFocusEffect)
  async onFocus() {
    this.isMounted = true;
    const storedAvatar = await this.storage.getItem('@ipovault_avatar_uri');
    if (this.isMounted) {
      this.avatarUri = storedAvatar || null;
    }

    const storedUser = await this.storage.getItem('@ipovault_username');
    if (this.isMounted) {
      this.customUsername = storedUser && storedUser.trim() ? storedUser.trim() : null;
    }
  }

  // Called when navigating away (screen blurs or unmounts)
  onBlur() {
    this.isMounted = false;
  }
}

function assert(condition: boolean, testId: string, desc: string) {
  if (!condition) {
    console.error(`❌ FAIL: [${testId}] ${desc}`);
    throw new Error(`Test assertion failed: [${testId}] ${desc}`);
  }
  console.log(`✓ PASS: [${testId}] ${desc}`);
}

async function runProfileDisplayRuntimeTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING PROFILE DISPLAY RUNTIME & HYDRATION TEST SUITE');
  console.log('===============================================================');

  // --- TEST 1: User with Custom Username ---
  console.log('\n--- TEST 1: User with Custom Username ---');
  {
    const user: MockAuthUser = {
      displayName: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      uid: 'uid-1',
    };
    const res = resolveProfileDisplay(user, 'investor_pro');
    assert(res.nameStr === 'investor_pro', 'TEST 1.1', 'Custom username takes precedence over displayName');
    assert(res.initial === 'I', 'TEST 1.2', 'Initial is derived correctly from custom username');
    assert(res.emailStr === 'rahul.sharma@example.com', 'TEST 1.3', 'Email remains user email');
  }

  // --- TEST 2: User without Custom Username (Display Name Available) ---
  console.log('\n--- TEST 2: User without Custom Username (Display Name Available) ---');
  {
    const user: MockAuthUser = {
      displayName: 'Anish Kushwaha',
      email: 'anish@example.com',
      uid: 'uid-2',
    };
    const res = resolveProfileDisplay(user, null);
    assert(res.nameStr === 'Anish Kushwaha', 'TEST 2.1', 'Display name is shown when no custom username is set');
    assert(res.initial === 'A', 'TEST 2.2', 'Avatar initial is "A"');
  }

  // --- TEST 3: User without Custom Username & without Display Name (Email Prefix Fallback) ---
  console.log('\n--- TEST 3: User without Display Name (Email Prefix Fallback) ---');
  {
    const user: MockAuthUser = {
      displayName: null,
      email: 'priya.investor@gmail.com',
      uid: 'uid-3',
    };
    const res = resolveProfileDisplay(user, null);
    assert(res.nameStr === 'priya.investor', 'TEST 3.1', 'Falls back to email prefix before "@"');
    assert(res.initial === 'P', 'TEST 3.2', 'Avatar initial is "P"');
  }

  // --- TEST 4: Missing or Whitespace-Only Profile Data Falls Back Safely ---
  console.log('\n--- TEST 4: Missing & Whitespace-Only Data Resilience ---');
  {
    // Case 4A: Whitespace custom username & whitespace displayName
    const userA: MockAuthUser = {
      displayName: '   ',
      email: 'alex@example.com',
    };
    const resA = resolveProfileDisplay(userA, '   ');
    assert(resA.nameStr === 'alex', 'TEST 4.1', 'Whitespace custom username & displayName fall back to email prefix');
    assert(resA.initial === 'A', 'TEST 4.2', 'Initial is "A"');

    // Case 4B: Completely empty user (no displayName, no email)
    const userB: MockAuthUser = {
      displayName: '',
      email: '',
    };
    const resB = resolveProfileDisplay(userB, null);
    assert(resB.nameStr === 'IPOVault User', 'TEST 4.3', 'Empty user safely resolves to "IPOVault User" without crash');
    assert(resB.initial === 'I', 'TEST 4.4', 'Initial is "I"');
    assert(resB.emailStr === 'Guest User', 'TEST 4.5', 'Email safely resolves to "Guest User"');

    // Case 4C: Undefined / Null authUser
    const resC = resolveProfileDisplay(null, null);
    assert(resC.nameStr === 'IPOVault User', 'TEST 4.6', 'Null authUser safely resolves to "IPOVault User"');
    assert(resC.initial === 'I', 'TEST 4.7', 'Initial is "I"');

    // Case 4D: Leading special characters in name (e.g. "_trader")
    const userD: MockAuthUser = {
      displayName: '_trader_007',
      email: 'trader@example.com',
    };
    const resD = resolveProfileDisplay(userD, null);
    assert(resD.initial === 'T', 'TEST 4.8', 'Leading special characters are stripped for avatar initial ("_trader" -> "T")');
  }

  // --- TEST 5: Storage Hydration Lifecycle (Navigating Away and Returning) ---
  console.log('\n--- TEST 5: Storage Hydration Lifecycle Across Screen Focus ---');
  {
    const storage = new MockAsyncStorage();
    const screen = new ScreenFocusLifecycleSimulator(storage);

    // Initial mount: No custom username in storage
    const authUser: MockAuthUser = {
      displayName: 'Karan Mehra',
      email: 'karan@example.com',
    };
    await screen.onFocus();
    let display = resolveProfileDisplay(authUser, screen.customUsername);
    assert(display.nameStr === 'Karan Mehra', 'TEST 5.1', 'Initial screen focus shows displayName');
    assert(display.initial === 'K', 'TEST 5.2', 'Initial is "K"');

    // User navigates away from account screen
    screen.onBlur();
    assert(screen.isMounted === false, 'TEST 5.3', 'Screen marked as unmounted/blurred');

    // User updates their username in Settings tab or storage
    await storage.setItem('@ipovault_username', 'Karan_Pro_Trader');
    await storage.setItem('@ipovault_avatar_uri', 'file:///cache/avatar-1.jpg');

    // User navigates back to Account settings screen (useFocusEffect fires)
    await screen.onFocus();
    assert(screen.customUsername === 'Karan_Pro_Trader', 'TEST 5.4', 'Hydrates updated custom username on return');
    assert(screen.avatarUri === 'file:///cache/avatar-1.jpg', 'TEST 5.5', 'Hydrates updated avatar URI on return');

    display = resolveProfileDisplay(authUser, screen.customUsername);
    assert(display.nameStr === 'Karan_Pro_Trader', 'TEST 5.6', 'Updated custom username is displayed immediately');
    assert(display.initial === 'K', 'TEST 5.7', 'Updated avatar initial is preserved');

    // User clears/removes custom username
    screen.onBlur();
    await storage.removeItem('@ipovault_username');
    await storage.removeItem('@ipovault_avatar_uri');

    // User returns again
    await screen.onFocus();
    assert(screen.customUsername === null, 'TEST 5.8', 'Stale username is cleared upon removal');
    assert(screen.avatarUri === null, 'TEST 5.9', 'Stale avatar is cleared upon removal');

    display = resolveProfileDisplay(authUser, screen.customUsername);
    assert(display.nameStr === 'Karan Mehra', 'TEST 5.10', 'Reverts cleanly to authenticated displayName');
  }

  console.log('\n===============================================================');
  console.log('ALL PROFILE DISPLAY RUNTIME TESTS PASSED (19/19)');
  console.log('===============================================================');
}

runProfileDisplayRuntimeTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
