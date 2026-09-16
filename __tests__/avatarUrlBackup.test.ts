import { getDiceBearAvatarUrl, getEffectiveAvatarUrl } from '../utils/avatarUtils';
import { createCloudBackup, restoreCloudBackup } from '../services/cloud/cloudBackupService';
import { supabase } from '../sync/supabase';

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

  const MOCK_AUTH_UID = 'test-auth-user-999';

  // Mock Supabase Auth
  (supabase.auth as any).getSession = async () => ({
    data: { session: { user: { id: MOCK_AUTH_UID, email: 'test@ipovault.com' } } },
    error: null,
  });

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

  // 3. Backup contains avatarUrl & does NOT attempt Storage upload
  console.log('\n--- TEST 3: Backup contains avatarUrl & does NOT attempt Storage upload ---');
  let storageUploadCalled = false;
  supabase.storage.from = (bucket: string) => {
    return {
      upload: async () => {
        storageUploadCalled = true;
        return { data: { path: 'dummy' }, error: null };
      },
    } as any;
  };

  let insertedPayload: any = null;
  (supabase as any).from = (tableName: string) => {
    if (tableName === 'user_backups') {
      return {
        insert: (data: any) => {
          insertedPayload = data.payload;
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'snapshot-avatar-001', created_at: new Date().toISOString() },
                error: null,
              }),
            }),
          };
        },
      };
    }
    return {} as any;
  };

  const localExportPayload = {
    version: 1,
    users: [
      { id: 'u-1', name: 'Abhishek', avatar_url: 'https://example.com/custom.png' },
      { id: 'u-2', name: 'Vishal', avatar_url: '' },
    ],
    ipos: [],
  };

  const backupRes = await createCloudBackup(async () => JSON.stringify(localExportPayload));
  assert(backupRes.success, 'TEST 3', 'Cloud backup completed successfully');
  assert(!storageUploadCalled, 'TEST 3', 'Supabase Storage upload was NOT attempted for avatars');
  assert(
    insertedPayload.users[0].avatarUrl === 'https://example.com/custom.png',
    'TEST 3',
    'Backup payload contains custom avatarUrl'
  );
  assert(
    insertedPayload.users[1].avatarUrl === 'https://api.dicebear.com/10.x/initials/svg?seed=Vishal',
    'TEST 3',
    'Backup payload contains generated DiceBear avatarUrl for user without custom avatar'
  );

  // 4. Restore preserves avatarUrl
  console.log('\n--- TEST 4: Restore preserves avatarUrl ---');
  (supabase as any).from = (tableName: string) => {
    if (tableName === 'user_backups') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: async () => ({
                  data: {
                    id: 'snapshot-avatar-001',
                    owner_id: MOCK_AUTH_UID,
                    backup_version: 1,
                    schema_version: 1,
                    payload: insertedPayload,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }
    return {} as any;
  };

  let restoredPayload: any = null;
  const restoreRes = await restoreCloudBackup(async (jsonStr) => {
    restoredPayload = JSON.parse(jsonStr);
    return { users: restoredPayload.users.length };
  });

  assert(restoreRes.success, 'TEST 4', 'Restore completed successfully');
  assert(
    restoredPayload.users[0].avatarUrl === 'https://example.com/custom.png',
    'TEST 4',
    'Restore preserves custom avatarUrl'
  );
  assert(
    restoredPayload.users[1].avatarUrl === 'https://api.dicebear.com/10.x/initials/svg?seed=Vishal',
    'TEST 4',
    'Restore preserves DiceBear avatarUrl'
  );

  // 5. Backup succeeds even when legacy local avatar path exists
  console.log('\n--- TEST 5: Backup succeeds when legacy local avatar path exists ---');
  const legacyLocalPathPayload = {
    version: 1,
    users: [
      {
        id: 'u-legacy',
        name: 'Legacy User',
        avatar_url: 'file:///data/user/0/host.exp.exponent/cache/avatar_legacy.jpg',
      },
    ],
    ipos: [],
  };

  let legacyInsertedPayload: any = null;
  (supabase as any).from = (tableName: string) => {
    if (tableName === 'user_backups') {
      return {
        insert: (data: any) => {
          legacyInsertedPayload = data.payload;
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'snap-legacy-123', created_at: new Date().toISOString() },
                error: null,
              }),
            }),
          };
        },
      };
    }
    return {} as any;
  };

  const legacyBackupRes = await createCloudBackup(async () => JSON.stringify(legacyLocalPathPayload));
  assert(legacyBackupRes.success, 'TEST 5', 'Cloud backup succeeded despite legacy file:// avatar_url');
  assert(
    legacyInsertedPayload.users[0].avatarUrl ===
      'https://api.dicebear.com/10.x/initials/svg?seed=Legacy%20User',
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
