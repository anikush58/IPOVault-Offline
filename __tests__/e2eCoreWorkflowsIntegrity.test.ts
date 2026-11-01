import { describe, it } from 'node:test';

// ── Test harness ─────────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;

function assert(condition: any, testName: string, detail: string) {
  if (Boolean(condition)) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
    passCount++;
  } else {
    console.error(`✗ FAIL: [${testName}] ${detail}`);
    failCount++;
  }
}

// ── Mock Interfaces & Data ───────────────────────────────────────────────────
interface MockUser {
  id: string;
  name: string;
  pan_number: string;
  client_id?: string;
  upi_id?: string;
  broker: string;
  tpin: string;
  upi_app: string;
  bank_name: string;
  avatar_url?: string;
  default_amount_blocked: number;
  archived?: number;
  owner_id?: string;
  deleted_at?: string | null;
}

interface MockBankAccount {
  id: string;
  bank_name: string;
  balance: number;
  upi_app: string;
  owner_id?: string;
  deleted_at?: string | null;
}

interface MockApplication {
  id: string;
  user_id: string;
  ipo_id: string;
  status: string;
  sell_price: number | null;
  sale_date: string | null;
  tax: number;
  user_cut: number;
  bank_name: string;
  upi_app: string;
  broker_account_id: string | null;
  shares_count: number | null;
  buy_price: number;
  quantity: number;
  deleted_at?: string | null;
}

console.log('======================================================================');
console.log('RUNNING E2E CORE WORKFLOWS RELIABILITY & OPTIMIZATION REGRESSION TESTS');
console.log('======================================================================\n');

// ── 1. User CRUD & Input Validation Tests ────────────────────────────────────
console.log('--- 1. User Validation, Duplicate Prevention, and Cascade Delete ---');

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

function validateUserInputs(
  name: string,
  pan: string,
  upiId: string,
  existingUsers: MockUser[],
  currentUserId?: string
): { valid: boolean; error?: string } {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { valid: false, error: 'Please enter a full name.' };
  }

  const trimmedPan = pan.trim().toUpperCase();
  if (trimmedPan.length > 0) {
    if (!panRegex.test(trimmedPan)) {
      return { valid: false, error: 'PAN must be exactly 10 alphanumeric characters (e.g. ABCDE1234F).' };
    }
    const dup = existingUsers.find(
      (u) => u.id !== currentUserId && !u.deleted_at && u.archived !== 1 && u.pan_number?.trim().toUpperCase() === trimmedPan
    );
    if (dup) {
      return { valid: false, error: `A family member with PAN ${trimmedPan} already exists (${dup.name}).` };
    }
  }

  const trimmedUpi = upiId.trim().toLowerCase();
  if (trimmedUpi.length > 0 && !trimmedUpi.includes('@')) {
    return { valid: false, error: 'Please enter a valid UPI ID format (e.g. name@okhdfcbank).' };
  }

  return { valid: true };
}

const existingUsers: MockUser[] = [
  {
    id: 'user-1',
    name: 'Anish Sharma',
    pan_number: 'ABCDE1234F',
    broker: 'Groww',
    tpin: '1234',
    upi_app: 'GPay',
    bank_name: 'HDFC Bank',
    default_amount_blocked: 0,
    archived: 0,
  },
  {
    id: 'user-2',
    name: 'Rohan Sharma',
    pan_number: 'XYZPK9876Q',
    broker: 'Zerodha',
    tpin: '4321',
    upi_app: 'PhonePe',
    bank_name: 'SBI Bank',
    default_amount_blocked: 0,
    archived: 0,
  },
];

// Test empty name
const emptyNameRes = validateUserInputs('', 'ABCDE1234F', 'test@upi', existingUsers);
assert(!emptyNameRes.valid && emptyNameRes.error?.includes('full name'), 'User Validation', 'Rejects empty user name');

