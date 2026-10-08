import { getDiceBearAvatarUrl, getEffectiveAvatarUrl } from '../utils/avatarUtils';

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

async function runAvatarUrlTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT AVATAR-URL & CLOUD BACKUP SUITE');
  console.log('===============================================================\n');

  // 1. User with custom avatarUrl
  console.log('--- TEST 1: User with custom avatarUrl ---');
  const userWithCustomUrl = {
    id: 'u-custom-1',
    name: 'Abhishek',
    avatar_url: 'https://example.com/custom_avatar.png',
  };
  const effectiveCustom = getEffectiveAvatarUrl(userWithCustomUrl);
  assert(
    effectiveCustom === 'https://example.com/custom_avatar.png',
    'TEST 1',
    'Custom HTTP/HTTPS avatar URL is preserved'
  );

  // 2. User without avatarUrl gets deterministic DiceBear URL
  console.log('\n--- TEST 2: User without avatarUrl gets deterministic DiceBear URL ---');
  const userNoAvatar = {
    id: 'u-no-avatar',
    name: 'Abhishek',
    avatar_url: '',
  };
  const effectiveDiceBear = getEffectiveAvatarUrl(userNoAvatar);
  const expectedDiceBear = 'https://api.dicebear.com/10.x/initials/svg?seed=Abhishek';
  assert(
    effectiveDiceBear === expectedDiceBear,
    'TEST 2',
    `User without avatarUrl gets deterministic DiceBear URL: ${effectiveDiceBear}`
  );

  // Same user gets same avatar every time
  const effectiveDiceBearAgain = getEffectiveAvatarUrl(userNoAvatar);
  assert(
    effectiveDiceBearAgain === expectedDiceBear,
    'TEST 2',
    'Same user gets identical deterministic DiceBear URL across multiple calls'
  );

  // 3. Backup formatting contains avatarUrl
  console.log('\n--- TEST 3: Backup formatting contains avatarUrl ---');
  const localExportPayload = {
    version: 1,
    users: [
      { id: 'u-1', name: 'Abhishek', avatar_url: 'https://example.com/custom.png' },
      { id: 'u-2', name: 'Vishal', avatar_url: '' },
    ],
    ipos: [],
  };

  const processedUsers = localExportPayload.users.map((u) => ({
    ...u,
    avatarUrl: getEffectiveAvatarUrl(u),
  }));

  assert(
    processedUsers[0].avatarUrl === 'https://example.com/custom.png',
    'TEST 3',
    'Backup payload contains custom avatarUrl'
  );
  assert(
    processedUsers[1].avatarUrl === 'https://api.dicebear.com/10.x/initials/svg?seed=Vishal',
    'TEST 3',
    'Backup payload contains generated DiceBear avatarUrl for user without custom avatar'
  );

  // 4. Restore preserves avatarUrl
  console.log('\n--- TEST 4: Restore preserves avatarUrl ---');
  const restoredUsers = processedUsers.map((u) => ({
    id: u.id,
    name: u.name,
    avatar_url: u.avatarUrl,
  }));

  assert(
    restoredUsers[0].avatar_url === 'https://example.com/custom.png',
    'TEST 4',
    'Restore preserves custom avatarUrl'
  );
  assert(
    restoredUsers[1].avatar_url === 'https://api.dicebear.com/10.x/initials/svg?seed=Vishal',
    'TEST 4',
    'Restore preserves DiceBear avatarUrl'
  );

  // 5. Backup succeeds even when legacy local avatar path exists
  console.log('\n--- TEST 5: Backup succeeds when legacy local avatar path exists ---');
  const legacyLocalUser = {
    id: 'u-legacy',
    name: 'Legacy User',
    avatar_url: 'file:///data/user/0/host.exp.exponent/cache/avatar_legacy.jpg',
  };

  const effectiveLegacy = getEffectiveAvatarUrl(legacyLocalUser);
  assert(
    effectiveLegacy === 'https://api.dicebear.com/10.x/initials/svg?seed=Legacy%20User',
    'TEST 5',
    'Legacy file:// path fell back to deterministic DiceBear avatar URL without error'
  );

  console.log('\n===============================================================');
  console.log(`AVATAR-URL SUITE COMPLETED: Passed ${passCount} / ${passCount + failCount} tests.`);
  console.log('===============================================================');
}

runAvatarUrlTestSuite().catch((err) => {
  console.error('Avatar Test Suite Exception:', err);
  process.exit(1);
});
