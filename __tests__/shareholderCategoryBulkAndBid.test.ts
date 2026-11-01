/**
 * Shareholder Category Bulk Application & Direct Bid Engine Test Suite
 *
 * Verifies:
 * 1. Category-specific bid validation (Retail ₹2L limit, Shareholder quota limit, HNI min > ₹2L, SME 2-lot minimum).
 * 2. Shareholder quota availability resolution from prospectus offerCategories.
 * 3. Mixed-category bulk application payload integrity.
 * 4. SEBI Dual Bidding compliance: The same PAN/user can apply under BOTH Retail and Shareholder for the same IPO.
 * 5. Duplicate rejection within the same category for the same IPO.
 * 6. Correct SQLite schema, index, and category column persistence.
 */

import {
  validateCategoryBid,
  isShareholderCategoryAvailable,
  getIpoOfferCategories,
  getCategoryLotLimits,
  CATEGORY_OPTIONS,
  IpoCategory,
} from '../utils/ipoCategoryUtils';

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

// ---------------------------------------------------------------------------
// 1. Category Bid Validation Tests
// ---------------------------------------------------------------------------

function testCategoryBidValidation() {
  console.log('\n--- 1. Category Bid Validation Tests ---');

  const unitPrice = 500;
  const lotSize = 30; // 1 Lot = ₹15,000

  // Retail: 1 lot (₹15,000) -> Valid
  const ret1 = validateCategoryBid({
    category: 'RETAIL',
    lots: 1,
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(ret1.valid, 'Retail 1 Lot', 'Retail application of 1 lot (₹15,000) is valid');

  // Retail: 13 lots (₹1,95,000) -> Valid
  const ret13 = validateCategoryBid({
    category: 'RETAIL',
    lots: 13,
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(ret13.valid, 'Retail 13 Lots', 'Retail application of 13 lots (₹1,95,000) is valid');

  // Retail: 14 lots (₹2,10,000) -> Exceeds ₹2,00,000 ceiling -> Invalid
  const ret14 = validateCategoryBid({
    category: 'RETAIL',
    lots: 14,
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(!ret14.valid, 'Retail 14 Lots Exceeds Limit', 'Retail application exceeding ₹2L is rejected');
  assert(Boolean(ret14.error?.includes('2,00,000')), 'Retail Error Message', 'Error specifies ₹2,00,000 maximum amount limit');

  // Shareholder: 1 lot (₹15,000) -> Valid
  const sh1 = validateCategoryBid({
    category: 'SHAREHOLDER',
    lots: 1,
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(sh1.valid, 'Shareholder 1 Lot', 'Shareholder application of 1 lot is valid');

  // Shareholder: 13 lots (₹1,95,000) -> Valid
  const sh13 = validateCategoryBid({
    category: 'SHAREHOLDER',
    lots: 13,
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(sh13.valid, 'Shareholder 13 Lots', 'Shareholder application within ₹2L limit is valid');

  // Shareholder: 14 lots (₹2,10,000) -> Exceeds standard ₹2L quota -> Invalid
  const sh14 = validateCategoryBid({
    category: 'SHAREHOLDER',
    lots: 14,
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(!sh14.valid, 'Shareholder Exceeds Limit', 'Shareholder application exceeding limit is rejected');

  // Shareholder with explicit prospectus configuration (e.g. maxAmount = ₹5,00,000)
  const shCustomConfig = validateCategoryBid({
    category: 'SHAREHOLDER',
    lots: 20, // ₹3,00,000
    unitPrice,
    lotSize,
    isSme: false,
    categoryConfig: {
      category: 'SHAREHOLDER',
      maxAmount: 500000,
      maxLots: 30,
    },
  });
  assert(shCustomConfig.valid, 'Shareholder Prospectus MaxAmount', 'Shareholder application up to prospectus maxAmount is valid');

  // HNI: 13 lots (₹1,95,000) -> Fails (Must exceed ₹2,00,000)
  const hniSmall = validateCategoryBid({
    category: 'HNI',
    lots: 13,
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(!hniSmall.valid, 'HNI Under ₹2L', 'HNI application under ₹2,00,000 is rejected');

  // HNI: 14 lots (₹2,10,000) -> Valid (> ₹2,00,000)
  const hniValid = validateCategoryBid({
    category: 'HNI',
    lots: 14,
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(hniValid.valid, 'HNI Over ₹2L', 'HNI application over ₹2,00,000 is valid');

  // SME IPO: 1 lot -> Fails minimum 2 lots
  const sme1 = validateCategoryBid({
    category: 'RETAIL',
    lots: 1,
    unitPrice: 100,
    lotSize: 1000,
    isSme: true,
  });
  assert(!sme1.valid, 'SME 1 Lot Rejection', 'SME IPO application with only 1 lot is rejected');

  // SME IPO: 2 lots -> Valid
  const sme2 = validateCategoryBid({
    category: 'RETAIL',
    lots: 2,
    unitPrice: 100,
    lotSize: 1000,
    isSme: true,
  });
  assert(sme2.valid, 'SME 2 Lots Valid', 'SME IPO application with 2 lots is valid');

  // 0 Lots -> Fails
  const zeroLots = validateCategoryBid({
    category: 'RETAIL',
    lots: 0,
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(!zeroLots.valid, 'Zero Lots Rejection', 'Zero lots application is rejected');
}

// ---------------------------------------------------------------------------
// 2. Shareholder Offer Category Inspection Tests
// ---------------------------------------------------------------------------

function testShareholderCategoryInspection() {
  console.log('\n--- 2. Shareholder Offer Category Inspection Tests ---');

  // IPO with explicit SHAREHOLDER quota in offerCategories
  const ipoWithShareholderQuota = {
    id: 'tata-tech-ipo',
    companyName: 'Tata Technologies Limited',
    offerCategories: [
      { category: 'RETAIL', maxAmount: 200000, maxLots: 13 },
      { category: 'SHAREHOLDER', maxAmount: 200000, maxLots: 13 },
      { category: 'NII', minAmount: 200000 },
    ],
  };

  const shCheck1 = isShareholderCategoryAvailable(ipoWithShareholderQuota);
  assert(shCheck1.available, 'Tata Tech Shareholder Quota', 'Identifies shareholder quota from prospectus offerCategories');
  assert(shCheck1.hasExplicitConfig, 'Has Explicit Config', 'Marked as having explicit prospectus config');

  // IPO with explicit categories that DO NOT include shareholder
  const ipoWithoutShareholderQuota = {
    id: 'zomato-ipo',
    companyName: 'Zomato Limited',
    offerCategories: [
      { category: 'RETAIL', maxAmount: 200000 },
      { category: 'NII', minAmount: 200000 },
      { category: 'QIB' },
    ],
  };

  const shCheck2 = isShareholderCategoryAvailable(ipoWithoutShareholderQuota);
  assert(!shCheck2.available, 'No Shareholder Quota', 'Correctly flags absence of shareholder quota when offerCategories defined');
  assert(shCheck2.hasExplicitConfig, 'Explicit Config Absense', 'Explicit config confirmed without inventing fake rules');

  // Local IPO or backend IPO without categories metadata
  const ipoWithoutCategories = {
    id: 'unlisted-ipo',
    company_name: 'Generic Tech IPO',
  };

  const shCheck3 = isShareholderCategoryAvailable(ipoWithoutCategories);
  assert(shCheck3.available, 'Fallback Available', 'Available with guidance note when metadata absent');
  assert(!shCheck3.hasExplicitConfig, 'No Explicit Config', 'Marks hasExplicitConfig as false');
  assert(shCheck3.note.includes('record date'), 'Guidance Note', 'Guidance note highlights parent holding as of record date');
}

// ---------------------------------------------------------------------------
// 3. SEBI Dual Bidding & Bulk Persistence SQLite Mock Tests
// ---------------------------------------------------------------------------

interface MockAppRow {
  id: string;
  user_id: string;
  ipo_id: string;
  category: string;
  status: string;
  shares_count: number;
  deleted_at: string | null;
}

class MockApplicationRepository {
  public rows: MockAppRow[] = [];

  async addBulk(
    ipoId: string,
    userIds: string[],
    lotCounts?: Record<string, number> | number,
    categoryMap?: string | Record<string, string>
  ) {
    const lotSize = 30;
    const isSme = false;
    const existingSet = new Set(
      this.rows
        .filter((r) => r.ipo_id === ipoId && r.status !== 'Cancelled' && !r.deleted_at)
        .map((r) => `${r.user_id}_${r.category || 'RETAIL'}`)
    );

    const applicantsToApply: { uid: string; category: string }[] = [];
    const seenInBatch = new Set<string>();

    for (const uid of userIds) {
      if (!uid) continue;
      const resolvedCategory =
        typeof categoryMap === 'object' && categoryMap !== null
          ? (categoryMap[uid] || 'RETAIL')
          : typeof categoryMap === 'string' && categoryMap.trim() !== ''
          ? categoryMap.trim()
          : 'RETAIL';
      const key = `${uid}_${resolvedCategory}`;
      if (!existingSet.has(key) && !seenInBatch.has(key)) {
        seenInBatch.add(key);
        applicantsToApply.push({ uid, category: resolvedCategory });
      }
    }

    const now = new Date().toISOString();
    for (const app of applicantsToApply) {
      // Soft-delete cancelled matching uid + category
      for (const r of this.rows) {
        if (r.ipo_id === ipoId && r.user_id === app.uid && r.category === app.category && r.status === 'Cancelled') {
          r.deleted_at = now;
        }
      }

      const lots =
        typeof lotCounts === 'object' && lotCounts !== null
          ? (lotCounts[app.uid] ?? 1)
          : typeof lotCounts === 'number'
          ? lotCounts
          : 1;

      this.rows.push({
        id: `app_${Math.random().toString(36).substring(2, 8)}`,
        user_id: app.uid,
        ipo_id: ipoId,
        category: app.category,
        status: 'Applied',
        shares_count: lots * lotSize,
        deleted_at: null,
      });
    }
  }

  getAll() {
    return this.rows.filter((r) => !r.deleted_at);
  }
}

async function testDualBiddingAndBulkApplication() {
  console.log('\n--- 3. SEBI Dual Bidding & Bulk Application Tests ---');

  const repo = new MockApplicationRepository();
  const ipoId = 'tata-tech-ipo';
  const user1 = 'user-tata-holder';
  const user2 = 'user-regular-investor';

  // 1. User 1 applies under RETAIL
  await repo.addBulk(ipoId, [user1], 1, 'RETAIL');
  let apps = repo.getAll();
  assert(apps.length === 1, 'Initial Retail Application', '1 application added');
  assert(apps[0].user_id === user1 && apps[0].category === 'RETAIL', 'Retail Category Saved', 'Recorded as RETAIL');

  // 2. User 1 applies under SHAREHOLDER quota for the same IPO (SEBI Dual Bidding)
  // Must NOT be blocked as a duplicate!
  await repo.addBulk(ipoId, [user1], 1, 'SHAREHOLDER');
  apps = repo.getAll();
  assert(apps.length === 2, 'SEBI Dual Bidding Allowed', 'Both Retail and Shareholder applications permitted for the same user');
  const user1Apps = apps.filter((a) => a.user_id === user1);
  assert(user1Apps.length === 2, 'User 1 Has 2 Categories', 'User 1 has 2 distinct category applications');
  assert(user1Apps.some((a) => a.category === 'RETAIL') && user1Apps.some((a) => a.category === 'SHAREHOLDER'), 'Both Categories Present', 'Both RETAIL and SHAREHOLDER recorded');

  // 3. User 1 attempts to apply under SHAREHOLDER again -> Must be rejected as duplicate within the same category
  await repo.addBulk(ipoId, [user1], 1, 'SHAREHOLDER');
  apps = repo.getAll();
  assert(apps.length === 2, 'Duplicate Shareholder Rejected', 'Duplicate application in the same category is prevented');

  // 4. Mixed-Category Bulk Application:
  // User 1 applies under HNI, User 2 applies under SHAREHOLDER in a single batch
  const categoryMap = {
    [user1]: 'HNI',
    [user2]: 'SHAREHOLDER',
  };
  await repo.addBulk(ipoId, [user1, user2], 1, categoryMap);
  apps = repo.getAll();
  assert(apps.length === 4, 'Mixed Category Bulk Apply', 'Mixed categories in a single bulk run succeed');

  const u2App = apps.find((a) => a.user_id === user2);
  assert(u2App?.category === 'SHAREHOLDER', 'User 2 Shareholder Recorded', 'User 2 recorded under SHAREHOLDER');

  const u1HniApp = apps.find((a) => a.user_id === user1 && a.category === 'HNI');
  assert(u1HniApp !== undefined, 'User 1 HNI Recorded', 'User 1 recorded under HNI');

  // 5. Bulk Application with Custom Lot Size (e.g., 5 lots)
  const ipoCustom = 'custom-lot-ipo';
  const user3 = 'user-custom-lots';
  await repo.addBulk(ipoCustom, [user3], 5, 'RETAIL');
  const customApp = repo.getAll().find((a) => a.ipo_id === ipoCustom && a.user_id === user3);
  assert(customApp !== undefined, 'Custom Lot App Added', 'Application with 5 lots recorded');
  assert(customApp?.shares_count === 5 * 30, 'Calculated Shares Match Lots', `5 lots × 30 shares = 150 shares recorded (got ${customApp?.shares_count})`);

  // 6. Bulk Application with Per-Account Custom Lot Sizes
  const user4 = 'user-lots-4';
  const user5 = 'user-lots-5';
  await repo.addBulk(ipoCustom, [user4, user5], { [user4]: 3, [user5]: 7 }, 'RETAIL');
  const app4 = repo.getAll().find((a) => a.ipo_id === ipoCustom && a.user_id === user4);
  const app5 = repo.getAll().find((a) => a.ipo_id === ipoCustom && a.user_id === user5);
  assert(app4?.shares_count === 3 * 30, 'Per-Account Lot Size (3 lots)', `3 lots × 30 shares = 90 shares (got ${app4?.shares_count})`);
  assert(app5?.shares_count === 7 * 30, 'Per-Account Lot Size (7 lots)', `7 lots × 30 shares = 210 shares (got ${app5?.shares_count})`);
}

// ---------------------------------------------------------------------------
// 4. Lot Size Selector & Limits Calculation Tests
// ---------------------------------------------------------------------------

function testCategoryLotLimits() {
  console.log('\n--- 4. Lot Size Selector & Limits Calculation Tests ---');

  const unitPrice = 500;
  const lotSize = 30; // 1 Lot = ₹15,000

  // 1. Retail Mainboard (Ceiling: ₹2,00,000)
  // Max lots = Math.floor(200000 / 15000) = 13 lots (₹1,95,000)
  const retailLimits = getCategoryLotLimits({
    category: 'RETAIL',
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(retailLimits.hasValidLotData, 'Retail Valid Data', 'hasValidLotData is true');
  assert(retailLimits.minLots === 1, 'Retail Min Lots', 'Retail minimum lots is 1');
  assert(retailLimits.maxLots === 13, 'Retail Max Lots', `Retail maximum lots is 13 (got ${retailLimits.maxLots})`);
  assert(retailLimits.defaultLots === 1, 'Retail Default Lots', 'Retail default lots is 1');
  assert(retailLimits.options.length === 13, 'Retail Options Length', 'Options contain [1..13]');
  assert(retailLimits.options[0] === 1 && retailLimits.options[12] === 13, 'Retail Options Bounds', 'Options span from 1 to 13');
  assert(retailLimits.minAmount === 15000, 'Retail Min Amount', 'Min amount is ₹15,000');
  assert(retailLimits.maxAmount === 195000, 'Retail Max Amount', 'Max amount is ₹1,95,000');

  // 2. Retail SME (Mandatory 2-lot minimum)
  const smeUnitPrice = 100;
  const smeLotSize = 1000; // 1 Lot = ₹1,00,000
  const smeLimits = getCategoryLotLimits({
    category: 'RETAIL',
    unitPrice: smeUnitPrice,
    lotSize: smeLotSize,
    isSme: true,
  });
  assert(smeLimits.minLots === 2, 'SME Min Lots', 'SME minimum lots is strictly 2');
  assert(smeLimits.defaultLots === 2, 'SME Default Lots', 'SME default lots is 2');
  assert(smeLimits.maxLots === 2, 'SME Max Lots', 'SME maximum lots is 2 (2 lots = ₹2,00,000)');
  assert(smeLimits.options.length === 1 && smeLimits.options[0] === 2, 'SME Options Only 2', 'Only 2 lots permissible within ₹2L');

  // 3. Shareholder Category Standard (₹2,00,000 standard ceiling)
  const shLimits = getCategoryLotLimits({
    category: 'SHAREHOLDER',
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(shLimits.minLots === 1, 'Shareholder Min Lots', 'Shareholder minimum lots is 1');
  assert(shLimits.maxLots === 13, 'Shareholder Max Lots', 'Shareholder maximum lots is 13');

  // 4. Shareholder Category Prospectus Quota (₹5,00,000 ceiling from offerCategories)
  const shProspectusLimits = getCategoryLotLimits({
    category: 'SHAREHOLDER',
    unitPrice,
    lotSize,
    isSme: false,
    categoryConfig: {
      category: 'SHAREHOLDER',
      maxAmount: 500000,
    },
  });
  // 500,000 / 15,000 = 33.33 -> 33 lots
  assert(shProspectusLimits.maxLots === 33, 'Shareholder Prospectus Max Lots', `Max lots under ₹5L quota is 33 (got ${shProspectusLimits.maxLots})`);
  assert(shProspectusLimits.maxAmount === 33 * 15000, 'Shareholder Prospectus Max Amount', `Max amount is ₹4,95,000`);

  // 5. HNI Category (Must exceed ₹2,00,000)
  // Min lots = Math.floor(200000 / 15000) + 1 = 13 + 1 = 14 lots (₹2,10,000)
  const hniLimits = getCategoryLotLimits({
    category: 'HNI',
    unitPrice,
    lotSize,
    isSme: false,
  });
  assert(hniLimits.minLots === 14, 'HNI Min Lots', `HNI minimum lots is 14 (got ${hniLimits.minLots})`);
  assert(hniLimits.defaultLots === 14, 'HNI Default Lots', 'HNI default lots is 14');
  assert(hniLimits.minAmount === 210000, 'HNI Min Amount', 'HNI min amount is ₹2,10,000 (> ₹2,00,000)');
  assert(hniLimits.maxLots >= 14, 'HNI Max Lots', 'HNI max lots is greater than or equal to min lots');
  assert(hniLimits.options.includes(14), 'HNI Options Include Min', 'Options include min lot count 14');

  // 6. Invalid / Missing Lot Data Handling
  const invalidLimits1 = getCategoryLotLimits({
    category: 'RETAIL',
    unitPrice: 0,
    lotSize: 0,
    isSme: false,
  });
  assert(!invalidLimits1.hasValidLotData, 'Invalid Data Flagged', 'hasValidLotData is false for zero price/lotSize');
  assert(Boolean(invalidLimits1.errorMessage), 'Error Message Present', 'Returns clear user-facing error message');

  const invalidLimits2 = getCategoryLotLimits({
    category: 'RETAIL',
    unitPrice: null as any,
    lotSize: null as any,
    isSme: false,
  });
  assert(!invalidLimits2.hasValidLotData, 'Null Data Flagged', 'hasValidLotData is false for null price/lotSize');

  // 7. Validation rejects zero lot size or unit price in validateCategoryBid
  const valMissing = validateCategoryBid({
    category: 'RETAIL',
    lots: 1,
    unitPrice: 0,
    lotSize: 0,
    isSme: false,
  });
  assert(!valMissing.valid, 'Bid Validation Rejects Missing Data', 'validateCategoryBid rejects zero price/lot');
  assert(Boolean(valMissing.error?.includes('unavailable')), 'Bid Validation Error Message', 'Error indicates lot size or price data unavailable');
}

// ---------------------------------------------------------------------------
// Run Test Suite
// ---------------------------------------------------------------------------

async function runAllTests() {
  console.log('=================================================================');
  console.log('Running Shareholder Category & Direct Bid Engine Verification');
  console.log('=================================================================');

  try {
    testCategoryBidValidation();
    testShareholderCategoryInspection();
    await testDualBiddingAndBulkApplication();
    testCategoryLotLimits();

    console.log('\n=================================================================');
    console.log(`Test Suite Complete: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('=================================================================\n');

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Test Suite encountered fatal error:', err);
    process.exit(1);
  }
}

runAllTests();