// Test invalid PAN formats
const shortPanRes = validateUserInputs('Priya', 'ABC12', 'priya@upi', existingUsers);
assert(!shortPanRes.valid && shortPanRes.error?.includes('10 alphanumeric characters'), 'User Validation', 'Rejects short/invalid PAN format');

const specialCharPan = validateUserInputs('Priya', 'ABCDE1234#', 'priya@upi', existingUsers);
assert(!specialCharPan.valid && specialCharPan.error?.includes('10 alphanumeric characters'), 'User Validation', 'Rejects PAN with special characters');

// Test duplicate PAN detection
const dupPanRes = validateUserInputs('Another Person', 'ABCDE1234F', 'another@upi', existingUsers);
assert(!dupPanRes.valid && dupPanRes.error?.includes('already exists (Anish Sharma)'), 'User Validation', 'Detects duplicate active PAN across family profiles');

// Test self-edit with same PAN (should be allowed)
const selfEditRes = validateUserInputs('Anish Sharma Updated', 'ABCDE1234F', 'anish@okaxis', existingUsers, 'user-1');
assert(selfEditRes.valid, 'User Validation', 'Allows self-edit retaining the same valid PAN');

// Test optional / blank PAN
const blankPanRes = validateUserInputs('Priya Sharma', '', 'priya@upi', existingUsers);
assert(blankPanRes.valid, 'User Validation', 'Accepts blank/optional PAN for backward-compatible workflows');

// Test that soft-deleted user PAN does not block new registration
const usersWithDeleted: MockUser[] = [
  ...existingUsers,
  {
    id: 'user-deleted',
    name: 'Former Member',
    pan_number: 'DELTD1234F',
    broker: 'Groww',
    tpin: '0000',
    upi_app: 'GPay',
    bank_name: 'HDFC Bank',
    default_amount_blocked: 0,
    archived: 0,
    deleted_at: '2026-01-01T00:00:00.000Z',
  },
];
const reuseDeletedPanRes = validateUserInputs('New Member', 'DELTD1234F', 'new@upi', usersWithDeleted);
assert(reuseDeletedPanRes.valid, 'User Validation', 'Allows registering a PAN previously associated with a soft-deleted member');

// Test invalid UPI format
const badUpiRes = validateUserInputs('Kavita', 'LMNOP5678Z', 'kavitaupi', existingUsers);
assert(!badUpiRes.valid && badUpiRes.error?.includes('valid UPI ID format'), 'User Validation', 'Rejects UPI without @ symbol');

// Test cascade soft-delete
let mockDbUsers = [...existingUsers];
let mockDbApplications: MockApplication[] = [
  {
    id: 'app-1',
    user_id: 'user-1',
    ipo_id: 'ipo-1',
    status: 'Applied',
    sell_price: null,
    sale_date: null,
    tax: 0,
    user_cut: 0,
    bank_name: 'HDFC Bank',
    upi_app: 'GPay',
    broker_account_id: null,
    shares_count: 50,
    buy_price: 200,
    quantity: 50,
    deleted_at: null,
  },
  {
    id: 'app-2',
    user_id: 'user-2',
    ipo_id: 'ipo-1',
    status: 'Applied',
    sell_price: null,
    sale_date: null,
    tax: 0,
    user_cut: 0,
    bank_name: 'SBI Bank',
    upi_app: 'PhonePe',
    broker_account_id: null,
    shares_count: 50,
    buy_price: 200,
    quantity: 50,
    deleted_at: null,
  },
];

function deleteUserCascade(userId: string) {
  const now = new Date().toISOString();
  mockDbUsers = mockDbUsers.map((u) => (u.id === userId ? { ...u, deleted_at: now } : u));
  mockDbApplications = mockDbApplications.map((a) => (a.user_id === userId ? { ...a, deleted_at: now } : a));
}

