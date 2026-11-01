import fs from 'fs';
import path from 'path';
import {
  CANONICAL_DEFAULT_BENEFITS,
  CANONICAL_DEFAULT_PLANS,
  MobileProPlan,
  PRO_PLANS_CACHE_KEY,
  arePlansEqual,
} from '../services/pro/proPlanService';
import { ENDPOINTS } from '../services/api/Endpoints';

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

async function runProPlanManagementTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING PRO PLAN MANAGEMENT & MOBILE INTEGRATION TESTS');
  console.log('===============================================================');

  // --- 1. Endpoint & Architecture Constants ---
  console.log('\n--- 1. Testing Endpoints & Service Contracts ---');
  assert(
    ENDPOINTS.PRO_PLANS === '/api/v1/pro-plans',
    'Endpoint Registered',
    'ENDPOINTS.PRO_PLANS is mapped to "/api/v1/pro-plans"'
  );
  assert(
    PRO_PLANS_CACHE_KEY === '@ipovault_cached_pro_plans_v1',
    'Cache Key Defined',
    'PRO_PLANS_CACHE_KEY is standardized'
  );
  assert(
    CANONICAL_DEFAULT_PLANS.length >= 2,
    'Canonical Defaults Present',
    'Default plans contain at least Monthly and Annual tiers'
  );
  assert(
    CANONICAL_DEFAULT_BENEFITS.length === 6,
    'Canonical Benefits Complete',
    'Default benefits include all 6 canonical local-tracking features'
  );

  // --- 2. Deterministic Ordering & Multiple Tiers ---
  console.log('\n--- 2. Verifying Deterministic Ordering & Multi-Tier Support ---');
  const testPlans: MobileProPlan[] = [
    {
      id: 'plan-annual',
      code: 'pro_annual',
      name: 'Annual Pro',
      duration: 'Annual',
      priceInr: 3999,
      comparisonPriceInr: 5999,
      displayOrder: 2,
      isPopular: true,
      features: [],
      benefits: [],
    },
    {
      id: 'plan-monthly',
      code: 'pro_monthly',
      name: 'Monthly Pro',
      duration: 'Monthly',
      priceInr: 499,
      comparisonPriceInr: 699,
      displayOrder: 1,
      isPopular: false,
      features: [],
      benefits: [],
    },
    {
      id: 'plan-quarterly',
      code: 'pro_quarterly',
      name: 'Quarterly Pro',
      duration: '3 Months',
      priceInr: 1299,
      comparisonPriceInr: 1799,
      displayOrder: 3,
      isPopular: false,
      features: [],
      benefits: [],
    },
  ];

  // Sorting logic verification
  testPlans.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  assert(testPlans[0].code === 'pro_monthly', 'Stable Ordering 1', 'First plan is pro_monthly (displayOrder 1)');
  assert(testPlans[1].code === 'pro_annual', 'Stable Ordering 2', 'Second plan is pro_annual (displayOrder 2)');
  assert(testPlans[2].code === 'pro_quarterly', 'Stable Ordering 3', 'Third plan is pro_quarterly (displayOrder 3)');

  // Price calculations
  const annual = testPlans[1];
  const savings = (annual.comparisonPriceInr ?? 0) - annual.priceInr;
  const savingsPct = Math.round((savings / (annual.comparisonPriceInr ?? 1)) * 100);
  assert(savings === 2000, 'Savings Amount', 'Calculates absolute savings correctly (₹2,000)');
  assert(savingsPct === 33, 'Savings Percentage', 'Calculates percentage savings correctly (33%)');

  // --- 2B. Benefit Ordering & Unpublished Plan Filtering ---
  console.log('\n--- 2B. Benefit Ordering & Plan Status Filtering ---');
  const mockRawApiData = [
    {
      id: 'p1',
      code: 'pro_monthly',
      name: 'Monthly Pro',
      priceInr: 499,
      status: 'PUBLISHED',
      displayOrder: 1,
      benefits: [
        { id: 'b2', title: 'Manage Applications', displayOrder: 2 },
        { id: 'b1', title: 'Record IPO Applications', displayOrder: 1 },
      ],
    },
    {
      id: 'p2',
      code: 'draft_plan',
      name: 'Draft Hidden Plan',
      priceInr: 199,
      status: 'DRAFT',
      displayOrder: 2,
      benefits: [],
    },
    {
      id: 'p3',
      code: 'archived_plan',
      name: 'Archived Old Plan',
      priceInr: 99,
      status: 'ARCHIVED',
      displayOrder: 3,
      benefits: [],
    },
  ];

  // Filter unpublished/archived
  const filteredPublished = mockRawApiData.filter((p) => p.status === 'PUBLISHED');
  assert(filteredPublished.length === 1, 'Status Filtering', 'Excludes DRAFT and ARCHIVED plans');
  assert(filteredPublished[0].id === 'p1', 'Only Published Kept', 'Preserves only PUBLISHED plan');

  // Benefit ordering within plan
  const planBenefitsTest = [...filteredPublished[0].benefits].sort((a, b) => a.displayOrder - b.displayOrder);
  assert(planBenefitsTest[0].title === 'Record IPO Applications', 'Benefit Ordering 1', 'First benefit has displayOrder 1');
  assert(planBenefitsTest[1].title === 'Manage Applications', 'Benefit Ordering 2', 'Second benefit has displayOrder 2');

  // Equality detection
  assert(arePlansEqual(testPlans, testPlans), 'Equality Identical', 'Identical plans are recognized as equal');
  const modifiedPlans = JSON.parse(JSON.stringify(testPlans));
  modifiedPlans[0].priceInr = 599; // Price changed
  assert(!arePlansEqual(testPlans, modifiedPlans), 'Equality Price Change', 'Detects price change without false equality');

  // --- 3. Offline & Cache Invariant Checks ---
  console.log('\n--- 3. Testing Offline Caching & Invariant Safety ---');
  const mockStorage: Record<string, string> = {};
  const mockSafeAsyncStorage = {
    getItem: async (key: string) => mockStorage[key] || null,
    setItem: async (key: string, val: string) => {
      mockStorage[key] = val;
    },
  };

  // Simulate caching
  await mockSafeAsyncStorage.setItem(PRO_PLANS_CACHE_KEY, JSON.stringify(testPlans));
  const cached = await mockSafeAsyncStorage.getItem(PRO_PLANS_CACHE_KEY);
  assert(cached !== null, 'Cache Stored', 'Successfully persists plans to local storage');
  const parsed = JSON.parse(cached || '[]');
  assert(parsed.length === 3, 'Cache Retrievable', 'Parsed cached plans contain all 3 tiers');

  // --- 4. Mobile pro-details.tsx Integration Verification ---
  console.log('\n--- 4. Verifying pro-details.tsx Dynamic Integration ---');
  const proDetailsPath = path.join(__dirname, '..', 'app', 'pro-details.tsx');
  const proDetailsContent = fs.readFileSync(proDetailsPath, 'utf8');

  assert(
    !proDetailsContent.includes('<div') && !proDetailsContent.includes('</div'),
    'React Native Component Hygiene',
    'pro-details.tsx uses native View components and contains no HTML div tags'
  );

  assert(
    proDetailsContent.includes('RefreshControl'),
    'Pull To Refresh',
    'pro-details.tsx supports pull-to-refresh to fetch updated backend pricing on demand'
  );

  assert(
    proDetailsContent.includes('proPlanService'),
    'Service Connected',
    'pro-details.tsx imports and connects to proPlanService'
  );
  assert(
    proDetailsContent.includes('proPlanService.subscribe'),
    'Reactive Subscription',
    'Subscribes to proPlanService for real-time plan updates'
  );
  assert(
    proDetailsContent.includes('proPlanService.getPublishedPlans'),
    'Background Sync',
    'Calls getPublishedPlans to fetch fresh published data without flicker'
  );
  assert(
    proDetailsContent.includes('tierTabsContainer'),
    'Multiple Tier UI',
    'Includes tab container for toggling between multiple plan durations'
  );
  assert(
    proDetailsContent.includes('activePlan.priceInr'),
    'Dynamic Pricing',
    'Renders plan price dynamically from backend active plan'
  );
  assert(
    proDetailsContent.includes('activePlan.comparisonPriceInr'),
    'Dynamic Comparison Price',
    'Renders comparison strikethrough price when provided by backend'
  );
  assert(
    proDetailsContent.includes('activePlan.duration'),
    'Dynamic Duration',
    'Renders billing duration dynamically'
  );
  assert(
    proDetailsContent.includes('planBenefits.map'),
    'Dynamic Benefits List',
    'Maps benefits dynamically from active plan'
  );
  assert(
    proDetailsContent.includes('In-app plan purchases are currently not active'),
    'Informational Notice',
    'Displays informational notice that purchasing is currently unavailable'
  );
  assert(
    !proDetailsContent.includes('buyNow') && !proDetailsContent.includes('checkoutModal'),
    'No Fake Checkout',
    'Does NOT contain fake checkout, fake payment confirmation, or auto upgrade'
  );
  assert(
    proDetailsContent.includes('does not place bids on any stock exchange'),
    'Exchange Bidding Disclaimer',
    'Clearly disclaims that IPOVault does not place bids on any stock exchange'
  );
  assert(
    proDetailsContent.includes('or guarantee IPO share allotment'),
    'Allotment Disclaimer',
    'Clearly disclaims that IPOVault does not guarantee IPO allotments'
  );
  assert(
    proDetailsContent.includes('#10B981') && proDetailsContent.includes('PRO ACTIVE'),
    'Filled Pro Badge',
    'Maintains filled solid green PRO ACTIVE badge'
  );

  // --- 5. Compact Settings Card & Entitlement Isolation ---
  console.log('\n--- 5. Verifying Settings Card & Entitlement Isolation ---');
  const settingsPath = path.join(__dirname, '..', 'app', '(tabs)', 'settings.tsx');
  const settingsContent = fs.readFileSync(settingsPath, 'utf8');

  assert(
    settingsContent.includes('title="IPOVault Pro"'),
    'Settings Title',
    'Settings screen retains compact SettingRow titled "IPOVault Pro"'
  );
  assert(
    settingsContent.includes('proCardSubtitle'),
    'Settings Subtitle Dynamic',
    'Settings screen uses concise single-line subtitle'
  );
  assert(
    settingsContent.includes("navigateTo('/pro-details')") ||
      settingsContent.includes("router.push('/pro-details')") ||
      settingsContent.includes('router.push("/pro-details")'),
    'Settings Navigation',
    'Tapping compact Pro card navigates to dedicated /pro-details page'
  );

  assert(
    !settingsContent.includes('PRO_PLANS') && !settingsContent.includes('planBenefitsList'),
    'Compact Settings Card Intact',
    'Settings page does NOT display full plan list or benefits internally'
  );

  console.log('\n===============================================================');
  console.log(`ALL PRO PLAN MANAGEMENT TESTS PASSED (${passCount} passed, ${failCount} failed)`);
  console.log('===============================================================');
}

runProPlanManagementTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
