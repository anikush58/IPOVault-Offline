type ApplicationStatus = 'Applied' | 'Allotted' | 'Partially Allotted' | 'Not Allotted' | 'Holding' | 'Sold' | 'Mandate Approved';

interface MockApplicationRecord {
  id: string;
  user_id: string;
  ipo_id: string;
  status: ApplicationStatus;
  sell_price: number | null;
  sale_date: string | null;
  tax: number;
  user_cut: number;
  shares_count: number | null;
  quantity?: number | null;
  is_favorite: number;
  bank_name: string;
  upi_app: string;
  broker_account_id: string | null;
  created_at: string;
  updated_at: string;
}

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

/**
 * DBContext.exportJSON applications serialization matching context/DBContext.tsx
 */
function serializeApplicationsForExport(applications: MockApplicationRecord[]) {
  return applications.map((a) => ({
    id: a.id,
    user_id: a.user_id,
    ipo_id: a.ipo_id,
    status: a.status,
    sell_price: a.sell_price ?? null,
    sale_date: a.sale_date ?? null,
    shares_count: (a as any).shares_count ?? a.quantity ?? null,
    quantity: a.quantity ?? (a as any).shares_count ?? null,
    tax: a.tax,
    user_cut: a.user_cut,
    is_favorite: a.is_favorite ?? 0,
    bank_name: (a as any).bank_name ?? '',
    upi_app: (a as any).upi_app ?? '',
    broker_account_id: a.broker_account_id ?? null,
    created_at: a.created_at,
    updated_at: a.updated_at,
  }));
}

/**
 * Simulates SQLite hydration on restore / sync as implemented in DBContext.importCriticalData and firestoreSyncService
 */
function simulateRestoreHydration(
  cloudApp: any,
  existingLocalApp?: MockApplicationRecord | null
): MockApplicationRecord {
  // Last-Write-Wins check (as in applyCriticalDeltaToSQLite)
  if (existingLocalApp?.updated_at && cloudApp.updated_at && existingLocalApp.updated_at > cloudApp.updated_at) {
    return existingLocalApp; // Preserve newer local data
  }

  if (existingLocalApp) {
    // DBContext.importCriticalData update branch
    return {
      ...existingLocalApp,
      status: cloudApp.status || existingLocalApp.status,
      shares_count: cloudApp.shares_count ?? existingLocalApp.shares_count,
      sell_price: cloudApp.sell_price !== undefined && cloudApp.sell_price !== null ? cloudApp.sell_price : existingLocalApp.sell_price,
      sale_date: cloudApp.sale_date !== undefined && cloudApp.sale_date !== null && cloudApp.sale_date !== '' ? cloudApp.sale_date : existingLocalApp.sale_date,
      tax: cloudApp.tax !== undefined ? cloudApp.tax : existingLocalApp.tax,
      user_cut: cloudApp.user_cut !== undefined ? cloudApp.user_cut : existingLocalApp.user_cut,
      is_favorite: cloudApp.is_favorite !== undefined ? cloudApp.is_favorite : existingLocalApp.is_favorite,
      bank_name: cloudApp.bank_name || existingLocalApp.bank_name,
      upi_app: cloudApp.upi_app || existingLocalApp.upi_app,
      broker_account_id: cloudApp.broker_account_id || existingLocalApp.broker_account_id,
      updated_at: cloudApp.updated_at || new Date().toISOString(),
    };
  }

  // DBContext.importCriticalData insert branch
  return {
    id: cloudApp.id,
    user_id: cloudApp.user_id,
    ipo_id: cloudApp.ipo_id,
    status: cloudApp.status || 'Applied',
    shares_count: cloudApp.shares_count ?? cloudApp.quantity ?? null,
    quantity: cloudApp.quantity ?? cloudApp.shares_count ?? null,
    sell_price: cloudApp.sell_price ?? null,
    sale_date: cloudApp.sale_date ?? null,
    tax: cloudApp.tax ?? 0,
    user_cut: cloudApp.user_cut ?? 0,
    is_favorite: cloudApp.is_favorite ?? 0,
    bank_name: cloudApp.bank_name || '',
    upi_app: cloudApp.upi_app || '',
    broker_account_id: cloudApp.broker_account_id ?? null,
    created_at: cloudApp.created_at || new Date().toISOString(),
    updated_at: cloudApp.updated_at || new Date().toISOString(),
  };
}