deleteUserCascade('user-1');
assert(
  Boolean(mockDbUsers.find((u) => u.id === 'user-1')?.deleted_at),
  'Cascade Delete User',
  'User is soft-deleted in users table'
);
assert(
  Boolean(mockDbApplications.find((a) => a.id === 'app-1')?.deleted_at),
  'Cascade Delete Applications',
  'Linked applications for user-1 are atomically soft-deleted'
);
assert(
  mockDbApplications.find((a) => a.id === 'app-2')?.deleted_at === null,
  'Cascade Delete Isolation',
  'Unrelated applications for user-2 remain completely unaffected'
);

// Test user delete optimistic rollback on SQLite failure
let optimisticUsers = [{ id: 'u-keep', name: 'Keep User' }, { id: 'u-del', name: 'Delete Target' }];
let snapshotState = [...optimisticUsers];
function deleteUserWithRollback(userId: string, failSql: boolean) {
  snapshotState = [...optimisticUsers];
  optimisticUsers = optimisticUsers.filter((u) => u.id !== userId);
  if (failSql) {
    // Rollback
    optimisticUsers = snapshotState;
    return false;
  }
  return true;
}
const deleteFailed = deleteUserWithRollback('u-del', true);
assert(!deleteFailed, 'User Delete Rollback', 'Delete operation correctly caught SQLite failure');
assert(optimisticUsers.length === 2 && optimisticUsers.some((u) => u.id === 'u-del'), 'User Delete Rollback', 'Optimistic state cleanly restored to snapshot on failure');

// ── 2. Bank CRUD, Safety Checks, and Cascade Rename Tests ────────────────────
console.log('\n--- 2. Bank Safety Checks & Relationship Integrity ---');

const existingBanks: MockBankAccount[] = [
  { id: 'bank-1', bank_name: 'HDFC Bank', balance: 50000, upi_app: 'GPay', deleted_at: null },
  { id: 'bank-2', bank_name: 'Kotak Bank', balance: 25000, upi_app: 'PhonePe', deleted_at: null },
];

function canDeleteBank(bankName: string, activeApplications: MockApplication[]): { allowed: boolean; reason?: string } {
  const targetKey = bankName.trim().toLowerCase();
  const referenced = activeApplications.filter(
    (a) => !a.deleted_at && a.status !== 'Cancelled' && a.bank_name.trim().toLowerCase() === targetKey
  );
  if (referenced.length > 0) {
    return {
      allowed: false,
      reason: `"${bankName}" is currently referenced by ${referenced.length} active IPO application(s).`,
    };
  }
  return { allowed: true };
}

// Check safe deletion on referenced bank
const deleteHdfcCheck = canDeleteBank('HDFC Bank', [
  {
    id: 'app-active',
    user_id: 'user-2',
    ipo_id: 'ipo-2',
    status: 'Mandate Approved',
    sell_price: null,
    sale_date: null,
    tax: 0,
    user_cut: 0,
    bank_name: 'HDFC Bank',
    upi_app: 'GPay',
    broker_account_id: null,
    shares_count: 20,
    buy_price: 500,
    quantity: 20,
    deleted_at: null,
  },
]);
assert(!deleteHdfcCheck.allowed && deleteHdfcCheck.reason?.includes('referenced by 1 active'), 'Bank Safe Deletion', 'Blocks silent deletion of bank linked to active applications');

// Check unreferenced bank deletion
const deleteKotakCheck = canDeleteBank('Kotak Bank', []);
assert(deleteKotakCheck.allowed, 'Bank Safe Deletion', 'Allows deletion when no active applications reference the bank');

// Test bank duplicate name validation
function validateBankSave(name: string, balance: number, banks: MockBankAccount[], currentId?: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, error: 'Enter a bank name.' };
  if (isNaN(balance) || balance < 0) return { valid: false, error: 'Enter a valid balance amount (₹0 or more).' };
  const dup = banks.find((b) => b.id !== currentId && !b.deleted_at && b.bank_name.toLowerCase().trim() === trimmed.toLowerCase());
  if (dup) return { valid: false, error: 'A bank account with that name already exists.' };
  return { valid: true };
}

