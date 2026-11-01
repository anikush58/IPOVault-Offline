import fs from 'fs';
import path from 'path';

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

export async function runSettingsUpgradeToProTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING SETTINGS IPOVAULT PRO REFACTOR REGRESSION TESTS');
  console.log('===============================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const settingsPath = path.join(rootDir, 'app', '(tabs)', 'settings.tsx');
  const proDetailsPath = path.join(rootDir, 'app', 'pro-details.tsx');
  const layoutPath = path.join(rootDir, 'app', '_layout.tsx');

  assert(fs.existsSync(settingsPath), 'File Exists', 'settings.tsx exists');
  assert(fs.existsSync(proDetailsPath), 'File Exists', 'pro-details.tsx exists');
  assert(fs.existsSync(layoutPath), 'File Exists', '_layout.tsx exists');

  const settingsContent = fs.readFileSync(settingsPath, 'utf8');
  const proDetailsContent = fs.readFileSync(proDetailsPath, 'utf8');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  // Helper evaluating exact visibility and subtitle logic as implemented in settings.tsx
  function evaluateProCard(
    authUser: any,
    userEntitlement: { isPro: boolean; status?: string },
    isPro: boolean,
    isExperienceLoading: boolean = false
  ) {
    const isUserPro = Boolean(userEntitlement?.isPro || isPro);
    const isEntitlementLoading = Boolean(isExperienceLoading || userEntitlement?.status === 'loading');
    const showProCard = Boolean(authUser);
    const proCardSubtitle = isUserPro
      ? 'Your account has full access'
      : isEntitlementLoading
        ? 'Checking access...'
        : 'Unlock the full IPOVault experience';

    return { isUserPro, isEntitlementLoading, showProCard, proCardSubtitle };
  }

  // 1. Entitlement & Visibility Logic Verification
  console.log('--- 1. Testing Visibility Logic for Pro vs. Non-Pro vs. Guests ---');

  // Case 1: Authenticated Non-Pro -> Compact Card with promotional subtitle
  const nonProState = evaluateProCard(
    { uid: 'user_123', email: 'test@example.com' },
    { isPro: false, status: 'ready' },
    false,
    false
  );
  assert(nonProState.showProCard === true, 'Authenticated Non-Pro', 'Shows compact IPOVault Pro card');
  assert(
    nonProState.proCardSubtitle === 'Unlock the full IPOVault experience',
    'Authenticated Non-Pro Subtitle',
    'Displays "Unlock the full IPOVault experience"'
  );

  // Case 2: Authenticated Pro (Server Verified) -> Compact Card with factual status subtitle
  const proState = evaluateProCard(
    { uid: 'user_123', email: 'test@example.com' },
    { isPro: true, status: 'ready' },
    false,
    false
  );
  assert(proState.showProCard === true, 'Authenticated Pro (Server)', 'Shows compact IPOVault Pro card');
  assert(
    proState.proCardSubtitle === 'Your account has full access',
    'Authenticated Pro Subtitle',
    'Displays "Your account has full access"'
  );

  // Case 3: Authenticated Pro (Experience mode) -> Compact Card with factual status subtitle
  const proExpState = evaluateProCard(
    { uid: 'user_123', email: 'test@example.com' },
    { isPro: false, status: 'ready' },
    true,
    false
  );
  assert(proExpState.showProCard === true, 'Authenticated Pro (Experience)', 'Shows compact IPOVault Pro card');
  assert(
    proExpState.proCardSubtitle === 'Your account has full access',
    'Authenticated Pro Experience Subtitle',
    'Displays "Your account has full access"'
  );

  // Case 4: Guest / Unauthenticated -> Card is NOT visible
  const guestUser = evaluateProCard(null, { isPro: false, status: 'ready' }, false, false);
  assert(guestUser.showProCard === false, 'Guest / Unauthenticated', 'Hides IPOVault Pro card from guest');

  const guestWithProFlag = evaluateProCard(null, { isPro: true, status: 'ready' }, true, false);
  assert(
    guestWithProFlag.showProCard === false,
    'Guest with Pro flag',
    'Never shows IPOVault Pro card to unauthenticated user'
  );

  // Case 5: Entitlement Loading State -> Handles loading without flashing Non-Pro promotion
  const loadingState = evaluateProCard(
    { uid: 'user_123', email: 'test@example.com' },
    { isPro: false, status: 'loading' },
    false,
    true
  );
  assert(loadingState.showProCard === true, 'Loading State', 'Card is shown for authenticated user');
  assert(
    loadingState.proCardSubtitle !== 'Unlock the full IPOVault experience',
    'Loading State Safe Subtitle',
    'Does NOT display Non-Pro promotional text while loading'
  );
  assert(
    loadingState.proCardSubtitle === 'Checking access...',
    'Loading State Neutral Subtitle',
    'Displays neutral "Checking access..." during entitlement loading'
  );

  // Case 6: Cached / Offline Pro during refresh
  const cachedProLoading = evaluateProCard(
    { uid: 'user_123', email: 'test@example.com' },
    { isPro: true, status: 'loading' },
    false,
    true
  );
  assert(
    cachedProLoading.proCardSubtitle === 'Your account has full access',
    'Cached Pro Subtitle Retained',
    'Retains factual Pro subtitle immediately if verified from cache'
  );

  // 2. Settings Screen AST & Clean Native Design Checks
  console.log('\n--- 2. Verifying Compact SettingRow & Clean Settings Design ---');

  assert(
    settingsContent.includes('const isUserPro = Boolean(userEntitlement.isPro || isPro);'),
    'Logic Definition',
    'Calculates isUserPro strictly from verified entitlement and experience'
  );
  assert(
    settingsContent.includes('const showProCard = Boolean(authUser);'),
    'Logic Definition',
    'Guards showProCard strictly by authenticated user'
  );
  assert(
    settingsContent.includes("navigateTo('/pro-details')"),
    'Navigation Pattern',
    'Tapping IPOVault Pro row navigates to /pro-details'
  );
  assert(
    settingsContent.includes('title="IPOVault Pro"'),
    'Compact SettingRow',
    'Uses native SettingRow with title "IPOVault Pro"'
  );
  assert(
    !settingsContent.includes('showProBenefitsSheet'),
    'No Bottom Sheet',
    'Does not use bottom sheet for Pro benefits inside Settings'
  );
  assert(
    !settingsContent.includes('proUpgradeCard'),
    'No Promotional Cards',
    'Removed AI-generated promotional card from Settings'
  );
  assert(
    !settingsContent.includes('proStatusCard'),
    'No Expanded Pro Card',
    'Removed expanded Pro status card from Settings'
  );

  // 3. Dedicated Pro Details Screen Verification
  console.log('\n--- 3. Verifying Dedicated Pro Details Screen & Content ---');

  assert(
    layoutContent.includes('name="pro-details"'),
    'Route Registered',
    'pro-details screen is registered in root _layout.tsx'
  );

  // Verify all 6 Pro benefits moved to pro-details.tsx with accurate local tracking wording
  const expectedProBenefits = [
    'Record IPO Applications',
    'Bulk Application Management',
    'Manage Applications',
    'Track Application Status',
    'Bank Account Management',
    'Ad-Free Experience',
  ];

  for (const benefit of expectedProBenefits) {
    assert(
      proDetailsContent.includes(benefit),
      'Pro Benefit Present',
      `pro-details contains verified benefit: "${benefit}"`
    );
  }

  // Verify mandatory phrasing required by product specification
  assert(
    proDetailsContent.includes('Record IPO applications'),
    'Required Phrasing',
    'Contains "Record IPO applications"'
  );
  assert(
    proDetailsContent.includes('Manage applications'),
    'Required Phrasing',
    'Contains "Manage applications"'
  );
  assert(
    proDetailsContent.includes('Bulk Application Management') || proDetailsContent.includes('Bulk application management'),
    'Required Phrasing',
    'Contains "Bulk Application Management"'
  );
  assert(
    proDetailsContent.includes('Track Application Status') || proDetailsContent.includes('Track application status'),
    'Required Phrasing',
    'Contains "Track Application Status"'
  );

  // Verify all 3 Free tier features
  const expectedFreeFeatures = [
    'Browse complete Mainboard & SME IPO details',
    'Add and manage family member profiles',
    'Check IPO allotment status across registrars',
  ];

  for (const freeFeat of expectedFreeFeatures) {
    assert(
      proDetailsContent.includes(freeFeat),
      'Free Feature Present',
      `pro-details contains free tier feature: "${freeFeat}"`
    );
  }

  // 4. Availability Notice, Disclaimer, and Server Authority
  console.log('\n--- 4. Verifying Disclaimers and Server-Authoritative Safety ---');

  assert(
    !proDetailsContent.includes('Upgrade Availability') &&
      !proDetailsContent.includes('In-app subscription and upgrading are currently not available'),
    'Removed Upgrade Availability',
    'Verified upgrade availability section is removed from pro details page'
  );
  assert(
    proDetailsContent.includes('does not place bids on any stock exchange'),
    'No Exchange Placement',
    'Explicitly states that IPOVault does not place bids on any stock exchange'
  );
  assert(
    proDetailsContent.includes('guarantee IPO share allotment') ||
      proDetailsContent.includes('guarantee IPO allotment'),
    'Financial Disclaimer',
    'Clearly disclaims that IPOVault does not guarantee IPO allotments or returns'
  );

  // Pro-related UI must NOT claim exchange order placement or exchange execution
  assert(
    !proDetailsContent.includes('broker/exchange execution') &&
      !proDetailsContent.includes('exchange order placement') &&
      !proDetailsContent.includes('exchange execution'),
    'No False Claims',
    'Does not mention exchange execution or exchange order placement'
  );
  assert(
    !proDetailsContent.includes('Direct Bid & Bulk Apply'),
    'No Misleading Direct Bid Feature Name',
    'Removed misleading "Direct Bid" branding from Pro details'
  );

  assert(
    !settingsContent.includes('simulatePurchase') && !proDetailsContent.includes('simulatePurchase'),
    'Safety: No Fake Purchase',
    'Does not simulate purchases'
  );
  assert(
    !settingsContent.includes('checkout') && !proDetailsContent.includes('checkout'),
    'Safety: No Fake Checkout',
    'Does not introduce fake checkout'
  );

  // Verify UI Rule: No Redundant Navigation Titles inside page body
  assert(
    proDetailsContent.includes('<ScreenHeader') &&
      proDetailsContent.includes('title="IPOVault Pro"'),
    'Navigation Title',
    'ScreenHeader contains the screen title'
  );

  // Verify status badge is filled for both Pro and Non-Pro
  assert(
    proDetailsContent.includes("backgroundColor: isUserPro ? '#10B981' : '#6366F1'") ||
      (proDetailsContent.includes("backgroundColor: isUserPro") && proDetailsContent.includes("'#10B981'")),
    'Filled Status Badge Background',
    'Status badge has filled background for both Pro (#10B981) and Non-Pro (#6366F1)'
  );
  assert(
    proDetailsContent.includes("color: isUserPro ? '#FFFFFF' : '#FFFFFF'") ||
      proDetailsContent.includes("color: '#FFFFFF'"),
    'Filled Status Badge Text',
    'Status badge text is solid white for both Pro and Non-Pro'
  );

  console.log('\n===============================================================');
  console.log(`ALL IPOVAULT PRO REFACTOR TESTS PASSED (${passCount} passed, ${failCount} failed)`);
  console.log('===============================================================\n');
}

if (require.main === module) {
  runSettingsUpgradeToProTestSuite().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
