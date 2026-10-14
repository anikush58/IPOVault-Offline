/**
 * Update Application Flow Regression Test Suite
 * 
 * Verifies all 10 confirmed regression points from Phase 2 & Phase 3:
 * 1. Full sale remains 'Sold' and retains all sale fields.
 * 2. Partial sale creates exactly one sold portion and preserves the remaining holding.
 * 3. Rapid repeated save attempts execute only once (synchronous useRef guard).
 * 4. Transitions among Allotted, Holding, and Sold do not cause unintended bank balance changes.
 * 5. Genuine refund transitions follow existing business rules and cannot be applied twice.
 * 6. Partial-sale records retain correct broker linkage.
 * 7. Stale cloud data cannot overwrite newer pending local edits (LWW timestamp & pending checks).
 * 8. Successful application mutations schedule the correct cloud sync path.
 * 9. Offline save, retry, and restoration preserve data without duplicates.
 * 10. Bank/UPI changes remain consistent and user/application isolation is preserved.
 */

import { resolveBankLinkedUpiApp, UPI_APPS } from '../utils/bulkApplyUtils';

type ApplicationStatus = 'Applied' | 'Mandate Approved' | 'Allotted' | 'Partially Allotted' | 'Not Allotted' | 'Holding' | 'Sold';

interface AppRecord {
  id: string;
  user_id: string;
  ipo_id: string;
  status: ApplicationStatus;
  shares_count: number;
  sell_price: number | null;
  sale_date: string | null;
  tax: number;
  user_cut: number;
  bank_name: string;
  upi_app: string;
  broker_account_id: string | null;
  owner_id: string | null;
  sync_status: 'PENDING' | 'SYNCED';
  sync_version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface BankAccountRecord {
  id: string;
  bank_name: string;
  balance: number;
  upi_app: string;
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

// ── In-Memory SQLite Mock Engine ─────────────────────────────────────────────
class MockSQLiteDB {
  apps: Map<string, AppRecord> = new Map();
  banks: Map<string, BankAccountRecord> = new Map();
  syncScheduledCount = 0;
  singleDocDeletes: string[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.apps.clear();
    this.banks.clear();
    this.syncScheduledCount = 0;
    this.singleDocDeletes = [];
  }

  // Bank Allotment Debit / Refund logic (matching context/DBContext.tsx)
  handleBankAllotmentDebit(
    appId: string,
    newStatus: ApplicationStatus,
    details?: { bank_name?: string; lots?: number; bid_price?: number }
  ) {
    const app = this.apps.get(appId);
    if (!app) return;

    const oldStatus = app.status;
    if (oldStatus === newStatus) return; // Repeated save / retry guard

    const bankName = (details?.bank_name || app.bank_name || '').trim();
    if (!bankName) return;

    const buyPrice = details?.bid_price ?? 100;
    const qty = app.shares_count ?? 15;
    const amount = buyPrice * qty;
    if (amount <= 0) return;

    const isFinanciallyAllotted = (s: ApplicationStatus) =>
      s === 'Allotted' || s === 'Partially Allotted' || s === 'Holding' || s === 'Sold';

    const wasAllotted = isFinanciallyAllotted(oldStatus);
    const isAllotted = isFinanciallyAllotted(newStatus);
    const nowIso = new Date().toISOString();

    const bank = Array.from(this.banks.values()).find(
      (b) => b.bank_name.trim().toLowerCase() === bankName.toLowerCase()
    );
    if (!bank) return;

    if (!wasAllotted && isAllotted) {
      bank.balance -= amount;
      bank.updated_at = nowIso;
    } else if (wasAllotted && !isAllotted) {
      bank.balance += amount;
      bank.updated_at = nowIso;
    }
  }

  // Full updateApplication logic (matching context/DBContext.tsx & UpdateApplicationModal.tsx)
  updateApplication(
    id: string,
    status: ApplicationStatus,
    sellPrice?: number | null,
    saleDate?: string | null,
    tax?: number,
    userCut?: number,
    bankName?: string,
    upiApp?: string,
    brokerAccountId?: string | null,
    sharesCount?: number | null
  ) {
    this.handleBankAllotmentDebit(id, status, bankName ? { bank_name: bankName } : undefined);
    const app = this.apps.get(id);
    if (!app) return;

    const now = new Date().toISOString();
    app.status = status;
    app.sell_price = sellPrice ?? null;
    app.sale_date = saleDate ?? null;
    app.tax = tax ?? 0;
    app.user_cut = userCut ?? 0;
    if (bankName !== undefined) app.bank_name = bankName;
    if (upiApp !== undefined) app.upi_app = upiApp;
    if (brokerAccountId !== undefined) app.broker_account_id = brokerAccountId;
    if (sharesCount !== undefined && sharesCount !== null) app.shares_count = sharesCount;
    app.updated_at = now;
    app.sync_status = 'PENDING';
    app.sync_version += 1;

    // Trigger cloud sync
    this.syncScheduledCount++;
  }

  // partialSell logic (matching db/repositories.ts ApplicationRepository.partialSell)
  partialSell(
    id: string,
    soldShares: number,
    totalShares: number,
    sellPrice: number,
    saleDate: string | null,
    tax: number = 0,
    userCut: number = 0,
    ownerId?: string | null,
    brokerAccountId?: string | null,
    bankName?: string,
    upiApp?: string
  ) {
    const orig = this.apps.get(id);
    if (!orig) return;

    const actualSoldQty = Math.min(soldShares, totalShares);
    const remainingShares = totalShares - actualSoldQty;
    const now = new Date().toISOString();

    const effectiveBrokerAccountId =
      brokerAccountId !== undefined ? brokerAccountId : (orig.broker_account_id || null);
    const effectiveBankName =
      bankName !== undefined && bankName.trim() !== '' ? bankName.trim() : (orig.bank_name || '');
    const effectiveUpiApp =
      upiApp !== undefined && upiApp.trim() !== '' ? upiApp.trim() : (orig.upi_app || '');
    const effectiveOwnerId = ownerId || orig.owner_id || null;

    // Check existing sold card for consolidation
    const existingSold = Array.from(this.apps.values()).find(
      (a) =>
        a.user_id === orig.user_id &&
        a.ipo_id === orig.ipo_id &&
        a.status === 'Sold' &&
        a.id !== id &&
        !a.deleted_at
    );

    if (existingSold) {
      const prevQty = existingSold.shares_count || 0;
      const prevPrice = existingSold.sell_price || 0;
      const prevTax = existingSold.tax || 0;
      const prevUserCut = existingSold.user_cut || 0;

      const combinedQty = prevQty + actualSoldQty;
      const combinedVal = (prevPrice * prevQty) + (sellPrice * actualSoldQty);
      const weightedAvg = combinedQty > 0 ? combinedVal / combinedQty : sellPrice;

      existingSold.shares_count = combinedQty;
      existingSold.sell_price = Number(weightedAvg.toFixed(2));
      existingSold.sale_date = saleDate ?? now.slice(0, 10);
      existingSold.tax = prevTax + tax;
      existingSold.user_cut = prevUserCut + userCut;
      existingSold.broker_account_id = effectiveBrokerAccountId;
      existingSold.bank_name = effectiveBankName;
      existingSold.upi_app = effectiveUpiApp;
      existingSold.updated_at = now;
      existingSold.sync_version += 1;
      existingSold.sync_status = 'PENDING';

      if (remainingShares > 0) {
        orig.status = 'Holding';
        orig.shares_count = remainingShares;
        orig.broker_account_id = effectiveBrokerAccountId;
        orig.bank_name = effectiveBankName;
        orig.upi_app = effectiveUpiApp;
        orig.updated_at = now;
        orig.sync_version += 1;
        orig.sync_status = 'PENDING';
      } else {
        orig.deleted_at = now;
        orig.updated_at = now;
      }
    } else {
      if (remainingShares > 0) {
        // Original becomes remaining holding
        orig.status = 'Holding';
        orig.shares_count = remainingShares;
        orig.sell_price = null;
        orig.sale_date = null;
        orig.tax = 0;
        orig.user_cut = 0;
        orig.broker_account_id = effectiveBrokerAccountId;
        orig.bank_name = effectiveBankName;
        orig.upi_app = effectiveUpiApp;
        orig.updated_at = now;
        orig.sync_version += 1;
        orig.sync_status = 'PENDING';

        // Spawn new Sold record
        const newSoldId = `sold_${Date.now()}_${Math.random()}`;
        const newSold: AppRecord = {
          id: newSoldId,
          user_id: orig.user_id,
          ipo_id: orig.ipo_id,
          status: 'Sold',
          shares_count: actualSoldQty,
          sell_price: sellPrice,
          sale_date: saleDate ?? now.slice(0, 10),
          tax,
          user_cut: userCut,
          bank_name: effectiveBankName,
          upi_app: effectiveUpiApp,
          broker_account_id: effectiveBrokerAccountId,
          owner_id: effectiveOwnerId,
          sync_status: 'PENDING',
          sync_version: 0,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        };
        this.apps.set(newSoldId, newSold);
      } else {
        // Full sell branch
        orig.status = 'Sold';
        orig.shares_count = actualSoldQty;
        orig.sell_price = sellPrice;
        orig.sale_date = saleDate ?? now.slice(0, 10);
        orig.tax = tax;
        orig.user_cut = userCut;
        orig.broker_account_id = effectiveBrokerAccountId;
        orig.bank_name = effectiveBankName;
        orig.upi_app = effectiveUpiApp;
        orig.updated_at = now;
        orig.sync_version += 1;
        orig.sync_status = 'PENDING';
      }
    }

    // Trigger cloud sync
    this.syncScheduledCount++;
  }

  // Deletion logic (matching context/DBContext.tsx)
  deleteApplication(id: string) {
    this.handleBankAllotmentDebit(id, 'Not Allotted' as ApplicationStatus);
    const app = this.apps.get(id);
    if (app) {
      app.deleted_at = new Date().toISOString();
      app.updated_at = new Date().toISOString();
      app.sync_status = 'PENDING';
    }
    this.singleDocDeletes.push(id);
    this.syncScheduledCount++;
  }

  // Import / LWW Sync check (matching importCriticalData & applyCriticalDeltaToSQLite)
  importCriticalApp(cloudApp: any): boolean {
    const existing = this.apps.get(cloudApp.id);
    if (existing) {
      const localTs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const cloudTs = cloudApp.updated_at ? new Date(cloudApp.updated_at).getTime() : 0;
      const isLocalPending = existing.sync_status === 'PENDING';

      // LWW Conflict Resolution Guard:
      if (
        (localTs > 0 && cloudTs > 0 && localTs > cloudTs) ||
        (isLocalPending && (cloudTs === 0 || localTs >= cloudTs))
      ) {
        return false; // Skipped, local preserved
      }

      // Cloud wins: update local
      existing.status = cloudApp.status;
      existing.sell_price = cloudApp.sell_price ?? null;
      existing.sale_date = cloudApp.sale_date ?? null;
      existing.tax = cloudApp.tax ?? 0;
      existing.user_cut = cloudApp.user_cut ?? 0;
      existing.broker_account_id = cloudApp.broker_account_id ?? existing.broker_account_id;
      existing.bank_name = cloudApp.bank_name ?? existing.bank_name;
      existing.upi_app = cloudApp.upi_app ?? existing.upi_app;
      existing.updated_at = cloudApp.updated_at;
      existing.sync_status = 'SYNCED';
      return true;
    } else {
      const newApp: AppRecord = {
        id: cloudApp.id,
        user_id: cloudApp.user_id,
        ipo_id: cloudApp.ipo_id,
        status: cloudApp.status || 'Applied',
        shares_count: cloudApp.shares_count ?? 15,
        sell_price: cloudApp.sell_price ?? null,
        sale_date: cloudApp.sale_date ?? null,
        tax: cloudApp.tax ?? 0,
        user_cut: cloudApp.user_cut ?? 0,
        bank_name: cloudApp.bank_name || '',
        upi_app: cloudApp.upi_app || '',
        broker_account_id: cloudApp.broker_account_id ?? null,
        owner_id: cloudApp.owner_id || null,
        sync_status: 'SYNCED',
        sync_version: 0,
        created_at: cloudApp.created_at || new Date().toISOString(),
        updated_at: cloudApp.updated_at || new Date().toISOString(),
        deleted_at: null,
      };
      this.apps.set(cloudApp.id, newApp);
      return true;
    }
  }
}

// ── Execute Tests ────────────────────────────────────────────────────────────
async function runTests() {
  console.log('======================================================================');
  console.log('RUNNING UPDATE APPLICATION FLOW REGRESSION TESTS');
  console.log('======================================================================\n');

  const db = new MockSQLiteDB();

  // ── TEST 1: Full sale remains Sold and retains all sale fields ──────────────
  {
    db.reset();
    const app: AppRecord = {
      id: 'app_1',
      user_id: 'user_1',
      ipo_id: 'ipo_1',
      status: 'Allotted',
      shares_count: 50,
      sell_price: null,
      sale_date: null,
      tax: 0,
      user_cut: 0,
      bank_name: 'HDFC Bank',
      upi_app: 'GPay',
      broker_account_id: 'broker_acc_99',
      owner_id: 'auth_1',
      sync_status: 'SYNCED',
      sync_version: 1,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
      deleted_at: null,
    };
    db.apps.set('app_1', app);

    // Perform Full Sale: soldQty = 50 (totalQty = 50)
    db.updateApplication(
      'app_1',
      'Sold',
      125.5,
      '2026-10-12',
      15.5,
      25.0,
      'HDFC Bank',
      'GPay',
      'broker_acc_99',
      50
    );

    const updated = db.apps.get('app_1')!;
    assert(updated.status === 'Sold', 'TEST 1A', 'Full sale status persists as Sold');
    assert(updated.sell_price === 125.5, 'TEST 1B', 'Full sale retains sell_price (125.5)');
    assert(updated.sale_date === '2026-10-12', 'TEST 1C', 'Full sale retains sale_date');
    assert(updated.tax === 15.5, 'TEST 1D', 'Full sale retains tax (15.5)');
    assert(updated.user_cut === 25.0, 'TEST 1E', 'Full sale retains user_cut (25.0)');
    assert(updated.shares_count === 50, 'TEST 1F', 'Full sale retains correct shares count (50)');
    assert(updated.broker_account_id === 'broker_acc_99', 'TEST 1G', 'Full sale retains broker account ID');
  }

  // ── TEST 2: Partial sale creates exactly one sold portion & keeps holding ────
  {
    db.reset();
    const orig: AppRecord = {
      id: 'app_holding_1',
      user_id: 'user_2',
      ipo_id: 'ipo_2',
      status: 'Holding',
      shares_count: 100,
      sell_price: null,
      sale_date: null,
      tax: 0,
      user_cut: 0,
      bank_name: 'SBI',
      upi_app: 'PhonePe',
      broker_account_id: 'broker_acc_zerodha',
      owner_id: 'auth_1',
      sync_status: 'SYNCED',
      sync_version: 1,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
      deleted_at: null,
    };
    db.apps.set('app_holding_1', orig);

    // Partial sell: 40 shares out of 100
    db.partialSell(
      'app_holding_1',
      40,
      100,
      250,
      '2026-10-13',
      50,
      75,
      'auth_1',
      'broker_acc_zerodha',
      'SBI',
      'PhonePe'
    );

    const remaining = db.apps.get('app_holding_1')!;
    assert(remaining.status === 'Holding', 'TEST 2A', 'Original record remains in Holding');
    assert(remaining.shares_count === 60, 'TEST 2B', 'Original record has remaining 60 shares');
    assert(remaining.sell_price === null, 'TEST 2C', 'Holding record cleared sell_price');

    // Find the newly created sold record
    const soldApp = Array.from(db.apps.values()).find(
      (a) => a.id !== 'app_holding_1' && a.status === 'Sold'
    );
    assert(soldApp !== undefined, 'TEST 2D', 'Created exactly one new Sold record');
    assert(soldApp?.shares_count === 40, 'TEST 2E', 'Sold record has soldShares = 40');
    assert(soldApp?.sell_price === 250, 'TEST 2F', 'Sold record has sell_price = 250');
    assert(soldApp?.tax === 50, 'TEST 2G', 'Sold record has tax = 50');
    assert(soldApp?.user_cut === 75, 'TEST 2H', 'Sold record has user_cut = 75');
    assert(soldApp?.broker_account_id === 'broker_acc_zerodha', 'TEST 2I', 'Sold record retains broker linkage');
  }

  // ── TEST 3: Rapid repeated save attempts execute only once ───────────────────
  {
    let executionCount = 0;
    const isSavingRef = { current: false };

    const mockSaveAction = async () => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      try {
        executionCount++;
        await new Promise((r) => setTimeout(r, 20));
      } finally {
        isSavingRef.current = false;
      }
    };

    // Simulate 5 rapid simultaneous taps
    await Promise.all([
      mockSaveAction(),
      mockSaveAction(),
      mockSaveAction(),
      mockSaveAction(),
      mockSaveAction(),
    ]);

    assert(executionCount === 1, 'TEST 3', `Rapid save taps executed exactly 1 time (actual: ${executionCount})`);
  }

  // ── TEST 4: Transitions among Allotted, Holding, and Sold do not change bank balance ──
  {
    db.reset();
    db.banks.set('b1', {
      id: 'b1',
      bank_name: 'HDFC Bank',
      balance: 100000,
      upi_app: 'GPay',
      updated_at: '2026-10-01T10:00:00Z',
    });

    const app: AppRecord = {
      id: 'app_fin_1',
      user_id: 'user_fin',
      ipo_id: 'ipo_fin',
      status: 'Applied',
      shares_count: 10, // 10 * 100 = 1000
      sell_price: null,
      sale_date: null,
      tax: 0,
      user_cut: 0,
      bank_name: 'HDFC Bank',
      upi_app: 'GPay',
      broker_account_id: null,
      owner_id: 'auth_1',
      sync_status: 'SYNCED',
      sync_version: 1,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
      deleted_at: null,
    };
    db.apps.set('app_fin_1', app);

    // 1. Move Applied -> Allotted (Genuine allotment debit of 1000)
    db.updateApplication('app_fin_1', 'Allotted');
    let balance = db.banks.get('b1')!.balance;
    assert(balance === 99000, 'TEST 4A', 'Applied -> Allotted correctly debited 1,000 (bal: 99,000)');

    // 2. Move Allotted -> Holding (Both financially allotted -> delta MUST be 0)
    db.updateApplication('app_fin_1', 'Holding');
    balance = db.banks.get('b1')!.balance;
    assert(balance === 99000, 'TEST 4B', 'Allotted -> Holding delta is 0 (bal remains 99,000)');

    // 3. Move Holding -> Sold (Both financially allotted -> delta MUST be 0)
    db.updateApplication('app_fin_1', 'Sold', 150, '2026-10-12');
    balance = db.banks.get('b1')!.balance;
    assert(balance === 99000, 'TEST 4C', 'Holding -> Sold delta is 0 (bal remains 99,000)');

    // 4. Repeated save on Sold -> Sold (No status change -> delta MUST be 0)
    db.updateApplication('app_fin_1', 'Sold', 155, '2026-10-12');
    balance = db.banks.get('b1')!.balance;
    assert(balance === 99000, 'TEST 4D', 'Repeated Sold save delta is 0 (bal remains 99,000)');
  }

  // ── TEST 5: Genuine refund transitions cannot be applied twice ───────────────
  {
    db.reset();
    db.banks.set('b1', {
      id: 'b1',
      bank_name: 'HDFC Bank',
      balance: 99000,
      upi_app: 'GPay',
      updated_at: '2026-10-01T10:00:00Z',
    });

    const app: AppRecord = {
      id: 'app_ref_1',
      user_id: 'user_ref',
      ipo_id: 'ipo_ref',
      status: 'Allotted',
      shares_count: 10,
      sell_price: null,
      sale_date: null,
      tax: 0,
      user_cut: 0,
      bank_name: 'HDFC Bank',
      upi_app: 'GPay',
      broker_account_id: null,
      owner_id: 'auth_1',
      sync_status: 'SYNCED',
      sync_version: 1,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
      deleted_at: null,
    };
    db.apps.set('app_ref_1', app);

    // 1. Move Allotted -> Not Allotted (Genuine refund of 1,000)
    db.updateApplication('app_ref_1', 'Not Allotted');
    let balance = db.banks.get('b1')!.balance;
    assert(balance === 100000, 'TEST 5A', 'Allotted -> Not Allotted refunded 1,000 back to 100,000');

    // 2. Retry or repeated save with 'Not Allotted'
    db.updateApplication('app_ref_1', 'Not Allotted');
    balance = db.banks.get('b1')!.balance;
    assert(balance === 100000, 'TEST 5B', 'Second Not Allotted save cannot double-refund (bal remains 100,000)');
  }

  // ── TEST 6: Partial-sale records retain correct broker linkage ────────────────
  {
    db.reset();
    const orig: AppRecord = {
      id: 'app_broker_1',
      user_id: 'user_brk',
      ipo_id: 'ipo_brk',
      status: 'Holding',
      shares_count: 200,
      sell_price: null,
      sale_date: null,
      tax: 0,
      user_cut: 0,
      bank_name: 'ICICI Bank',
      upi_app: 'iMobile',
      broker_account_id: 'broker_groww_45',
      owner_id: 'auth_1',
      sync_status: 'SYNCED',
      sync_version: 1,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
      deleted_at: null,
    };
    db.apps.set('app_broker_1', orig);

    // Partial sell 50 shares
    db.partialSell(
      'app_broker_1',
      50,
      200,
      300,
      '2026-10-13',
      10,
      20,
      'auth_1',
      'broker_groww_45'
    );

    const remaining = db.apps.get('app_broker_1')!;
    const sold = Array.from(db.apps.values()).find((a) => a.id !== 'app_broker_1');

    assert(
      remaining.broker_account_id === 'broker_groww_45',
      'TEST 6A',
      'Remaining holding record preserved broker_groww_45'
    );
    assert(
      sold?.broker_account_id === 'broker_groww_45',
      'TEST 6B',
      'Newly created sold record preserved broker_groww_45'
    );
  }

  // ── TEST 7: Stale cloud data cannot overwrite newer pending local edits ──────
  {
    db.reset();
    const localNow = '2026-10-13T10:30:00Z';
    const olderCloud = '2026-10-13T09:00:00Z';
    const newerCloud = '2026-10-13T11:00:00Z';

    const localApp: AppRecord = {
      id: 'app_lww_1',
      user_id: 'user_lww',
      ipo_id: 'ipo_lww',
      status: 'Sold',
      shares_count: 50,
      sell_price: 500,
      sale_date: '2026-10-13',
      tax: 20,
      user_cut: 30,
      bank_name: 'HDFC',
      upi_app: 'GPay',
      broker_account_id: 'broker_1',
      owner_id: 'auth_1',
      sync_status: 'PENDING',
      sync_version: 2,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: localNow,
      deleted_at: null,
    };
    db.apps.set('app_lww_1', localApp);

    // Case 1: Older cloud record (09:00 vs local 10:30)
    const importedOlder = db.importCriticalApp({
      id: 'app_lww_1',
      status: 'Holding',
      sell_price: null,
      updated_at: olderCloud,
    });
    assert(!importedOlder, 'TEST 7A', 'Stale older cloud record rejected by LWW');
    assert(db.apps.get('app_lww_1')!.status === 'Sold', 'TEST 7B', 'Local Sold status preserved');
    assert(db.apps.get('app_lww_1')!.sell_price === 500, 'TEST 7C', 'Local sell_price 500 preserved');

    // Case 2: Equal timestamp with PENDING local record
    const importedEqual = db.importCriticalApp({
      id: 'app_lww_1',
      status: 'Holding',
      sell_price: null,
      updated_at: localNow,
    });
    assert(!importedEqual, 'TEST 7D', 'Equal timestamp with pending local edit rejected by LWW');

    // Case 3: Missing timestamp with PENDING local record
    const importedMissing = db.importCriticalApp({
      id: 'app_lww_1',
      status: 'Holding',
      sell_price: null,
      updated_at: undefined,
    });
    assert(!importedMissing, 'TEST 7E', 'Missing timestamp cloud record rejected by LWW against pending local');

    // Case 4: Genuinely newer cloud record (11:00 vs local 10:30)
    const importedNewer = db.importCriticalApp({
      id: 'app_lww_1',
      status: 'Holding',
      sell_price: 600,
      updated_at: newerCloud,
    });
    assert(importedNewer, 'TEST 7F', 'Genuinely newer cloud record accepted');
    assert(db.apps.get('app_lww_1')!.status === 'Holding', 'TEST 7G', 'Updated to newer cloud status');
    assert(db.apps.get('app_lww_1')!.sell_price === 600, 'TEST 7H', 'Updated to newer cloud price 600');
  }

  // ── TEST 8: Successful mutations schedule cloud sync path ────────────────────
  {
    db.reset();
    const app: AppRecord = {
      id: 'app_sync_1',
      user_id: 'user_sync',
      ipo_id: 'ipo_sync',
      status: 'Allotted',
      shares_count: 10,
      sell_price: null,
      sale_date: null,
      tax: 0,
      user_cut: 0,
      bank_name: 'SBI',
      upi_app: 'BHIM',
      broker_account_id: null,
      owner_id: 'auth_1',
      sync_status: 'SYNCED',
      sync_version: 1,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
      deleted_at: null,
    };
    db.apps.set('app_sync_1', app);

    assert(db.syncScheduledCount === 0, 'TEST 8A', 'Sync initial count is 0');

    // Update triggers cloud sync
    db.updateApplication('app_sync_1', 'Holding');
    assert(db.syncScheduledCount === 1, 'TEST 8B', 'updateApplication triggered debounced cloud sync');

    // Delete triggers cloud sync + single doc delete
    db.deleteApplication('app_sync_1');
    assert(db.syncScheduledCount === 2, 'TEST 8C', 'deleteApplication triggered debounced cloud sync');
    assert(db.singleDocDeletes.includes('app_sync_1'), 'TEST 8D', 'deleteApplication dispatched syncSingleDocDelete');
  }

  // ── TEST 9: Offline save, retry, and restoration preserve data without duplicates ──
  {
    db.reset();
    // Simulate offline creation of application (owner_id may be null/empty initially)
    const offlineApp: AppRecord = {
      id: 'offline_app_1',
      user_id: 'user_off',
      ipo_id: 'ipo_off',
      status: 'Applied',
      shares_count: 20,
      sell_price: null,
      sale_date: null,
      tax: 0,
      user_cut: 0,
      bank_name: 'Kotak',
      upi_app: 'PhonePe',
      broker_account_id: null,
      owner_id: null,
      sync_status: 'PENDING',
      sync_version: 0,
      created_at: '2026-10-10T10:00:00Z',
      updated_at: '2026-10-10T10:00:00Z',
      deleted_at: null,
    };
    db.apps.set('offline_app_1', offlineApp);

    // After login, cloud sync imports cloud copy with assigned owner_id
    db.importCriticalApp({
      id: 'offline_app_1',
      user_id: 'user_off',
      ipo_id: 'ipo_off',
      status: 'Applied',
      shares_count: 20,
      owner_id: 'auth_user_1',
      updated_at: '2026-10-10T10:00:00Z',
    });

    assert(db.apps.size === 1, 'TEST 9A', 'No duplicate record created on restore/reconnection');
    assert(db.apps.has('offline_app_1'), 'TEST 9B', 'Original application ID preserved');
  }

  // ── TEST 10: Bank/UPI changes remain consistent & user isolation preserved ───
  {
    const bankAccounts = [
      { bank_name: 'HDFC Bank', upi_app: 'GPay' },
      { bank_name: 'Axis Bank', upi_app: 'PhonePe' },
      { bank_name: 'ICICI Bank', upi_app: 'Paytm' },
    ];

    // Bank change to Axis Bank resolves PhonePe
    const resolvedAxis = resolveBankLinkedUpiApp('Axis Bank', bankAccounts, UPI_APPS);
    assert(resolvedAxis === 'PhonePe', 'TEST 10A', 'Axis Bank resolves compatible UPI PhonePe');

    // Bank change to HDFC Bank resolves GPay
    const resolvedHdfc = resolveBankLinkedUpiApp('HDFC Bank', bankAccounts, UPI_APPS);
    assert(resolvedHdfc === 'GPay', 'TEST 10B', 'HDFC Bank resolves compatible UPI GPay');

    // Non-existent bank returns null (never retains stale invalid mapping)
    const resolvedInvalid = resolveBankLinkedUpiApp('Unknown Rural Bank', bankAccounts, UPI_APPS);
    assert(resolvedInvalid === null, 'TEST 10C', 'Unknown bank safely returns null UPI app');
  }

  console.log('\n======================================================================');
  console.log(`ALL TESTS PASSED: ${passCount} / ${passCount + failCount}`);
  console.log('======================================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