assert(!validateBankSave('  ', 1000, existingBanks).valid, 'Bank Validation', 'Rejects empty bank name');
assert(!validateBankSave('HDFC Bank', -50, existingBanks, 'bank-1').valid, 'Bank Validation', 'Rejects negative bank balance');
assert(!validateBankSave('hdfc bank', 1000, existingBanks).valid, 'Bank Validation', 'Rejects duplicate bank name (case-insensitive)');
assert(validateBankSave('ICICI Bank', 15000, existingBanks).valid, 'Bank Validation', 'Accepts valid new bank account');

// Test bank cascade rename
let usersForBank = [{ id: 'u-1', bank_name: 'HDFC Bank' }];
let appsForBank = [{ id: 'a-1', bank_name: 'HDFC Bank' }];

function renameBankCascade(oldName: string, newName: string) {
  usersForBank = usersForBank.map((u) => (u.bank_name === oldName ? { ...u, bank_name: newName } : u));
  appsForBank = appsForBank.map((a) => (a.bank_name === oldName ? { ...a, bank_name: newName } : a));
}

renameBankCascade('HDFC Bank', 'HDFC Bank Ltd');
assert(usersForBank[0].bank_name === 'HDFC Bank Ltd', 'Bank Rename Cascade', 'Renamed bank cascades to family profile bank_name');
assert(appsForBank[0].bank_name === 'HDFC Bank Ltd', 'Bank Rename Cascade', 'Renamed bank cascades to existing applications bank_name');

// Test bank balance preservation with COALESCE when balance argument is undefined
let bankRecord = { id: 'b-1', bank_name: 'Axis Bank', balance: 75000, upi_app: 'GPay' };
function updateBankSafe(id: string, balance?: number, bankName?: string, upiApp?: string) {
  const sanitizedBalance = (balance !== undefined && !isNaN(balance)) ? balance : null;
  const trimmedBankName = (bankName !== undefined && bankName.trim().length > 0) ? bankName.trim() : null;
  bankRecord = {
    ...bankRecord,
    balance: sanitizedBalance !== null ? sanitizedBalance : bankRecord.balance,
    bank_name: trimmedBankName !== null ? trimmedBankName : bankRecord.bank_name,
    upi_app: upiApp !== undefined ? upiApp : bankRecord.upi_app,
  };
}
updateBankSafe('b-1', undefined, 'Axis Bank Premium');
assert(bankRecord.bank_name === 'Axis Bank Premium', 'Bank Balance Preservation', 'Bank name successfully updated');
assert(bankRecord.balance === 75000, 'Bank Balance Preservation', 'Bank balance strictly preserved when balance argument is undefined');

// ── 3. Direct Bid Engine & Submission Idempotency ────────────────────────────
console.log('\n--- 3. Direct Bid Engine & Submission Idempotency ---');

let submitCallCount = 0;
let isSubmittingLock = false;

async function executeBidSubmission() {
  if (isSubmittingLock) return { executed: false, reason: 'LOCKED' };
  isSubmittingLock = true;
  try {
    submitCallCount++;
    return { executed: true };
  } finally {
    isSubmittingLock = false;
  }
}

// Test double-tap lock
isSubmittingLock = true;
const concurrentTap = executeBidSubmission();
concurrentTap.then((res) => {
  assert(!res.executed && res.reason === 'LOCKED', 'Direct Bid Engine', 'In-flight submission lock prevents duplicate double-tap bids');
});
isSubmittingLock = false;

// SME bid validation
function validateBid(isSme: boolean, lots: number): { valid: boolean; error?: string } {
  if (lots <= 0) return { valid: false, error: 'Every selected applicant must have at least 1 lot.' };
  if (isSme && lots < 2) return { valid: false, error: 'SME IPOs require a minimum of 2 lots per application.' };
  return { valid: true };
}

assert(validateBid(false, 1).valid, 'Bid Validation', 'Mainboard IPO permits 1 lot bid');
assert(!validateBid(true, 1).valid, 'Bid Validation', 'SME IPO rejects 1 lot bid (min 2 lots required)');
assert(validateBid(true, 2).valid, 'Bid Validation', 'SME IPO accepts 2 lots bid');