async function runHoldingPriceComprehensiveTests() {
  console.log('======================================================================');
  console.log('RUNNING COMPREHENSIVE HOLDING PRICE & SALE DATA RESTORE TEST SUITE');
  console.log('======================================================================\n');

  // TEST 1: Holding Application Price Edit & Sync Persistence
  const holdingApp: MockApplicationRecord = {
    id: 'app-holding-001',
    user_id: 'usr-1',
    ipo_id: 'ipo-1',
    status: 'Holding',
    sell_price: 1540.25, // Edited holding price
    sale_date: null,
    tax: 0,
    user_cut: 0,
    shares_count: 50,
    quantity: 50,
    is_favorite: 1,
    bank_name: 'HDFC Bank',
    upi_app: 'GPay',
    broker_account_id: 'broker-acc-123',
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-09T14:30:00.000Z',
  };

  const exportedHolding = serializeApplicationsForExport([holdingApp])[0];
  assert(exportedHolding.sell_price === 1540.25, 'TEST 1A', 'exportJSON includes holding sell_price (1540.25)');
  assert(exportedHolding.sale_date === null, 'TEST 1B', 'exportJSON includes explicit null sale_date for holding');

  const restoredHoldingFresh = simulateRestoreHydration(exportedHolding, null);
  assert(restoredHoldingFresh.sell_price === 1540.25, 'TEST 1C', 'Fresh restore restores holding price (1540.25)');
  assert(restoredHoldingFresh.status === 'Holding', 'TEST 1D', 'Holding status preserved');
  assert(restoredHoldingFresh.broker_account_id === 'broker-acc-123', 'TEST 1E', 'Broker account linkage preserved');

  // TEST 2: Sold Application Sale Price & Sale Date Persistence
  const soldApp: MockApplicationRecord = {
    id: 'app-sold-002',
    user_id: 'usr-1',
    ipo_id: 'ipo-2',
    status: 'Sold',
    sell_price: 2450.00,
    sale_date: '2026-10-08',
    tax: 150.00,
    user_cut: 75.00,
    shares_count: 100,
    quantity: 100,
    is_favorite: 0,
    bank_name: 'ICICI Bank',
    upi_app: 'PhonePe',
    broker_account_id: 'broker-acc-456',
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-08T16:00:00.000Z',
  };

  const exportedSold = serializeApplicationsForExport([soldApp])[0];
  assert(exportedSold.sell_price === 2450.00, 'TEST 2A', 'exportJSON includes sold sell_price (2450.00)');
  assert(exportedSold.sale_date === '2026-10-08', 'TEST 2B', 'exportJSON includes sale_date (2026-10-08)');
  assert(exportedSold.tax === 150.00 && exportedSold.user_cut === 75.00, 'TEST 2C', 'exportJSON includes tax & user_cut');

  const restoredSold = simulateRestoreHydration(exportedSold, null);
  assert(restoredSold.sell_price === 2450.00, 'TEST 2D', 'Restored sold application retains sell_price');
  assert(restoredSold.sale_date === '2026-10-08', 'TEST 2E', 'Restored sold application retains sale_date');

  // TEST 3: Applied / Unallotted Application with Explicit Nulls
  const appliedApp: MockApplicationRecord = {
    id: 'app-applied-003',
    user_id: 'usr-2',
    ipo_id: 'ipo-3',
    status: 'Applied',
    sell_price: null,
    sale_date: null,
    tax: 0,
    user_cut: 0,
    shares_count: 30,
    quantity: 30,
    is_favorite: 0,
    bank_name: 'SBI',
    upi_app: 'Paytm',
    broker_account_id: null,
    created_at: '2026-10-09T08:00:00.000Z',
    updated_at: '2026-10-09T08:00:00.000Z',
  };

  const exportedApplied = serializeApplicationsForExport([appliedApp])[0];
  assert(exportedApplied.sell_price === null, 'TEST 3A', 'Explicit null sell_price maintained in export');
  assert(exportedApplied.sale_date === null, 'TEST 3B', 'Explicit null sale_date maintained in export');
  const restoredApplied = simulateRestoreHydration(exportedApplied, null);
  assert(restoredApplied.sell_price === null, 'TEST 3C', 'Restored application maintains null sell_price');

  // TEST 4: Timestamp Conflict Resolution (Local newer update NOT overwritten by older cloud snapshot)
  const localNewerApp: MockApplicationRecord = {
    ...holdingApp,
    sell_price: 1800.00, // Newer local edit on this device
    updated_at: '2026-10-09T16:00:00.000Z',
  };
  const olderCloudApp = {
    ...holdingApp,
    sell_price: 1540.25, // Older snapshot in cloud
    updated_at: '2026-10-09T14:30:00.000Z',
  };

  const conflictResolved = simulateRestoreHydration(olderCloudApp, localNewerApp);
  assert(
    conflictResolved.sell_price === 1800.00,
    'TEST 4',
    'Last-Write-Wins preserves newer local holding price (1800.00) against older cloud snapshot (1540.25)'
  );

  console.log('\n======================================================================');
  console.log(`ALL TESTS PASSED: ${passCount} / ${passCount + failCount}`);
  console.log('======================================================================\n');
}

runHoldingPriceComprehensiveTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
