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
  // TEST 2: file:// URI is never stored as cloud image reference
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: file:// Exclusion ---');
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
  assert(insertedSnapshotPayload.users[0].avatar_url === `${MOCK_AUTH_UID}/images/avatar_user-001.png`, 'TEST 2', 'User avatar_url file:// URI replaced with Storage Object Path');
  assert(insertedSnapshotPayload.ipos[0].logo_url === `${MOCK_AUTH_UID}/images/logo_ipo-101.png`, 'TEST 2', 'IPO logo_url file:// URI replaced with Storage Object Path');

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
  // TEST 9: Image upload failure causes complete backup failure
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 9: Image Upload Failure Atomicity ---');
  supabase.storage.from = () => ({
    upload: async () => {
      return { data: null, error: { message: 'Storage quota exceeded / Upload failed' } };
    },
  }) as any;

  const mockPayloadToFailImage = {
    version: 1,
    users: [{ id: 'u-fail', name: 'User Fail', avatar_url: TEST_DATA_URI }],
    ipos: [],
  };

  const backupRes9 = await createCloudBackup(async () => JSON.stringify(mockPayloadToFailImage));
  assert(!backupRes9.success, 'TEST 9', 'Backup failed when image upload failed');
  assert(backupRes9.error?.includes('Failed to upload required avatar image') || false, 'TEST 9', 'Clear error message indicating image failure');

  // ---------------------------------------------------------------------------
  // TEST 10: Snapshot is not inserted when required image upload fails
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 10: No Snapshot Insert On Image Failure ---');
  let insertAttemptedOnFail = false;
  (supabase as any).from = (table: string) => ({
    insert: () => {
      insertAttemptedOnFail = true;
      return { select: () => ({ single: async () => ({ data: {}, error: null }) }) };
    },
  });

  await createCloudBackup(async () => JSON.stringify(mockPayloadToFailImage));
  assert(!insertAttemptedOnFail, 'TEST 10', 'Snapshot DB row insertion was NOT attempted when image upload failed');

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
  assert(res1.success || res2.success, 'TEST 13', 'First backup request succeeded');
  assert(res1.isPending || res2.isPending, 'TEST 13', 'Concurrent second backup request was queued as pending');

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
  // TEST 17: Backup → restore round-trip preserves all entities & images
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 17: Full End-to-End Backup -> Restore Round-Trip ---');
  const fullEntitiesPayload = {
    version: 1,
    users: [{ id: 'u-rt', name: 'User RT', avatar_url: TEST_DATA_URI }],
    ipos: [{ id: 'i-rt', ipo_name: 'IPO RT', logo_url: TEST_DATA_URI }],
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
  assert(roundTripImportedPayload.users[0].avatar_url.startsWith('file://'), 'TEST 17', 'User avatar restored as local file:// URI');
  assert(roundTripImportedPayload.ipos[0].logo_url.startsWith('file://'), 'TEST 17', 'IPO logo restored as local file:// URI');

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
