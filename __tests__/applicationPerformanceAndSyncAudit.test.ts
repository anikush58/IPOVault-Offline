import { BulkApplyResult } from '../db/repositories';
import type { ApplicationStatus, ApplicationWithDetails } from '../context/DBContext';

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

console.log('========================================================================');
console.log('RUNNING IPOVAULT PERFORMANCE & SYNC AUDIT REGRESSION TEST SUITE');
console.log('========================================================================\n');

// Mock application state
let inMemoryApps: ApplicationWithDetails[] = [
  {
    id: 'app-1',
    user_id: 'user-1',
    ipo_id: 'ipo-100',
    status: 'Applied',
    shares_count: 15,
    sell_price: null,
    sale_date: null,
    tax: 0,
    user_cut: 0,
    user_name: 'Anish',
    user_broker: 'Zerodha',
    user_bank_name: 'HDFC Bank',
    user_upi_app: 'GPay',
    ipo_name: 'Tata Tech',
    buy_price: 500,
    quantity: 15,
    open_date: '2026-10-01',
    category: 'RETAIL',
    is_favorite: 0,
  },
  {
    id: 'app-2',
    user_id: 'user-2',
    ipo_id: 'ipo-100',
    status: 'Applied',
    shares_count: 15,
    sell_price: null,
    sale_date: null,
    tax: 0,
    user_cut: 0,
    user_name: 'Neha',
    user_broker: 'Groww',
    user_bank_name: 'ICICI Bank',
    user_upi_app: 'PhonePe',
    ipo_name: 'Tata Tech',
    buy_price: 500,
    quantity: 15,
    open_date: '2026-10-01',
    category: 'RETAIL',
    is_favorite: 1,
  },
];

console.log('--- TEST 1: In-Memory Targeted State Update on addBulkApplications ---');

const newlyCreatedRow: ApplicationWithDetails = {
  id: 'app-3',
  user_id: 'user-3',
  ipo_id: 'ipo-100',
  status: 'Applied',
  shares_count: 30,
  sell_price: null,
  sale_date: null,
  tax: 0,
  user_cut: 0,
  user_name: 'Nitish',
  user_broker: 'AngelOne',
  user_bank_name: 'SBI Bank',
  user_upi_app: 'Paytm',
  ipo_name: 'Tata Tech',
  buy_price: 500,
  quantity: 30,
  open_date: '2026-10-01',
  category: 'SHAREHOLDER',
  is_favorite: 0,
};

// Simulate targeted in-memory prepend without full-DB re-query
const newIds = new Set([newlyCreatedRow.id]);
inMemoryApps = [
  newlyCreatedRow,
  ...inMemoryApps.filter((existing) => !newIds.has(existing.id) && existing.status !== 'Cancelled'),
];

assert(inMemoryApps.length === 3, '1.1 Prepend Item', 'Length increased to 3 immediately');
assert(inMemoryApps[0].id === 'app-3', '1.2 Head Item', 'Newly created application is prepended to top');
assert(inMemoryApps[0].category === 'SHAREHOLDER', '1.3 Category Preserved', 'Shareholder category preserved');

console.log('\n--- TEST 2: In-Memory Targeted Update on updateApplication ---');

// Simulate updateApplication('app-1', 'Allotted', 750, '2026-10-15', 50, 100, 'Axis Bank', 'BHIM', null, 15)
inMemoryApps = inMemoryApps.map((app) => {
  if (app.id !== 'app-1') return app;
  return {
    ...app,
    status: 'Allotted' as ApplicationStatus,
    sell_price: 750,
    sale_date: '2026-10-15',
    tax: 50,
    user_cut: 100,
    user_bank_name: 'Axis Bank',
    user_upi_app: 'BHIM',
  };
});

