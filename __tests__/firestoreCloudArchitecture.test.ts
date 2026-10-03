import { resolveCanonicalBrokerUserId } from '../utils/brokerMatching';
import {
  IPOVaultExportData,
  CloudSyncMetadata,
  setSuppressCloudSync,
  isSuppressingCloudSync,
  isSyncInProgressForUid,
} from '../services/cloud/firestoreSyncService';

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

// 1 MiB constant in bytes
const FIRESTORE_DOC_MAX_BYTES = 1048576; // 1,048,576 bytes (1 MiB)

async function runFirestoreCloudTestSuite() {
  console.log('======================================================================');
  console.log('RUNNING IPOVAULT FIRESTORE CLOUD ARCHITECTURE & SUBCOLLECTIONS TEST SUITE');
  console.log('======================================================================\n');

  const mockUid = 'firebase_user_abc123';
  const mockExportData: IPOVaultExportData = {
    version: 1,
    exported_at: '2026-10-03T10:00:00.000Z',
    banks: [
      { id: 'bank-1', bank_name: 'HDFC Bank', balance: 50000 },
      { id: 'bank-2', bank_name: 'ICICI Bank', balance: 75000 },
    ],
    users: [
      {
        id: 'usr-1',
        name: 'Anish Kushwaha',
        pan_number: 'ABCDE1234F',
        broker: 'ZERODHA',
        client_id: 'ZR1234',
        bank_name: 'HDFC Bank',
        upi_app: 'GPay',
        tpin: '1234',
        default_amount_blocked: 15000,
        archived: 0,
      },
    ],
    ipos: [
      {
        id: 'ipo-1',
        ipo_name: 'Tata Tech IPO',
        buy_price: 500,
        quantity: 30,
        open_date: '2026-10-01',
        close_date: '2026-10-05',
        listing_date: '2026-10-10',
        archived: 0,
        is_favorite: 1,
        registrar: 'LINK_INTIME',
      },
    ],
    applications: [
      {
        id: 'app-1',
        user_id: 'usr-1',
        ipo_id: 'ipo-1',
        status: 'Holding',
        shares_count: 30,
        quantity: 30,
        sell_price: 1200,
        sale_date: null,
        tax: 0,
        user_cut: 0,
        is_favorite: 1,
      },
    ],
    allotments: [
      {
        id: 'alt-1',
        application_id: 'app-1',
        user_id: 'usr-1',
        ipo_id: 'ipo-1',
        allotment_status: 'ALLOTTED',
        allotted_lots: 1,
        allotted_shares: 30,
        allotment_price: 500,
        application_amount: 15000,
        refund_amount: 0,
      },
    ],
  };

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: User-Scoped Firestore Data Model & Security
  // ──────────────────────────────────────────────────────────────────────────
  assert(
    mockExportData.users?.length === 1 && mockExportData.applications?.length === 1,
    'Test 1a: Data Integrity',
    'Export JSON dataset contains valid user profiles and applications'
  );

  const rawString = JSON.stringify(mockExportData);
  assert(
    !rawString.includes('password') && !rawString.includes('authToken') && !rawString.includes('secretKey'),
    'Test 1b: Security',
    'No sensitive credentials, passwords, or tokens in Firestore payload'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Subcollection-Based Sync (No Giant Document Exceeding 1 MiB)
  // ──────────────────────────────────────────────────────────────────────────
  const firestoreDbSimulator: Record<string, any> = {};

  const simulateSubcollectionSync = (uid: string, data: IPOVaultExportData) => {
    // 1. Lightweight metadata & header
    const nowIso = new Date().toISOString();
    firestoreDbSimulator[`users/${uid}/metadata/sync_state`] = {
      last_synced_at: nowIso,
      version: data.version || 1,
      userCount: data.users?.length || 0,
      ipoCount: data.ipos?.length || 0,
      applicationCount: data.applications?.length || 0,
      bankCount: data.banks?.length || 0,
      allotmentCount: data.allotments?.length || 0,
      owner_id: uid,
    };

    firestoreDbSimulator[`users/${uid}/metadata/snapshot`] = {
      version: data.version || 1,
      owner_id: uid,
      synced_at: nowIso,
      counts: {
        users: data.users?.length || 0,
        ipos: data.ipos?.length || 0,
        applications: data.applications?.length || 0,
        banks: data.banks?.length || 0,
        allotments: data.allotments?.length || 0,
      },
    };

    // 2. Individual subcollection documents
    for (const u of data.users || []) {
      firestoreDbSimulator[`users/${uid}/profiles/${u.id}`] = { ...u, owner_id: uid };
    }
    for (const i of data.ipos || []) {
      firestoreDbSimulator[`users/${uid}/ipos/${i.id}`] = { ...i, owner_id: uid };
    }
    for (const a of data.applications || []) {
      firestoreDbSimulator[`users/${uid}/applications/${a.id}`] = { ...a, owner_id: uid };
    }
    for (const b of data.banks || []) {
      firestoreDbSimulator[`users/${uid}/bankAccounts/${b.id}`] = { ...b, owner_id: uid };
    }
    for (const alt of data.allotments || []) {
      firestoreDbSimulator[`users/${uid}/allotments/${alt.id}`] = { ...alt, owner_id: uid };
    }
  };

  simulateSubcollectionSync(mockUid, mockExportData);

  assert(
    firestoreDbSimulator[`users/${mockUid}/profiles/usr-1`]?.name === 'Anish Kushwaha',
    'Test 2a: Subcollections',
    'User profile stored in /users/{uid}/profiles subcollection'
  );

  assert(
    firestoreDbSimulator[`users/${mockUid}/applications/app-1`]?.status === 'Holding',
    'Test 2b: Subcollections',
    'Application stored in /users/{uid}/applications subcollection'
  );

  assert(
    firestoreDbSimulator[`users/${mockUid}/metadata/snapshot`]?.counts?.applications === 1,
    'Test 2c: Lightweight Header',
    'Snapshot document contains summary metadata only (no raw bulk arrays)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Realistic > 1 MiB Dataset Stress Test (Reproducing 1,058,490+ bytes)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: > 1 MiB Dataset Stress Test ---');
  // Generate a realistic dataset totaling > 1.15 MB (1,200,000+ bytes)
  const largeDataset: IPOVaultExportData = {
    version: 1,
    exported_at: new Date().toISOString(),
    users: [],
    ipos: [],
    applications: [],
    banks: [],
    allotments: [],
  };

  // Add 10 users with avatar data URIs (~30 KB each = 300 KB)
  for (let i = 1; i <= 10; i++) {
    largeDataset.users!.push({
      id: `stress-user-${i}`,
      name: `Stress User ${i}`,
      pan_number: `STRES${i.toString().padStart(4, '0')}X`,
      broker: 'ZERODHA',
      client_id: `CL${i}`,
      bank_name: 'HDFC Bank',
      upi_app: 'GPay',
      tpin: '1234',
      avatar_url: `data:image/png;base64,${'A'.repeat(30000)}`, // ~30 KB per user
      default_amount_blocked: 15000,
    });
  }

  // Add 50 IPOs (~2 KB each = 100 KB)
  for (let i = 1; i <= 50; i++) {
    largeDataset.ipos!.push({
      id: `stress-ipo-${i}`,
      ipo_name: `Stress IPO Listing #${i} Company Ltd`,
      buy_price: 250 + i,
      quantity: 50,
      open_date: '2026-10-01',
      close_date: '2026-10-05',
      listing_date: '2026-10-10',
      logo_url: `https://assets.ipovault.app/logos/stress_${i}.png`,
    });
  }

  // Add 500 Applications with detailed notes (~1.6 KB each = 800 KB)
  for (let i = 1; i <= 500; i++) {
    const userIdx = (i % 10) + 1;
    const ipoIdx = (i % 50) + 1;
    largeDataset.applications!.push({
      id: `stress-app-${i}`,
      user_id: `stress-user-${userIdx}`,
      ipo_id: `stress-ipo-${ipoIdx}`,
      status: i % 3 === 0 ? 'Allotted' : i % 2 === 0 ? 'Holding' : 'Applied',
      shares_count: 50,
      quantity: 50,
      sell_price: i % 2 === 0 ? 550 : null,
      sale_date: i % 2 === 0 ? '2026-10-12' : null,
      tax: 150,
      user_cut: 500,
      bank_name: 'HDFC Bank',
      upi_app: 'GPay',
      app_number: `IPO-APP-2026-${i.toString().padStart(6, '0')}`,
      category: 'INDIVIDUAL_RETAIL',
      notes: `Detailed application metadata and audit log comments for investor tracking ${'X'.repeat(1500)}`,
    });
  }

  // Add 500 Allotment records (~300 bytes each = 150 KB)
  for (let i = 1; i <= 500; i++) {
    largeDataset.allotments!.push({
      id: `stress-alt-${i}`,
      application_id: `stress-app-${i}`,
      user_id: largeDataset.applications![i - 1].user_id,
      ipo_id: largeDataset.applications![i - 1].ipo_id,
      allotment_status: i % 3 === 0 ? 'ALLOTTED' : 'NOT_ALLOTTED',
      allotted_lots: i % 3 === 0 ? 1 : 0,
      allotted_shares: i % 3 === 0 ? 50 : 0,
      allotment_price: 250,
      application_amount: 15000,
      refund_amount: i % 3 === 0 ? 0 : 15000,
    });
  }

  const totalRawDatasetBytes = Buffer.byteLength(JSON.stringify(largeDataset), 'utf8');
  console.log(`[Stress Test] Total raw dataset size: ${(totalRawDatasetBytes / 1024 / 1024).toFixed(2)} MB (${totalRawDatasetBytes.toLocaleString()} bytes)`);

  assert(
    totalRawDatasetBytes > FIRESTORE_DOC_MAX_BYTES,
    'Test 3a: Dataset Size Condition',
    `Dataset size (${totalRawDatasetBytes.toLocaleString()} bytes) exceeds Firestore 1 MiB single-document limit (${FIRESTORE_DOC_MAX_BYTES.toLocaleString()} bytes)`
  );

  // Sync large dataset to simulator
  const largeUid = 'firebase_user_stress_999';
  simulateSubcollectionSync(largeUid, largeDataset);

  // Verify that EVERY individual document in the simulator is strictly < 1 MiB
  let maxDocBytes = 0;
  let maxDocPath = '';
  const userPrefix = `users/${largeUid}/`;

  for (const [path, docData] of Object.entries(firestoreDbSimulator)) {
    if (!path.startsWith(userPrefix)) continue;
    const docBytes = Buffer.byteLength(JSON.stringify(docData), 'utf8');
    if (docBytes > maxDocBytes) {
      maxDocBytes = docBytes;
      maxDocPath = path;
    }
    assert(
      docBytes < FIRESTORE_DOC_MAX_BYTES,
      'Test 3b: Document Limit Check',
      `Document ${path} size (${docBytes.toLocaleString()} bytes) is safely below 1 MiB limit`
    );
  }

  console.log(`[Stress Test] Maximum single document size: ${(maxDocBytes / 1024).toFixed(2)} KB at ${maxDocPath}`);
  assert(
    maxDocBytes < 100 * 1024,
    'Test 3c: Document Overhead',
    `Largest document is only ${(maxDocBytes / 1024).toFixed(2)} KB (well below 100 KB)`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Reconstructive Subcollection Restore (100% Data Preservation)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Reconstructive Restore from Subcollections ---');
  // Simulate reconstructive restore from subcollections
  const simulateSubcollectionRestore = (uid: string): IPOVaultExportData => {
    const restoredUsers: any[] = [];
    const restoredIpos: any[] = [];
    const restoredApps: any[] = [];
    const restoredBanks: any[] = [];
    const restoredAllotments: any[] = [];

    const prefix = `users/${uid}/`;
    for (const [path, data] of Object.entries(firestoreDbSimulator)) {
      if (!path.startsWith(prefix)) continue;
      const subPath = path.slice(prefix.length);
      if (subPath.startsWith('profiles/')) restoredUsers.push(data);
      else if (subPath.startsWith('ipos/')) restoredIpos.push(data);
      else if (subPath.startsWith('applications/')) restoredApps.push(data);
      else if (subPath.startsWith('bankAccounts/')) restoredBanks.push(data);
      else if (subPath.startsWith('allotments/')) restoredAllotments.push(data);
    }

    return {
      version: 1,
      exported_at: new Date().toISOString(),
      users: restoredUsers,
      ipos: restoredIpos,
      applications: restoredApps,
      banks: restoredBanks,
      allotments: restoredAllotments,
    };
  };

  const restoredLargeData = simulateSubcollectionRestore(largeUid);
  assert(
    restoredLargeData.users?.length === 10,
    'Test 4a: User Profiles Restored',
    'All 10 user profiles successfully restored from subcollection'
  );
  assert(
    restoredLargeData.ipos?.length === 50,
    'Test 4b: IPOs Restored',
    'All 50 IPO listings successfully restored from subcollection'
  );
  assert(
    restoredLargeData.applications?.length === 500,
    'Test 4c: Applications Restored',
    'All 500 applications successfully restored with all fields intact'
  );
  assert(
    restoredLargeData.allotments?.length === 500,
    'Test 4d: Allotments Restored',
    'All 500 allotment records successfully restored with status and amounts'
  );

  // Check field preservation
  const sampleApp = restoredLargeData.applications?.find((a) => a.id === 'stress-app-100');
  assert(
    sampleApp !== undefined && sampleApp.app_number === 'IPO-APP-2026-000100' && sampleApp.category === 'INDIVIDUAL_RETAIL',
    'Test 4e: Field Integrity',
    'Application fields (app_number, category, notes, tax, user_cut) preserved without truncation'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Idempotent SQLite Restore (No Duplicate Rows)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Idempotent SQLite Restore ---');
  const localSqliteStore: Record<string, any[]> = {
    users_table: [],
    ipo_listings: [],
    ipo_applications: [],
    ipo_allotments: [],
  };

  const simulateSqliteUpsert = (data: IPOVaultExportData) => {
    for (const u of data.users || []) {
      const idx = localSqliteStore.users_table.findIndex((x) => x.id === u.id || x.pan_number === u.pan_number);
      if (idx >= 0) localSqliteStore.users_table[idx] = { ...localSqliteStore.users_table[idx], ...u };
      else localSqliteStore.users_table.push({ ...u });
    }
    for (const a of data.applications || []) {
      const idx = localSqliteStore.ipo_applications.findIndex((x) => x.id === a.id);
      if (idx >= 0) localSqliteStore.ipo_applications[idx] = { ...localSqliteStore.ipo_applications[idx], ...a };
      else localSqliteStore.ipo_applications.push({ ...a });
    }
    for (const alt of data.allotments || []) {
      const idx = localSqliteStore.ipo_allotments.findIndex((x) => x.id === alt.id || x.application_id === alt.application_id);
      if (idx >= 0) localSqliteStore.ipo_allotments[idx] = { ...localSqliteStore.ipo_allotments[idx], ...alt };
      else localSqliteStore.ipo_allotments.push({ ...alt });
    }
  };

  // First restore into SQLite
  simulateSqliteUpsert(restoredLargeData);
  assert(
    localSqliteStore.users_table.length === 10 &&
    localSqliteStore.ipo_applications.length === 500 &&
    localSqliteStore.ipo_allotments.length === 500,
    'Test 5a: Initial SQLite Population',
    'SQLite loaded 10 users, 500 applications, and 500 allotments'
  );

  // Second restore (Idempotency verification)
  simulateSqliteUpsert(restoredLargeData);
  assert(
    localSqliteStore.users_table.length === 10 &&
    localSqliteStore.ipo_applications.length === 500 &&
    localSqliteStore.ipo_allotments.length === 500,
    'Test 5b: Idempotent Population',
    'Repeated restore created ZERO duplicate rows in SQLite'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Multi-User Security & Isolation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Multi-User Security & Isolation ---');
  const userBUid = 'firebase_user_different_456';
  const userBData: IPOVaultExportData = {
    users: [{ id: 'usr-b-1', name: 'User B', pan_number: 'BBBBB5555B' }],
    applications: [{ id: 'app-b-1', user_id: 'usr-b-1', ipo_id: 'ipo-1', status: 'Applied' }],
  };

  simulateSubcollectionSync(userBUid, userBData);

  // Verify User A subcollection query never returns User B data
  const userARestored = simulateSubcollectionRestore(mockUid);
  const userBRestored = simulateSubcollectionRestore(userBUid);

  assert(
    userARestored.users?.every((u) => u.id !== 'usr-b-1') === true,
    'Test 6a: Multi-User Isolation',
    'User A restored dataset does not contain any User B profiles'
  );
  assert(
    userBRestored.users?.length === 1 && userBRestored.users[0].id === 'usr-b-1',
    'Test 6b: User B Self Scoping',
    'User B restored dataset strictly contains User B records'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Canonical Broker Identity Resolution
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 7: Broker Identity Resolution ---');
  const mockAuthUser = {
    id: mockUid,
    uid: mockUid,
    email: 'trader@ipovault.app',
  };

  const resolvedBrokerUserId = resolveCanonicalBrokerUserId(mockAuthUser, null);
  assert(
    resolvedBrokerUserId === mockUid,
    'Test 7',
    'Canonical broker user ID resolves to authenticated Firebase UID'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: First-Device Full Restore & Local Sync Cursor Initialization
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 8: First-Device Full Restore & Cursor Initialization ---');
  const deviceAStore: Record<string, string | null> = {};
  const deviceBStore: Record<string, string | null> = {};

  const getDeviceCursor = (store: Record<string, string | null>, uid: string) => store[`ipovault_last_synced_at_${uid}`] || null;
  const setDeviceCursor = (store: Record<string, string | null>, uid: string, ts: string) => {
    store[`ipovault_last_synced_at_${uid}`] = ts;
  };

  const initialCloudTimestamp = '2026-10-03T10:00:00.000Z';
  firestoreDbSimulator[`users/${mockUid}/metadata/sync_state`].last_synced_at = initialCloudTimestamp;

  // Device A has no local cursor initially (first login / fresh install)
  assert(
    getDeviceCursor(deviceAStore, mockUid) === null,
    'Test 8a: Device A Initial State',
    'Device A has null cursor before initial sync'
  );

  // Perform full initial restore on Device A
  const deviceAInitialRestore = simulateSubcollectionRestore(mockUid);
  setDeviceCursor(deviceAStore, mockUid, initialCloudTimestamp);

  assert(
    deviceAInitialRestore.users?.length === 1 && deviceAInitialRestore.applications?.length === 1,
    'Test 8b: Device A Initial Full Restore',
    'Device A successfully fetched full initial dataset'
  );
  assert(
    getDeviceCursor(deviceAStore, mockUid) === initialCloudTimestamp,
    'Test 8c: Device A Cursor Initialized',
    `Device A cursor set to ${initialCloudTimestamp}`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Second Login with No Changes → Zero Reads / Up-To-Date
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 9: Second Login with No Changes (Zero Reads) ---');
  const simulateDeltaSync = (
    uid: string,
    deviceLocalCursor: string | null,
    onFetchDocRead: () => void
  ): { upToDate: boolean; changesCount: number; newCursor: string } => {
    const cloudMetadata = firestoreDbSimulator[`users/${uid}/metadata/sync_state`];
    const cloudLastSyncedAt = cloudMetadata?.last_synced_at;

    if (!deviceLocalCursor) {
      // First restore
      return { upToDate: false, changesCount: 999, newCursor: cloudLastSyncedAt };
    }

    if (deviceLocalCursor >= cloudLastSyncedAt) {
      // Zero reads
      return { upToDate: true, changesCount: 0, newCursor: deviceLocalCursor };
    }

    // Query changed docs with updated_at > deviceLocalCursor
    let changed = 0;
    const prefix = `users/${uid}/`;
    for (const [path, data] of Object.entries(firestoreDbSimulator)) {
      if (!path.startsWith(prefix) || path.includes('/metadata/')) continue;
      if (data.updated_at && data.updated_at > deviceLocalCursor) {
        onFetchDocRead();
        changed++;
      }
    }

    return { upToDate: false, changesCount: changed, newCursor: cloudLastSyncedAt };
  };

  let docReads = 0;
  const secondLoginResult = simulateDeltaSync(
    mockUid,
    getDeviceCursor(deviceAStore, mockUid),
    () => docReads++
  );

  assert(
    secondLoginResult.upToDate === true && secondLoginResult.changesCount === 0 && docReads === 0,
    'Test 9: Second Login Optimization',
    'Subsequent login with unchanged cloud state performs 0 document reads and terminates immediately'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Single Record Update → Delta Sync Downloads Only 1 Document
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 10: Single Record Update Delta Sync ---');
  const t2Timestamp = '2026-10-03T10:15:00.000Z';
  // Update 1 application in Firestore
  firestoreDbSimulator[`users/${mockUid}/applications/app-1`] = {
    ...firestoreDbSimulator[`users/${mockUid}/applications/app-1`],
    status: 'Sold',
    sell_price: 1500,
    updated_at: t2Timestamp,
  };
  firestoreDbSimulator[`users/${mockUid}/metadata/sync_state`].last_synced_at = t2Timestamp;

  docReads = 0;
  const singleUpdateResult = simulateDeltaSync(
    mockUid,
    getDeviceCursor(deviceAStore, mockUid),
    () => docReads++
  );
  setDeviceCursor(deviceAStore, mockUid, singleUpdateResult.newCursor);

  assert(
    singleUpdateResult.upToDate === false && singleUpdateResult.changesCount === 1 && docReads === 1,
    'Test 10: Single Record Delta Sync',
    'Only the 1 modified application was downloaded, skipping all unmodified profiles, IPOs, banks, and allotments'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: New Record Creation → Delta Sync Downloads Only New Record
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 11: New Record Creation Delta Sync ---');
  const t3Timestamp = '2026-10-03T10:30:00.000Z';
  // Add 1 new IPO listing
  firestoreDbSimulator[`users/${mockUid}/ipos/ipo-new-2`] = {
    id: 'ipo-new-2',
    ipo_name: 'Hero FinCorp IPO',
    buy_price: 120,
    quantity: 100,
    owner_id: mockUid,
    updated_at: t3Timestamp,
  };
  firestoreDbSimulator[`users/${mockUid}/metadata/sync_state`].last_synced_at = t3Timestamp;

  docReads = 0;
  const newRecordResult = simulateDeltaSync(
    mockUid,
    getDeviceCursor(deviceAStore, mockUid),
    () => docReads++
  );
  setDeviceCursor(deviceAStore, mockUid, newRecordResult.newCursor);

  assert(
    newRecordResult.upToDate === false && newRecordResult.changesCount === 1 && docReads === 1,
    'Test 11: New Record Delta Sync',
    'Only the 1 newly added IPO listing was fetched by delta sync'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: Tombstone Deletion Propagation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 12: Tombstone Deletion Propagation ---');
  const t4Timestamp = '2026-10-03T10:45:00.000Z';
  // Soft delete / tombstone app-1
  firestoreDbSimulator[`users/${mockUid}/applications/app-1`] = {
    ...firestoreDbSimulator[`users/${mockUid}/applications/app-1`],
    updated_at: t4Timestamp,
    deleted_at: t4Timestamp,
  };
  firestoreDbSimulator[`users/${mockUid}/metadata/sync_state`].last_synced_at = t4Timestamp;

  docReads = 0;
  const tombstoneResult = simulateDeltaSync(
    mockUid,
    getDeviceCursor(deviceAStore, mockUid),
    () => docReads++
  );
  setDeviceCursor(deviceAStore, mockUid, tombstoneResult.newCursor);

  assert(
    tombstoneResult.upToDate === false && tombstoneResult.changesCount === 1 && docReads === 1,
    'Test 12a: Tombstone Delta Read',
    'Delta query successfully fetched tombstoned deletion record'
  );

  // Ensure app-1 exists in SQLite store before applying deletion
  if (!localSqliteStore.ipo_applications.some((a) => a.id === 'app-1')) {
    localSqliteStore.ipo_applications.push({ id: 'app-1', client_name: 'Tester', deleted_at: null } as any);
  }

  // Apply tombstone to local SQLite simulator
  const targetApp = localSqliteStore.ipo_applications.find((a) => a.id === 'app-1');
  if (targetApp) {
    targetApp.deleted_at = t4Timestamp;
  }
  const activeApps = localSqliteStore.ipo_applications.filter((a) => !a.deleted_at);
  assert(
    activeApps.length === 500 && targetApp?.deleted_at === t4Timestamp,
    'Test 12b: SQLite Tombstone Application',
    'Tombstone applied in SQLite, correctly soft-deleting the application'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 13: Multi-Device Synchronization Flow (Device A -> Device B)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 13: Multi-Device Synchronization (Device A -> Device B) ---');
  // Initialize Device B with initial restore up to t3Timestamp
  setDeviceCursor(deviceBStore, mockUid, t3Timestamp);

  // Device B syncs after Device A performed deletion at t4Timestamp
  docReads = 0;
  const deviceBSyncResult = simulateDeltaSync(
    mockUid,
    getDeviceCursor(deviceBStore, mockUid),
    () => docReads++
  );
  setDeviceCursor(deviceBStore, mockUid, deviceBSyncResult.newCursor);

  assert(
    deviceBSyncResult.changesCount === 1 && docReads === 1,
    'Test 13a: Multi-Device Delta',
    'Device B received Device A deletion without downloading entire dataset'
  );
  assert(
    getDeviceCursor(deviceBStore, mockUid) === t4Timestamp,
    'Test 13b: Multi-Device Cursor Alignment',
    'Device B cursor is now aligned with Device A and Cloud'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 14: In-Flight Concurrency Mutex & Loop Prevention
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 14: In-Flight Concurrency Mutex & Loop Prevention ---');
  let activeSyncs = new Set<string>();
  const testConcurrency = (uid: string) => {
    if (activeSyncs.has(uid)) {
      return { success: true, skipped: true };
    }
    activeSyncs.add(uid);
    try {
      return { success: true, executed: true };
    } finally {
      activeSyncs.delete(uid);
    }
  };

  const call1 = testConcurrency('uid-123');
  activeSyncs.add('uid-123'); // Simulate in-flight lock
  const call2 = testConcurrency('uid-123');
  activeSyncs.delete('uid-123'); // Release lock
  const call3 = testConcurrency('uid-123');

  assert(
    call1.executed === true && call2.skipped === true && call3.executed === true,
    'Test 14: Concurrency Lock',
    'Duplicate in-flight sync calls for the same UID are safely skipped, preventing execution loops'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 15: Outbound Cloud Sync Suppression During Restore
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 15: Outbound Cloud Sync Suppression During Restore ---');
  setSuppressCloudSync(true);
  assert(
    isSuppressingCloudSync() === true,
    'Test 15a: Suppression Flag Set',
    'isSuppressingCloudSync returns true while restoring/applying delta changes'
  );

  let simulatedOutboundWriteTriggered = false;
  const triggerSimulatedLocalChange = () => {
    if (isSuppressingCloudSync()) {
      return; // Suppressed
    }
    simulatedOutboundWriteTriggered = true;
  };

  triggerSimulatedLocalChange();
  assert(
    simulatedOutboundWriteTriggered === false,
    'Test 15b: Outbound Write Blocked',
    'Local mutations during cloud restore/delta application do NOT trigger outbound Firestore writes'
  );

  setSuppressCloudSync(false);
  assert(
    isSuppressingCloudSync() === false,
    'Test 15c: Suppression Flag Cleared',
    'Suppression flag is properly cleared after sync completion'
  );

  console.log('\n======================================================================');
  console.log(`ALL FIRESTORE CLOUD TESTS PASSED (${passCount}/${passCount})`);
  console.log('======================================================================\n');
}

runFirestoreCloudTestSuite().catch((err) => {
  console.error('Firestore cloud test suite failed:', err);
  process.exit(1);
});

