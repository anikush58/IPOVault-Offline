import {
  createCloudBackup,
  restoreCloudBackup,
  scheduleDebouncedCloudBackup,
  SUPPORTED_BACKUP_VERSION,
  CURRENT_SCHEMA_VERSION,
} from '../services/cloud/cloudBackupService';
import { IPOVaultExportData } from '../services/cloud/firestoreSyncService';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    failCount++;
  }
}

async function runCloudBackupWrapperTests() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT CLOUD BACKUP SERVICE WRAPPER TESTS');
  console.log('===============================================================\n');

  const mockUid = 'firebase-user-abc-123';

  // TEST 1: Unauthenticated createCloudBackup returns error
  const unauthRes = await createCloudBackup(async () => JSON.stringify({ version: 1, users: [], ipos: [], applications: [] }));
  assert(!unauthRes.success && unauthRes.error?.includes('authenticated') === true, 'TEST 1', 'Unauthenticated backup fails with auth error');

  // TEST 2: Unauthenticated restoreCloudBackup returns error
  const unauthRestore = await restoreCloudBackup(async () => ({ users: 0, ipos: 0, applications: 0 }));
  assert(!unauthRestore.success && unauthRestore.error?.includes('authenticated') === true, 'TEST 2', 'Unauthenticated restore fails with auth error');

  // TEST 3: Constants match expected versioning
  assert(SUPPORTED_BACKUP_VERSION === 1, 'TEST 3', 'SUPPORTED_BACKUP_VERSION is 1');
  assert(CURRENT_SCHEMA_VERSION >= 1, 'TEST 3', 'CURRENT_SCHEMA_VERSION is valid');

  // TEST 4: Debounce scheduling function runs without throwing
  let debounceThrew = false;
  try {
    scheduleDebouncedCloudBackup(async () => JSON.stringify({ version: 1, users: [], ipos: [], applications: [] }), 100, mockUid);
  } catch {
    debounceThrew = true;
  }
  assert(!debounceThrew, 'TEST 4', 'scheduleDebouncedCloudBackup schedules without throwing');

  console.log('\n===============================================================');
  console.log(`TESTS COMPLETED: Passed ${passCount} / ${passCount + failCount}`);
  console.log('===============================================================');

  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runCloudBackupWrapperTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