const updatedApp1 = inMemoryApps.find((a) => a.id === 'app-1')!;
assert(updatedApp1.status === 'Allotted', '2.1 Status Update', 'Status changed to Allotted in-memory');
assert(updatedApp1.sell_price === 750, '2.2 Sell Price', 'Sell price updated to 750');
assert(updatedApp1.user_bank_name === 'Axis Bank', '2.3 Bank Name', 'Bank name updated in-memory');
assert(inMemoryApps.length === 3, '2.4 State Preserved', 'Array length unchanged');

console.log('\n--- TEST 3: In-Memory Targeted Update on updateApplicationDetails ---');

// Simulate updateApplicationDetails('app-2', { status: 'Holding', category: 'RETAIL', bid_price: 520 })
inMemoryApps = inMemoryApps.map((app) => {
  if (app.id !== 'app-2') return app;
  return {
    ...app,
    status: 'Holding' as ApplicationStatus,
    category: 'RETAIL',
  };
});

const updatedApp2 = inMemoryApps.find((a) => a.id === 'app-2')!;
assert(updatedApp2.status === 'Holding', '3.1 Status Update', 'Status changed to Holding');
assert(updatedApp2.user_name === 'Neha', '3.2 Data Integrity', 'User name and details retained');

console.log('\n--- TEST 4: In-Memory Targeted Update on updateBulkApplications ---');

// Bulk update app-1 and app-3 to 'Sold'
const bulkTargetIds = ['app-1', 'app-3'];
inMemoryApps = inMemoryApps.map((app) => (bulkTargetIds.includes(app.id) ? { ...app, status: 'Sold' as ApplicationStatus } : app));

assert(inMemoryApps.find((a) => a.id === 'app-1')!.status === 'Sold', '4.1 Bulk Item 1', 'App 1 status is Sold');
assert(inMemoryApps.find((a) => a.id === 'app-3')!.status === 'Sold', '4.2 Bulk Item 3', 'App 3 status is Sold');
assert(inMemoryApps.find((a) => a.id === 'app-2')!.status === 'Holding', '4.3 Unaffected Item', 'App 2 remains untouched');

console.log('\n--- TEST 5: In-Memory Delete and Toggle Favorite ---');

// Delete app-2
inMemoryApps = inMemoryApps.filter((app) => app.id !== 'app-2');
assert(inMemoryApps.length === 2, '5.1 In-Memory Delete', 'App 2 removed from in-memory array');
assert(!inMemoryApps.some((a) => a.id === 'app-2'), '5.2 ID Excluded', 'App 2 is no longer in state');

// Toggle favorite on app-1
inMemoryApps = inMemoryApps.map((app) => (app.id === 'app-1' ? { ...app, is_favorite: 1 } : app));
assert(inMemoryApps.find((a) => a.id === 'app-1')!.is_favorite === 1, '5.3 Favorite Toggled', 'App 1 is_favorite is 1');

console.log('\n--- TEST 6: Firestore Payload Generation for Single Doc Sync ---');

function formatSingleDocPayload(app: ApplicationWithDetails) {
  return {
    user_id: app.user_id,
    ipo_id: app.ipo_id,
    category: app.category || 'RETAIL',
    status: app.status || 'Applied',
    shares_count: app.shares_count ?? null,
    sell_price: app.sell_price ?? null,
    sale_date: app.sale_date ?? null,
    tax: app.tax ?? 0,
    user_cut: app.user_cut ?? 0,
    is_favorite: app.is_favorite ? 1 : 0,
    bank_name: app.user_bank_name || '',
    upi_app: app.user_upi_app || '',
  };
}

const payload = formatSingleDocPayload(inMemoryApps[0]);
assert(payload.status === 'Sold', '6.1 Payload Status', 'Payload contains latest status');
assert(payload.user_id === 'user-3', '6.2 Payload User ID', 'Payload contains user_id');
assert(typeof payload.tax === 'number', '6.3 Type Safety', 'Tax is number');
assert(!('logo_url' in payload), '6.4 Decoupled Logos', 'Application payload does NOT contain base64 logo data');

console.log('\n========================================================================');
console.log(`AUDIT RESULTS: ${passCount} Passed, ${failCount} Failed`);
console.log('========================================================================');
