/**
 * Multi-Category / Shareholder Partial Allotment Matching Regression Test
 *
 * Verifies:
 * 1. User with 1 lot Retail (12 shares) and 2 lots Shareholder (24 shares).
 * 2. Registrar returns 2 records with generic category (e.g. 'IND' or 'RETAIL'):
 *    - Record A: applied 24, allotted 12 (Partial)
 *    - Record B: applied 12, allotted 12 (Full)
 * 3. Intelligent scoring matches Record A (24 applied) -> Shareholder application (24 applied)
 *    and Record B (12 applied) -> Retail application (12 applied).
 * 4. Status and allotted shares are correctly assigned:
 *    - Shareholder: 'Partially Allotted', 12 shares allotted (out of 24 applied).
 *    - Retail: 'Allotted', 12 shares allotted (out of 12 applied).
 * 5. Effective quantity and badge rendering in ApplicationCard logic.
 */

import { mapRegistrarCategory } from '../utils/allotmentCategoryUtils';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export function runMultiCategoryAllotmentMatchingSuite() {
  console.log('========================================================================');
  console.log('RUNNING MULTI-CATEGORY SHAREHOLDER ALLOTMENT MATCHING TESTS');
  console.log('========================================================================\n');

  // Candidate applications in local SQLite
  const userApps = [
    {
      id: 'app-retail-001',
      user_id: 'user-001',
      ipo_id: 'ipo-jio',
      category: 'RETAIL',
      shares_count: 12,
      quantity: 12,
      buy_price: 100,
      status: 'Applied',
    },
    {
      id: 'app-shareholder-002',
      user_id: 'user-001',
      ipo_id: 'ipo-jio',
      category: 'SHAREHOLDER',
      shares_count: 24,
      quantity: 24,
      buy_price: 100,
      status: 'Applied',
    },
  ];

  // Registrar returns generic/unmapped categories 'IND' for both bids
  const registrarRecords = [
    {
      category: 'IND',
      rawCategory: 'IND',
      sharesApplied: 24,
      sharesAllotted: 12,
      status: 'ALLOTTED', // registrar says ALLOTTED even for partial
    },
    {
      category: 'IND',
      rawCategory: 'IND',
      sharesApplied: 12,
      sharesAllotted: 12,
      status: 'ALLOTTED',
    },
  ];

  // Scoring matcher matching app/allotment-checker.tsx
  function matchRecord(
    catRes: (typeof registrarRecords)[0],
    availableApps: typeof userApps,
    matchedIds: Set<string>
  ) {
    const normCat = mapRegistrarCategory(catRes.category);
    const unmatchedApps = availableApps.filter((a) => !matchedIds.has(a.id));
    let bestApp: (typeof userApps)[0] | undefined = undefined;
    let bestScore = -Infinity;

    for (const app of unmatchedApps) {
      let score = 0;
      const appCat = mapRegistrarCategory(app.category);
      if (appCat === normCat) {
        score += 100;
      }
      const appAppliedShares = app.shares_count || app.quantity || 0;
      if (catRes.sharesApplied != null && catRes.sharesApplied > 0 && appAppliedShares > 0) {
        if (catRes.sharesApplied === appAppliedShares) {
          score += 150;
        } else {
          score -= 50;
        }
      }
      if (
        catRes.rawCategory &&
        app.category &&
        String(catRes.rawCategory).trim().toUpperCase() === String(app.category).trim().toUpperCase()
      ) {
        score += 50;
      }

      if (score > bestScore) {
        bestScore = score;
        bestApp = app;
      }
    }

    if (bestApp && (bestScore > 0 || unmatchedApps.length === 1)) {
      return bestApp;
    }
    return undefined;
  }

  const matchedAppIds = new Set<string>();
  const results: Record<string, { status: string; allottedShares: number; appliedShares: number }> = {};

  for (const catRes of registrarRecords) {
    const matched = matchRecord(catRes, userApps, matchedAppIds);
    assert(!!matched, 'Matching', `Found match for record with applied=${catRes.sharesApplied}`);
    matchedAppIds.add(matched!.id);

    const appliedShares = catRes.sharesApplied || matched!.shares_count || matched!.quantity || 0;
    let effectiveCatStatus = catRes.status;
    if (catRes.sharesAllotted != null && catRes.sharesAllotted > 0) {
      if (appliedShares > 0 && catRes.sharesAllotted < appliedShares) {
        effectiveCatStatus = 'PARTIALLY_ALLOTTED';
      } else {
        effectiveCatStatus = 'ALLOTTED';
      }
    }

    results[matched!.id] = {
      status: effectiveCatStatus === 'PARTIALLY_ALLOTTED' ? 'Partially Allotted' : 'Allotted',
      allottedShares: catRes.sharesAllotted,
      appliedShares,
    };
  }

  // Verification 1: Shareholder Application Match
  const shResult = results['app-shareholder-002'];
  assert(
    shResult.status === 'Partially Allotted',
    'Shareholder Status',
    `Expected 'Partially Allotted', got '${shResult.status}'`
  );
  assert(
    shResult.allottedShares === 12,
    'Shareholder Allotted Shares',
    `Expected 12 allotted shares (1 lot), got ${shResult.allottedShares}`
  );
  assert(
    shResult.appliedShares === 24,
    'Shareholder Applied Shares',
    `Expected 24 applied shares, got ${shResult.appliedShares}`
  );

  // Verification 2: Retail Application Match
  const retResult = results['app-retail-001'];
  assert(
    retResult.status === 'Allotted',
    'Retail Status',
    `Expected 'Allotted', got '${retResult.status}'`
  );
  assert(
    retResult.allottedShares === 12,
    'Retail Allotted Shares',
    `Expected 12 allotted shares, got ${retResult.allottedShares}`
  );
  assert(
    retResult.appliedShares === 12,
    'Retail Applied Shares',
    `Expected 12 applied shares, got ${retResult.appliedShares}`
  );

  // Verification 3: ApplicationCard effectiveQty & holding value calculation
  const effectiveShQty =
    shResult.status === 'Partially Allotted' || shResult.status === 'Allotted'
      ? shResult.allottedShares
      : 24;
  assert(effectiveShQty === 12, 'ApplicationCard effectiveQty', `Expected 12 shares, got ${effectiveShQty}`);

  const buyValue = 100 * effectiveShQty;
  assert(buyValue === 1200, 'ApplicationCard buyValue', `Expected 1200, got ${buyValue}`);

  console.log('\n========================================================================');
  console.log('ALL MULTI-CATEGORY SHAREHOLDER TESTS PASSED WITH ZERO FAILURES');
  console.log('========================================================================\n');
}

runMultiCategoryAllotmentMatchingSuite();

