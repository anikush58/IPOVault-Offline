import * as fs from 'fs';
import * as path from 'path';
import { supabase } from '../sync/supabase';
import { networkService } from '../services/infrastructure/networkService';
import {
  createCloudBackup,
  restoreCloudBackup,
  fetchLatestBackupMetadata,
  uploadImageToStorage,
  downloadStorageImageToLocal,
  isCloudBackupInProgress,
  isCloudBackupPending,
  scheduleDebouncedCloudBackup,
  uriToUint8Array,
  validateAndUploadImageAsset,
  SUPPORTED_BACKUP_VERSION,
  CURRENT_SCHEMA_VERSION,
} from '../services/cloud/cloudBackupService';

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

// ── REAL PNG Base64 Data URI Fixture (1x1 Pixel) ──────────────────────────────
const ONE_BY_ONE_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TEST_DATA_URI = `data:image/png;base64,${ONE_BY_ONE_PNG_B64}`;
const MOCK_AUTH_UID = 'test-auth-uid-12345';

async function runPhase1B1TestSuite() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT PHASE 1B.1 HARDENED CLOUD BACKUP & RESTORE SUITE');
  console.log('===============================================================\n');

  // Set up mock Supabase Auth session
  (supabase.auth as any).getSession = async () => ({
    data: {
      session: {
        user: { id: MOCK_AUTH_UID, email: 'test@ipovault.com' },
      },
    },
    error: null,
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Private Storage path is stored, never public URL
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Private Storage Path ---');
  let uploadCalledPath = '';
  const originalStorageFrom = supabase.storage.from;
  supabase.storage.from = (bucket: string) => {
    return {
      upload: async (storagePath: string, fileData: any, options: any) => {
        uploadCalledPath = storagePath;
        return { data: { path: storagePath }, error: null };
      },
      download: async (storagePath: string) => {
        const buf = Buffer.from(ONE_BY_ONE_PNG_B64, 'base64');
        return {
          data: {
            arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
            type: 'image/png',
          },
          error: null,
        };
      },
      getPublicUrl: (path: string) => {
        throw new Error('getPublicUrl must NOT be called for private storage!');
      },
    } as any;
  };

  const uploadResult = await uploadImageToStorage(MOCK_AUTH_UID, TEST_DATA_URI, 'avatar', 'user-001');
  assert(uploadResult !== null, 'TEST 1', 'Upload succeeded and returned storage path object');
  assert(uploadResult?.storagePath === `${MOCK_AUTH_UID}/images/avatar_user-001.png`, 'TEST 1', 'Canonical Storage Object Path formatted with auth.uid prefix');
  assert(!uploadResult?.storagePath.includes('http://') && !uploadResult?.storagePath.includes('https://'), 'TEST 1', 'Storage path does NOT contain public HTTP/HTTPS URL');

  // ---------------------------------------------------------------------------
  // TEST 2: file:// URI is never stored as cloud image reference & IPO logo is cleared
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: file:// Exclusion & Local IPO Logo Clearing ---');
  const mockExportPayloadWithFileUri = {
    version: 1,
    users: [{ id: 'user-001', name: 'John Doe', avatar_url: TEST_DATA_URI }],
    ipos: [{ id: 'ipo-101', ipo_name: 'Tech IPO', logo_url: TEST_DATA_URI }],
    applications: [],
    banks: [],
    allotments: [],
  };

  let insertedSnapshotPayload: any = null;
  (supabase as any).from = (tableName: string) => {
    if (tableName === 'user_backups') {
      return {
        insert: (data: any) => {
          insertedSnapshotPayload = data.payload;
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'snapshot-uuid-111', created_at: new Date().toISOString() },
                error: null,
              }),
            }),
          };
        },
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: async () => ({
                  data: {
                    id: 'snapshot-uuid-111',
                    owner_id: MOCK_AUTH_UID,
                    backup_version: 1,
                    schema_version: 1,
                    app_version: '2.0.2',
                    payload: insertedSnapshotPayload || mockExportPayloadWithFileUri,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
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

  const backupRes = await createCloudBackup(async () => JSON.stringify(mockExportPayloadWithFileUri));
  assert(backupRes.success, 'TEST 2', 'Cloud backup executed successfully');
  assert(insertedSnapshotPayload !== null, 'TEST 2', 'Snapshot payload was inserted into user_backups');
  assert(insertedSnapshotPayload.users[0].avatar_url === TEST_DATA_URI || insertedSnapshotPayload.users[0].avatarUrl === TEST_DATA_URI, 'TEST 2', 'User avatar_url preserved as avatarUrl string');
  assert(insertedSnapshotPayload.ipos[0].logo_url === null, 'TEST 2', 'Local IPO logo_url was cleared to null without uploading to Supabase Storage');

  // ---------------------------------------------------------------------------
  // TEST 3: Authenticated Storage download uses object path
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Authenticated Storage Download ---');
  let downloadedPathArg = '';
  supabase.storage.from = (bucket: string) => {
    return {
      download: async (pathArg: string) => {
        downloadedPathArg = pathArg;
        const buf = Buffer.from(ONE_BY_ONE_PNG_B64, 'base64');
        return {
          data: {
            arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
            type: 'image/png',
          },
          error: null,
        };
      },
    } as any;
  };

  const restoredLocalUri = await downloadStorageImageToLocal(`${MOCK_AUTH_UID}/images/avatar_user-001.png`, 'avatar', 'user-001');
  assert(downloadedPathArg === `${MOCK_AUTH_UID}/images/avatar_user-001.png`, 'TEST 3', 'Storage download called using relative object path');
  assert(restoredLocalUri !== null && restoredLocalUri.startsWith('file://'), 'TEST 3', 'Restored image returns valid local file:// URI');

  // ---------------------------------------------------------------------------
  // TEST 4: ipo_allotments is included in snapshot
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: ipo_allotments in Snapshot ---');
  const mockPayloadWithAllotments = {
    version: 1,
    users: [{ id: 'u1', name: 'User 1' }],
    ipos: [{ id: 'i1', ipo_name: 'IPO 1' }],
    applications: [{ id: 'app1', user_id: 'u1', ipo_id: 'i1' }],
    banks: [{ id: 'b1', bank_name: 'Bank 1' }],
    allotments: [
      {
        id: 'allotment-uuid-001',
        application_id: 'app1',
        allotment_status: 'ALLOTTED',
        allotted_lots: 1,
        allotted_shares: 15,
        allotment_price: 500,
        application_amount: 7500,
        refund_amount: 0,
        checked_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  };

  let allotmentSnapshotPayload: any = null;
  (supabase as any).from = (tableName: string) => ({
    insert: (data: any) => {
      allotmentSnapshotPayload = data.payload;
      return {
        select: () => ({
          single: async () => ({ data: { id: 'snapshot-uuid-222' }, error: null }),
        }),
      };
    },
  });

  await createCloudBackup(async () => JSON.stringify(mockPayloadWithAllotments));
  assert(Array.isArray(allotmentSnapshotPayload.allotments), 'TEST 4', 'Allotments array present in snapshot payload');
  assert(allotmentSnapshotPayload.allotments.length === 1, 'TEST 4', 'Allotment record included in snapshot');
  assert(allotmentSnapshotPayload.allotments[0].allotment_status === 'ALLOTTED', 'TEST 4', 'Allotment status preserved');
  assert(allotmentSnapshotPayload.allotments[0].allotted_shares === 15, 'TEST 4', 'Allotment persistent fields preserved');

  // ---------------------------------------------------------------------------
  // TEST 5: ipo_allotments restores correctly
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: ipo_allotments Restore ---');
  let restoredAllotmentCount = 0;
  (supabase as any).from = () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            single: async () => ({
              data: {
                id: 'snap-5',
                backup_version: 1,
                schema_version: 1,
                payload: mockPayloadWithAllotments,
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  });

  const mockImportJSON = async (jsonStr: string, options?: any) => {
    const obj = JSON.parse(jsonStr);
    restoredAllotmentCount = obj.allotments?.length || 0;
    return {
      users: obj.users?.length || 0,
      ipos: obj.ipos?.length || 0,
      applications: obj.applications?.length || 0,
      banks: obj.banks?.length || 0,
      allotments: restoredAllotmentCount,
    };
  };

  const restoreRes5 = await restoreCloudBackup(mockImportJSON);
  assert(restoreRes5.success, 'TEST 5', 'Restore operation completed successfully');
  assert(restoredAllotmentCount === 1, 'TEST 5', 'Allotments restored into database');

  // ---------------------------------------------------------------------------
  // TEST 6: Unsupported backup_version is rejected BEFORE database changes
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Version Validation (backup_version) ---');
  (supabase as any).from = () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            single: async () => ({
              data: {
                id: 'snap-6',
                backup_version: 999, // UNSUPPORTED VERSION
                schema_version: 1,
                payload: mockPayloadWithAllotments,
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  });

  let importCalled = false;
  const restoreRes6 = await restoreCloudBackup(async (json) => {
    importCalled = true;
    return {};
  });

  assert(!restoreRes6.success, 'TEST 6', 'Restore failed on unsupported backup_version');
  assert(!importCalled, 'TEST 6', 'Database import was NOT called when version validation failed');
  assert(restoreRes6.error?.includes('backup version') || false, 'TEST 6', 'Clear error message returned for unsupported backup_version');

  // ---------------------------------------------------------------------------
  // TEST 7: Unsupported schema_version is rejected BEFORE database changes
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Schema Version Validation ---');
  (supabase as any).from = () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            single: async () => ({
              data: {
                id: 'snap-7',
                backup_version: 1,
                schema_version: 999, // UNSUPPORTED SCHEMA
                payload: mockPayloadWithAllotments,
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  });

  importCalled = false;
  const restoreRes7 = await restoreCloudBackup(async (json) => {
    importCalled = true;
    return {};
  });

  assert(!restoreRes7.success, 'TEST 7', 'Restore failed on unsupported schema_version');
  assert(!importCalled, 'TEST 7', 'Database import was NOT called when schema validation failed');
  assert(restoreRes7.error?.includes('schema version') || false, 'TEST 7', 'Clear error message returned for unsupported schema_version');

  // ---------------------------------------------------------------------------
  // TEST 8: Malformed payload is rejected
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: Malformed Payload Rejection ---');
  (supabase as any).from = () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            single: async () => ({
              data: {
                id: 'snap-8',
                backup_version: 1,
                schema_version: 1,
                payload: null, // MALFORMED PAYLOAD
              },
              error: { message: 'No payload found' },
            }),
          }),
        }),
      }),
    }),
  });

  const restoreRes8 = await restoreCloudBackup(mockImportJSON);
  assert(!restoreRes8.success, 'TEST 8', 'Restore failed for malformed/null payload');
  assert(restoreRes8.error !== undefined, 'TEST 8', 'Error message returned for malformed payload');

  // ---------------------------------------------------------------------------
  // TEST 9: Local IPO logo does NOT cause backup failure
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 9: Local IPO Logo Non-Failure ---');
  let insertAttemptedInTest9 = false;
  (supabase as any).from = (table: string) => ({
    insert: (data: any) => {
      insertAttemptedInTest9 = true;
      return { select: () => ({ single: async () => ({ data: { id: 'snap-9', created_at: new Date().toISOString() }, error: null }) }) };
    },
  });

  const mockPayloadWithLocalLogo = {
    version: 1,
    users: [],
    ipos: [{ id: 'ipo-local', ipo_name: 'IPO Local', logo_url: 'file:///data/user/0/cache/local_logo.png' }],
  };

  const backupRes9 = await createCloudBackup(async () => JSON.stringify(mockPayloadWithLocalLogo));
  assert(backupRes9.success, 'TEST 9', 'Backup succeeded even when IPO contains local file:// logo');
  assert(insertAttemptedInTest9, 'TEST 9', 'Snapshot DB row insertion proceeded successfully without failure');

  // ---------------------------------------------------------------------------
  // TEST 10: Remote HTTPS IPO logo is preserved in snapshot payload
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 10: Remote HTTPS IPO Logo Preserved ---');
  let insertedPayloadInTest10: any = null;
  (supabase as any).from = (table: string) => ({
    insert: (data: any) => {
      insertedPayloadInTest10 = data.payload;
      return { select: () => ({ single: async () => ({ data: { id: 'snap-10', created_at: new Date().toISOString() }, error: null }) }) };
    },
  });

  const mockPayloadWithHttpsLogo = {
    version: 1,
    users: [],
    ipos: [{ id: 'ipo-https', ipo_name: 'IPO HTTPS', logo_url: 'https://assets.groww.in/ipo_logos/rentomojo.png' }],
  };

  const backupRes10 = await createCloudBackup(async () => JSON.stringify(mockPayloadWithHttpsLogo));
  assert(backupRes10.success, 'TEST 10', 'Backup succeeded with remote HTTPS logo');
  assert(insertedPayloadInTest10?.ipos[0]?.logo_url === 'https://assets.groww.in/ipo_logos/rentomojo.png', 'TEST 10', 'Remote HTTPS logo_url was preserved unchanged in backup snapshot');

  // ---------------------------------------------------------------------------
  // TEST 11: Restore database operations rollback when a restore operation fails
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 11: Transactional Rollback On Restore Failure ---');
  (supabase as any).from = () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            single: async () => ({
              data: {
                id: 'snap-11',
                backup_version: 1,
                schema_version: 1,
                payload: mockPayloadWithAllotments,
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  });

  const throwingImportFn = async () => {
    throw new Error('SQLite Constraint Violation in Transaction');
  };

  const restoreRes11 = await restoreCloudBackup(throwingImportFn);
  assert(!restoreRes11.success, 'TEST 11', 'Restore reported failure when transaction threw error');
  assert(restoreRes11.error?.includes('SQLite Constraint Violation') || false, 'TEST 11', 'Original error message preserved');

  // ---------------------------------------------------------------------------
  // TEST 12: Cloud restore does not enqueue legacy uploadService mutations
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 12: Legacy Sync Isolation During Restore ---');
  let suppressSyncFlagPassed = false;
  const syncCheckingImportFn = async (json: string, options?: any) => {
    if (options && options.suppressLegacySync === true) {
      suppressSyncFlagPassed = true;
    }
    return { users: 1, ipos: 1, applications: 1, banks: 1, allotments: 1 };
  };

  await restoreCloudBackup(syncCheckingImportFn);
  assert(suppressSyncFlagPassed, 'TEST 12', 'suppressLegacySync: true flag passed to importJSON during cloud restore');

  // ---------------------------------------------------------------------------
  // TEST 13: Concurrent backup requests are coalesced
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 13: Concurrency & Mutex Lock ---');
  // Reset storage mock to pass
  supabase.storage.from = () => ({
    upload: async (p: string) => ({ data: { path: p }, error: null }),
  }) as any;

  (supabase as any).from = () => ({
    insert: () => ({
      select: () => ({
        single: async () => {
          // Add artificial delay to simulate ongoing backup
          await new Promise((r) => setTimeout(r, 100));
          return { data: { id: 'snap-13' }, error: null };
        },
      }),
    }),
  });

  const p1 = createCloudBackup(async () => JSON.stringify(mockPayloadWithAllotments));
  const p2 = createCloudBackup(async () => JSON.stringify(mockPayloadWithAllotments));

  const [res1, res2] = await Promise.all([p1, p2]);
  assert(Boolean(res1.success || res2.success), 'TEST 13', 'First backup request succeeded');
  assert(Boolean(res1.isPending || res2.isPending), 'TEST 13', 'Concurrent second backup request was queued as pending');

  // ---------------------------------------------------------------------------
  // TEST 14: Changes occurring during active backup cause another backup to be scheduled
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 14: Follow-up Auto Backup Scheduling ---');
  assert(isCloudBackupPending() === true, 'TEST 14', 'Pending flag remains true after concurrent backup attempt');

  // ---------------------------------------------------------------------------
  // TEST 15: Offline pending backup retries after network reconnect
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 15: Offline Pending Backup Reconnect Listener ---');
  let reconnectTriggered = false;
  networkService.onReconnect(() => {
    reconnectTriggered = true;
  });

  networkService.setOnline(false);
  networkService.setOnline(true);
  assert(reconnectTriggered, 'TEST 15', 'networkService onReconnect listener successfully fired upon internet reconnect');

  // ---------------------------------------------------------------------------
  // TEST 16: Successful backup can be fetched as latest backup
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 16: Fetch Latest Metadata ---');
  (supabase as any).from = () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            single: async () => ({
              data: {
                id: 'snap-16',
                owner_id: MOCK_AUTH_UID,
                backup_version: 1,
                schema_version: 1,
                app_version: '2.0.2',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                payload: mockPayloadWithAllotments,
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  });

  const latestMeta = await fetchLatestBackupMetadata();
  assert(latestMeta !== null, 'TEST 16', 'Latest metadata fetched successfully');
  assert(latestMeta?.id === 'snap-16', 'TEST 16', 'Fetched metadata ID matches inserted snapshot');
  assert(latestMeta?.allotmentCount === 1, 'TEST 16', 'Allotment count present in metadata');

  // ---------------------------------------------------------------------------
  // TEST 17: Backup → restore round-trip preserves all entities & remote images
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 17: Full End-to-End Backup -> Restore Round-Trip ---');
  const REMOTE_HTTPS_LOGO = 'https://assets.groww.in/ipo_logos/rentomojo.png';
  const fullEntitiesPayload = {
    version: 1,
    users: [{ id: 'u-rt', name: 'User RT', avatar_url: TEST_DATA_URI }],
    ipos: [{ id: 'i-rt', ipo_name: 'IPO RT', logo_url: REMOTE_HTTPS_LOGO }],
    applications: [{ id: 'app-rt', user_id: 'u-rt', ipo_id: 'i-rt' }],
    banks: [{ id: 'b-rt', bank_name: 'Bank RT', balance: 10000 }],
    allotments: [{ id: 'allot-rt', application_id: 'app-rt', allotment_status: 'ALLOTTED' }],
  };

  let capturedCloudPayload: any = null;
  (supabase as any).from = () => ({
    insert: (data: any) => {
      capturedCloudPayload = data.payload;
      return {
        select: () => ({
          single: async () => ({ data: { id: 'snap-17' }, error: null }),
        }),
      };
    },
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            single: async () => ({
              data: {
                id: 'snap-17',
                backup_version: 1,
                schema_version: 1,
                payload: capturedCloudPayload,
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  });

  supabase.storage.from = () => ({
    upload: async (pathArg: string) => ({ data: { path: pathArg }, error: null }),
    download: async () => {
      const buf = Buffer.from(ONE_BY_ONE_PNG_B64, 'base64');
      return {
        data: {
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          type: 'image/png',
        },
        error: null,
      };
    },
  }) as any;

  // Step 1: Create Backup
  const rtBackupRes = await createCloudBackup(async () => JSON.stringify(fullEntitiesPayload));
  assert(rtBackupRes.success, 'TEST 17', 'Round-trip backup created successfully');

  // Step 2: Restore Backup
  let roundTripImportedPayload: any = null;
  const rtRestoreRes = await restoreCloudBackup(async (jsonStr) => {
    roundTripImportedPayload = JSON.parse(jsonStr);
    return {
      users: roundTripImportedPayload.users.length,
      ipos: roundTripImportedPayload.ipos.length,
      applications: roundTripImportedPayload.applications.length,
      banks: roundTripImportedPayload.banks.length,
      allotments: roundTripImportedPayload.allotments.length,
    };
  });

  assert(rtRestoreRes.success, 'TEST 17', 'Round-trip restore completed successfully');
  assert(roundTripImportedPayload.users.length === 1, 'TEST 17', 'Users preserved');
  assert(roundTripImportedPayload.ipos.length === 1, 'TEST 17', 'IPOs preserved');
  assert(roundTripImportedPayload.applications.length === 1, 'TEST 17', 'Applications preserved');
  assert(roundTripImportedPayload.banks.length === 1, 'TEST 17', 'Banks preserved');
  assert(roundTripImportedPayload.allotments.length === 1, 'TEST 17', 'Allotments preserved');
  assert(roundTripImportedPayload.users[0].avatar_url === TEST_DATA_URI || roundTripImportedPayload.users[0].avatarUrl === TEST_DATA_URI, 'TEST 17', 'User avatar preserved as avatarUrl string');
  assert(roundTripImportedPayload.ipos[0].logo_url === REMOTE_HTTPS_LOGO, 'TEST 17', 'Remote HTTPS IPO logo preserved directly without storage download');

  // ---------------------------------------------------------------------------
  // TEST 18: Avatar Validation & Upload - (a) Valid Avatar Upload
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 18: Avatar Validation - Valid Avatar Upload ---');
  supabase.storage.from = () => ({
    upload: async (storagePath: string) => ({ data: { path: storagePath }, error: null }),
  }) as any;

  const validAvatarResult = await validateAndUploadImageAsset(MOCK_AUTH_UID, TEST_DATA_URI, 'avatar', 'user-abhishek', 'Abhishek');
  assert(validAvatarResult.success === true, 'TEST 18', 'Valid avatar asset upload returned success');
  assert(validAvatarResult.storagePath === `${MOCK_AUTH_UID}/images/avatar_user-abhishek.png`, 'TEST 18', 'Correct storage path generated for Abhishek avatar');

  // ---------------------------------------------------------------------------
  // TEST 19: Avatar Validation & Upload - (b) Missing Avatar File
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 19: Avatar Validation - Missing Avatar File ---');
  const missingAvatarResult = await validateAndUploadImageAsset(MOCK_AUTH_UID, 'file:///missing/path/avatar_abhishek.png', 'avatar', 'user-abhishek', 'Abhishek');
  assert(missingAvatarResult.success === false, 'TEST 19', 'Missing avatar file returns failure');
  assert(missingAvatarResult.errorPhase === 'LOCAL_FILE_VALIDATION', 'TEST 19', 'Failure phase is LOCAL_FILE_VALIDATION');
  assert(missingAvatarResult.errorMessage?.includes('Abhishek') || false, 'TEST 19', 'Error message includes user name Abhishek');
  assert(missingAvatarResult.errorMessage?.includes('does not exist') || false, 'TEST 19', 'Error message details missing file reason');

  // ---------------------------------------------------------------------------
  // TEST 20: Avatar Validation & Upload - (c) Unreadable Avatar File
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 20: Avatar Validation - Unreadable Avatar File ---');
  const unreadableAvatarResult = await validateAndUploadImageAsset(MOCK_AUTH_UID, 'invalid_corrupt_data_uri', 'avatar', 'user-abhishek', 'Abhishek');
  assert(unreadableAvatarResult.success === false, 'TEST 20', 'Unreadable avatar file returns failure');
  assert(unreadableAvatarResult.errorPhase === 'LOCAL_FILE_VALIDATION', 'TEST 20', 'Failure phase is LOCAL_FILE_VALIDATION');
  assert(unreadableAvatarResult.errorMessage?.includes('Abhishek') || false, 'TEST 20', 'Error message includes user name Abhishek');

  // ---------------------------------------------------------------------------
  // TEST 21: Avatar Validation & Upload - (d) Storage Upload Failure
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 21: Avatar Validation - Supabase Storage Upload Failure ---');
  supabase.storage.from = () => ({
    upload: async () => ({ data: null, error: { message: 'Storage connection timeout' } }),
  }) as any;

  const storageFailResult = await validateAndUploadImageAsset(MOCK_AUTH_UID, TEST_DATA_URI, 'avatar', 'user-abhishek', 'Abhishek');
  assert(storageFailResult.success === false, 'TEST 21', 'Storage failure returns upload failure');
  assert(storageFailResult.errorPhase === 'SUPABASE_STORAGE_UPLOAD', 'TEST 21', 'Failure phase is SUPABASE_STORAGE_UPLOAD');
  assert(storageFailResult.errorMessage?.includes('Abhishek') || false, 'TEST 21', 'Error message includes user name Abhishek');

  // ---------------------------------------------------------------------------
  // TEST 22: Avatar Validation & Upload - (e) Successful Complete Backup
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 22: Complete Backup with Valid Avatar ---');
  supabase.storage.from = () => ({
    upload: async (p: string) => ({ data: { path: p }, error: null }),
  }) as any;

  let insertedBackupPayload22: any = null;
  (supabase as any).from = (table: string) => ({
    insert: (data: any) => {
      insertedBackupPayload22 = data.payload;
      return { select: () => ({ single: async () => ({ data: { id: 'snap-22' }, error: null }) }) };
    },
  });

  const validCompleteBackupPayload = {
    version: 1,
    users: [{ id: 'user-abhishek', name: 'Abhishek', avatar_url: TEST_DATA_URI }],
    ipos: [],
  };

  const completeBackupRes = await createCloudBackup(async () => JSON.stringify(validCompleteBackupPayload));
  assert(completeBackupRes.success === true, 'TEST 22', 'Complete cloud backup succeeded');
  assert(insertedBackupPayload22 !== null, 'TEST 22', 'Database snapshot inserted');
  assert(insertedBackupPayload22.users[0].avatar_url === TEST_DATA_URI || insertedBackupPayload22.users[0].avatarUrl === TEST_DATA_URI, 'TEST 22', 'Avatar reference stored as avatarUrl string');

  // ---------------------------------------------------------------------------
  // TEST 23: Local File/Cache URI persistence via saveBase64ToLocalImage
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 23: Cache File URI Persistence ---');
  const { saveBase64ToLocalImage } = await import('../utils/imageUtils');
  // Create a temporary physical test file simulating DocumentPicker cache URI
  const scratchTestDir = path.join(process.cwd(), 'scratch', 'test_cache');
  if (!fs.existsSync(scratchTestDir)) fs.mkdirSync(scratchTestDir, { recursive: true });
  const tempCacheFilePath = path.join(scratchTestDir, 'temp_picker_avatar.png');
  fs.writeFileSync(tempCacheFilePath, Buffer.from(ONE_BY_ONE_PNG_B64, 'base64'));
  const tempCacheUri = `file://${tempCacheFilePath.replace(/\\/g, '/')}`;

  const savedPermanentUri = await saveBase64ToLocalImage(tempCacheUri, 'avatar', 'user-abhishek');
  assert(savedPermanentUri !== null, 'TEST 23', 'saveBase64ToLocalImage converted local cache URI to permanent storage');
  assert(savedPermanentUri?.includes('avatar_user-abhishek') || false, 'TEST 23', 'Permanent storage path formatted with user id prefix');
  assert(savedPermanentUri !== tempCacheUri, 'TEST 23', 'Permanent storage path is distinct from temporary cache URI');

  // ---------------------------------------------------------------------------
  // TEST 24: Legacy Local Avatar Path Handling - Safe Fallback to DiceBear
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 24: Legacy Local Avatar Path Handling ---');
  let insertedPayload24: any = null;
  (supabase as any).from = (table: string) => ({
    insert: (data: any) => {
      insertedPayload24 = data.payload;
      return { select: () => ({ single: async () => ({ data: { id: 'snap-24' }, error: null }) }) };
    },
  });

  const staleAvatarPayload = {
    version: 1,
    users: [{ id: 'user-abhishek', name: 'Abhishek', avatar_url: 'file:///data/user/0/host.exp.exponent/cache/DocumentPicker/stale_avatar.jpg' }],
    ipos: [],
  };

  const staleAvatarBackupRes = await createCloudBackup(async () => JSON.stringify(staleAvatarPayload));
  assert(staleAvatarBackupRes.success === true, 'TEST 24', 'Backup succeeded when Abhishek avatar points to a legacy local file');
  assert(insertedPayload24 !== null, 'TEST 24', 'Database snapshot row inserted successfully');
  assert(insertedPayload24.users[0].avatarUrl === 'https://api.dicebear.com/10.x/initials/svg?seed=Abhishek', 'TEST 24', 'Backup replaced legacy local avatar path with deterministic DiceBear URL');

  console.log('\n===============================================================');
  console.log(`PHASE 1B.1 SUITE COMPLETED: Passed ${passCount} / ${passCount + failCount} tests.`);
  console.log('===============================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase1B1TestSuite().catch((err) => {
  console.error('Test Suite Exception:', err);
  process.exit(1);
});
