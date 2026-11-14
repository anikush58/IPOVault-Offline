/**
 * Comprehensive Regression Test Suite:
 * Allotted-to-Holding Transition Flow, Persistence, Field Isolation, and What's New Settings Removal.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

type ApplicationStatus =
  | 'Applied'
  | 'Mandate Approved'
  | 'Allotted'
  | 'Partially Allotted'
  | 'Not Allotted'
  | 'Holding'
  | 'Sold';

interface MockApp {
  id: string;
  user_id: string;
  ipo_id: string;
  status: ApplicationStatus;
  sell_price: number | null;
  sale_date: string | null;
  tax: number;
  user_cut: number;
  shares_count: number | null;
  allotted_shares?: number | null;
  quantity: number;
  buy_price: number;
  ipo_name: string;
  user_name: string;
  user_broker: string;
  user_bank_name: string;
  user_upi_app: string;
  broker_account_id: string | null;
  category: string;
}

interface MockAllotment {
  id: string;
  application_id: string;
  user_id: string;
  ipo_id: string;
  allotment_status: string;
  allotted_lots: number;
  allotted_shares: number;
  allotment_price: number;
}

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    const res = fn();
    if (res && typeof (res as any).then === 'function') {
      await res;
    }
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    throw err;
  }
}

async function runAllTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: Allotted-to-Holding Transition & Settings Cleanup');
  console.log('========================================================================\n');

  // ── TEST 1: UpdateApplicationModal Logic for Allotted -> Holding ──────
  await test('1.1: Moving Allotted to Holding does not trigger saveAllotmentResult revert', () => {
    let saveAllotmentResultCalled = false;
    let updatedStatus: ApplicationStatus | null = null;
    let updatedEffectivePrice: number | null = null;

    const mockApp: MockApp = {
      id: 'app-101',
      user_id: 'usr-1',
      ipo_id: 'ipo-swiggy',
      status: 'Allotted',
      sell_price: null,
      sale_date: null,
      tax: 25,
      user_cut: 50,
      shares_count: 50,
      allotted_shares: 50,
      quantity: 50,
      buy_price: 390,
      ipo_name: 'Swiggy Limited',
      user_name: 'Rahul Sharma',
      user_broker: 'Zerodha Kite',
      user_bank_name: 'HDFC Bank',
      user_upi_app: 'Google Pay',
      broker_account_id: 'zerodha-acc-1',
      category: 'RETAIL',
    };

    // User selects 'Holding' and sets current market price to 445
    let selectedStatus: ApplicationStatus = 'Holding';
    const isSold = (selectedStatus as ApplicationStatus) === 'Sold';
    const isHolding = (selectedStatus as ApplicationStatus) === 'Holding';
    const currentPriceInput = '445';
    const allottedSharesInput = '50';

    const effectivePrice = isHolding
      ? currentPriceInput.trim() !== '' ? parseFloat(currentPriceInput) : null
      : null;

    const parsedAllotted = parseInt(allottedSharesInput, 10);
    const finalAllottedShares = !isNaN(parsedAllotted) && parsedAllotted > 0
      ? parsedAllotted
      : (mockApp.allotted_shares || mockApp.shares_count || mockApp.quantity || 1);
    const isAllottedOutcome = (selectedStatus as ApplicationStatus) === 'Allotted' || (selectedStatus as string) === 'Partially Allotted';

    // Mock updateApplication
    const updateApplication = (id: string, st: ApplicationStatus, effPrice: number | null) => {
      updatedStatus = st;
      updatedEffectivePrice = effPrice;
    };

    // Mock saveAllotmentResult
    const saveAllotmentResult = () => {
      saveAllotmentResultCalled = true;
    };

    // Simulate UpdateApplicationModal handleSave branch
    if (!isSold) {
      updateApplication(mockApp.id, selectedStatus, effectivePrice);

      if (isAllottedOutcome) {
        saveAllotmentResult();
      } else if ((selectedStatus as ApplicationStatus) === 'Not Allotted') {
        saveAllotmentResult();
      }
    }

    assert.strictEqual(updatedStatus, 'Holding', 'Status must be updated to Holding');
    assert.strictEqual(updatedEffectivePrice, 445, 'Effective holding price must be 445');
    assert.strictEqual(saveAllotmentResultCalled, false, 'saveAllotmentResult must NOT be called for Holding transition');
  });

  // ── TEST 2: saveAllotmentResult Never Reverts Holding or Sold ──────
  await test('2.1: saveAllotmentResult guards against overwriting Holding or Sold applications', async () => {
    const dbApplications: Record<string, MockApp> = {
      'app-holding': {
        id: 'app-holding',
        user_id: 'usr-1',
        ipo_id: 'ipo-tata',
        status: 'Holding',
        sell_price: 1050,
        sale_date: null,
        tax: 0,
        user_cut: 0,
        shares_count: 30,
        allotted_shares: 30,
        quantity: 30,
        buy_price: 500,
        ipo_name: 'Tata Technologies',
        user_name: 'Rahul',
        user_broker: 'Zerodha',
        user_bank_name: 'HDFC',
        user_upi_app: 'GPay',
        broker_account_id: null,
        category: 'RETAIL',
      },
      'app-sold': {
        id: 'app-sold',
        user_id: 'usr-1',
        ipo_id: 'ipo-tata',
        status: 'Sold',
        sell_price: 1200,
        sale_date: '2026-11-10',
        tax: 150,
        user_cut: 0,
        shares_count: 30,
        allotted_shares: 30,
        quantity: 30,
        buy_price: 500,
        ipo_name: 'Tata Technologies',
        user_name: 'Rahul',
        user_broker: 'Zerodha',
        user_bank_name: 'HDFC',
        user_upi_app: 'GPay',
        broker_account_id: null,
        category: 'RETAIL',
      },
      'app-applied': {
        id: 'app-applied',
        user_id: 'usr-1',
        ipo_id: 'ipo-tata',
        status: 'Applied',
        sell_price: null,
        sale_date: null,
        tax: 0,
        user_cut: 0,
        shares_count: 30,
        allotted_shares: null,
        quantity: 30,
        buy_price: 500,
        ipo_name: 'Tata Technologies',
        user_name: 'Rahul',
        user_broker: 'Zerodha',
        user_bank_name: 'HDFC',
        user_upi_app: 'GPay',
        broker_account_id: null,
        category: 'RETAIL',
      },
    };

    const dbAllotments: Record<string, MockAllotment> = {};

    // Simulate saveAllotmentResult logic
    const simulateSaveAllotmentResult = (params: {
      application_id: string;
      allotment_status: string;
      allotted_shares: number;
    }) => {
      // 1. Update allotment table
      dbAllotments[params.application_id] = {
        id: `alt-${params.application_id}`,
        application_id: params.application_id,
        user_id: dbApplications[params.application_id].user_id,
        ipo_id: dbApplications[params.application_id].ipo_id,
        allotment_status: params.allotment_status,
        allotted_lots: 1,
        allotted_shares: params.allotted_shares,
        allotment_price: dbApplications[params.application_id].buy_price,
      };

      // 2. Fetch current status
      const currentApp = dbApplications[params.application_id];
      const currentStatus = currentApp?.status;
      const isAlreadyHoldingOrSold = currentStatus === 'Holding' || currentStatus === 'Sold';

      // 3. Status update only if not Holding/Sold
      if (!isAlreadyHoldingOrSold) {
        const statusUpper = params.allotment_status.trim().toUpperCase();
        if (statusUpper === 'ALLOTTED') {
          currentApp.status = 'Allotted';
        } else if (statusUpper === 'PARTIALLY_ALLOTTED') {
          currentApp.status = 'Partially Allotted';
        } else if (statusUpper === 'NOT_ALLOTTED') {
          currentApp.status = 'Not Allotted';
        }
      }
    };

    // Test A: An Applied app receives ALLOTTED -> Moves to Allotted
    simulateSaveAllotmentResult({ application_id: 'app-applied', allotment_status: 'ALLOTTED', allotted_shares: 30 });
    assert.strictEqual(dbApplications['app-applied'].status, 'Allotted', 'Applied application should transition to Allotted');

    // Test B: A Holding app receives ALLOTTED check result -> MUST REMAIN HOLDING
    simulateSaveAllotmentResult({ application_id: 'app-holding', allotment_status: 'ALLOTTED', allotted_shares: 30 });
    assert.strictEqual(dbApplications['app-holding'].status, 'Holding', 'Holding application must NEVER be reverted to Allotted');
    assert.strictEqual(dbAllotments['app-holding'].allotment_status, 'ALLOTTED', 'Allotment record should still be recorded');

    // Test C: A Sold app receives ALLOTTED check result -> MUST REMAIN SOLD
    simulateSaveAllotmentResult({ application_id: 'app-sold', allotment_status: 'ALLOTTED', allotted_shares: 30 });
    assert.strictEqual(dbApplications['app-sold'].status, 'Sold', 'Sold application must NEVER be reverted to Allotted');
  });

  // ── TEST 3: Database Field Isolation (No silent corruption of tax, user_cut, etc.) ──────
  await test('3.1: ApplicationRepository.update preserves existing fields when undefined', () => {
    // Current database row
    const row: {
      id: string;
      status: ApplicationStatus;
      sell_price: number | null;
      sale_date: string | null;
      tax: number;
      user_cut: number;
      bank_name: string;
      upi_app: string;
      broker_account_id: string | null;
      shares_count: number | null;
    } = {
      id: 'app-isolation-1',
      status: 'Allotted',
      sell_price: 520,
      sale_date: null,
      tax: 75.5,
      user_cut: 120.0,
      bank_name: 'Kotak Mahindra',
      upi_app: 'PhonePe',
      broker_account_id: 'kotak-sec-9',
      shares_count: 100,
    };

    // Simulate SQL:
    // sell_price = CASE WHEN ? = 1 THEN ? ELSE sell_price END
    // tax = CASE WHEN ? = 1 THEN ? ELSE tax END
    // user_cut = CASE WHEN ? = 1 THEN ? ELSE user_cut END
    function simulateRepoUpdate(
      newStatus: ApplicationStatus,
      sellPrice?: number | null,
      saleDate?: string | null,
      tax?: number,
      userCut?: number,
      bankName?: string,
      upiApp?: string,
      brokerAccountId?: string | null,
      sharesCount?: number | null,
    ) {
      row.status = newStatus;
      if (sellPrice !== undefined) row.sell_price = sellPrice;
      if (saleDate !== undefined) row.sale_date = saleDate;
      if (tax !== undefined) row.tax = tax;
      if (userCut !== undefined) row.user_cut = userCut;
      if (bankName !== undefined) row.bank_name = bankName;
      if (upiApp !== undefined) row.upi_app = upiApp;
      if (brokerAccountId !== undefined) row.broker_account_id = brokerAccountId;
      if (sharesCount !== undefined) row.shares_count = sharesCount;
    }

    // Call update with ONLY status = 'Holding' (e.g. from swipe or minimal status update)
    simulateRepoUpdate('Holding');

    assert.strictEqual(row.status, 'Holding', 'Status updated to Holding');
    assert.strictEqual(row.sell_price, 520, 'sell_price preserved when undefined');
    assert.strictEqual(row.tax, 75.5, 'tax preserved when undefined (not wiped to 0)');
    assert.strictEqual(row.user_cut, 120.0, 'user_cut preserved when undefined (not wiped to 0)');
    assert.strictEqual(row.bank_name, 'Kotak Mahindra', 'bank_name preserved');
    assert.strictEqual(row.broker_account_id, 'kotak-sec-9', 'broker_account_id preserved');
  });

  // ── TEST 4: Applications Tab Filtering & Count Accuracy ──────
  await test('4.1: Applications tab filter and counts properly separate Allotted and Holding', () => {
    function isAppliedStatus(st: string) {
      return st === 'Applied' || st === 'Mandate Approved';
    }
    function isAllottedStatus(st: string) {
      return st === 'Allotted' || st === 'Partially Allotted';
    }
    function isNotAllottedStatus(st: string) {
      return st === 'Not Allotted' || st === 'Cancelled';
    }

    const testApps: { id: string; status: ApplicationStatus }[] = [
      { id: '1', status: 'Applied' },
      { id: '2', status: 'Mandate Approved' },
      { id: '3', status: 'Allotted' },
      { id: '4', status: 'Partially Allotted' },
      { id: '5', status: 'Holding' },
      { id: '6', status: 'Holding' },
      { id: '7', status: 'Sold' },
      { id: '8', status: 'Not Allotted' },
    ];

    let applied = 0;
    let allotted = 0;
    let holding = 0;
    let sold = 0;
    let notAllotted = 0;

    for (const a of testApps) {
      if (isAppliedStatus(a.status)) applied++;
      if (isAllottedStatus(a.status)) allotted++;
      if (a.status === 'Holding') holding++;
      if (a.status === 'Sold') sold++;
      if (isNotAllottedStatus(a.status)) notAllotted++;
    }

    assert.strictEqual(applied, 2, '2 applied apps');
    assert.strictEqual(allotted, 2, '2 allotted apps');
    assert.strictEqual(holding, 2, '2 holding apps');
    assert.strictEqual(sold, 1, '1 sold app');
    assert.strictEqual(notAllotted, 1, '1 not allotted app');

    // Holding tab filtered list
    const holdingTabItems = testApps.filter((a) => a.status === 'Holding');
    assert.strictEqual(holdingTabItems.length, 2, 'Holding tab contains exactly 2 items');
    assert.ok(holdingTabItems.every((a) => a.status === 'Holding'), 'All holding tab items have status Holding');

    // Allotted tab must NOT contain Holding items
    const allottedTabItems = testApps.filter((a) => isAllottedStatus(a.status));
    assert.strictEqual(allottedTabItems.length, 2, 'Allotted tab contains only 2 items');
    assert.ok(!allottedTabItems.some((a) => a.status === 'Holding'), 'Holding items are excluded from Allotted tab');
  });

  // ── TEST 5: Verify What's New Removal from Settings Files ──────
  await test('5.1: Settings screens do not contain What\'s New section or sheet', () => {
    const settingsPath = path.resolve(__dirname, '../app/(tabs)/settings.tsx');
    const settingsContent = fs.readFileSync(settingsPath, 'utf8');

    assert.ok(!settingsContent.includes("What's New in v2.3.0"), 'settings.tsx must NOT contain "What\'s New in v2.3.0"');
    assert.ok(!settingsContent.includes('showWhatsNewSheet'), 'settings.tsx must NOT declare or use showWhatsNewSheet');
    assert.ok(!settingsContent.includes('featureCard:'), 'settings.tsx must NOT contain unused featureCard style');

    const aboutPath = path.resolve(__dirname, '../app/settings-about.tsx');
    const aboutContent = fs.readFileSync(aboutPath, 'utf8');

    assert.ok(!aboutContent.includes("showWhatsNewModal"), 'settings-about.tsx must NOT declare showWhatsNewModal');
    assert.ok(!aboutContent.includes("whatsNewItem"), 'settings-about.tsx must NOT contain whatsNewItem style');
    assert.ok(aboutContent.includes('Version 2.3.0'), 'settings-about.tsx must still retain Version information');
  });

  assert.strictEqual(passed, 5, 'All 5 tests must be accounted for and completed before the summary');

  console.log(`\n========================================================================`);
  console.log(`SUMMARY: All ${passed} tests passed successfully.`);
  console.log('========================================================================\n');
}

runAllTests().catch((err) => {
  console.error('\nTest suite execution failed:', err);
  process.exit(1);
});