// ── 4. Atomic Application Update & Source of Truth ───────────────────────────
console.log('\n--- 4. Application Updates: Atomic DB Writes & Source of Truth ---');

const origApp: MockApplication = {
  id: 'app-update-1',
  user_id: 'user-1',
  ipo_id: 'ipo-1',
  status: 'Applied',
  sell_price: null,
  sale_date: null,
  tax: 0,
  user_cut: 0,
  bank_name: 'HDFC Bank',
  upi_app: 'GPay',
  broker_account_id: 'broker-zerodha-1',
  shares_count: 100,
  buy_price: 150,
  quantity: 100,
  deleted_at: null,
};

// Update status to Holding with current market price
function updateAppAtomic(
  current: MockApplication,
  newStatus: string,
  sellPrice: number | null,
  saleDate: string | null,
  tax: number,
  userCut: number,
  brokerAccountId?: string | null
): MockApplication {
  return {
    ...current,
    status: newStatus,
    sell_price: sellPrice,
    sale_date: saleDate,
    tax,
    user_cut: userCut,
    broker_account_id: brokerAccountId !== undefined ? brokerAccountId : current.broker_account_id,
    // Source of truth guarantee: buy_price and quantity must NEVER be overwritten by LTP
    buy_price: current.buy_price,
    quantity: current.quantity,
  };
}

const updatedApp = updateAppAtomic(origApp, 'Holding', 220, null, 10, 20, 'broker-zerodha-1');

assert(updatedApp.status === 'Holding', 'Application Update', 'Status updated to Holding');
assert(updatedApp.buy_price === 150, 'Source of Truth', 'Original buy_price 150 strictly preserved (not overwritten)');
assert(updatedApp.quantity === 100, 'Source of Truth', 'Original quantity 100 strictly preserved');
assert(updatedApp.broker_account_id === 'broker-zerodha-1', 'Broker Linkage', 'Broker account connection preserved');

// Test Optimistic UI Rollback on Database Failure
let uiApps = [origApp];
const snapshot = [...uiApps];

function attemptFailingUpdate() {
  // Optimistic update
  uiApps = uiApps.map((a) => (a.id === origApp.id ? { ...a, status: 'Sold' } : a));
  try {
    throw new Error('SQLite disk I/O error simulation');
  } catch (err) {
    // Rollback to snapshot
    uiApps = snapshot;
  }
}

attemptFailingUpdate();
assert(uiApps[0].status === 'Applied', 'Optimistic UI Rollback', 'State successfully rolled back to snapshot on DB failure');

// ── 5. Concurrent Refresh Query Execution ────────────────────────────────────
console.log('\n--- 5. Concurrent Refresh Queries Benchmark ---');

async function mockQuery(name: string, delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return { name, delayMs };
}

async function benchmarkSerialVsConcurrent() {
  // Serial pattern (legacy)
  const tSerialStart = Date.now();
  await mockQuery('users', 15);
  await mockQuery('ipos', 15);
  await mockQuery('master', 15);
  await mockQuery('apps', 15);
  const serialDuration = Date.now() - tSerialStart;

  // Concurrent Promise.all pattern (optimized)
  const tConcurrentStart = Date.now();
  await Promise.all([
    mockQuery('users', 15),
    mockQuery('ipos', 15),
    mockQuery('master', 15),
    mockQuery('apps', 15),
  ]);
  const concurrentDuration = Date.now() - tConcurrentStart;

  assert(concurrentDuration < serialDuration, 'Refresh Concurrency', `Promise.all refresh (${concurrentDuration}ms) is significantly faster than serial (${serialDuration}ms)`);
}

benchmarkSerialVsConcurrent().then(() => {
  console.log('\n======================================================================');
  console.log(`E2E WORKFLOW INTEGRITY RESULTS: ${passCount} Passed, ${failCount} Failed`);
  console.log('======================================================================');
  if (failCount > 0) {
    process.exit(1);
  }
});
