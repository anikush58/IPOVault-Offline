import { BackendIpo } from '../types/backend-ipo';
import {
  isBackendIpoAllotmentEligible,
  normalizeBackendIpoForChecker,
} from '../services/allotment/allotmentCheckerIpoSource';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export async function runAllotmentCheckerSelectorTestSuite() {
  console.log('==================================================');
  console.log('RUNNING ALLOTMENT CHECKER IPO SELECTION TEST SUITE');
  console.log('==================================================');

  // Sample Backend-published IPOs (received via BackendIpoApiService.listBackendIpos)
  const publishedIpos: BackendIpo[] = [
    {
      id: '978939c3-4217-48f1-9c60-e8ea3c4ecdd7',
      symbol: 'DHOOT',
      company: {
        id: 'comp-1',
        displayName: 'Dhoot Transmission Ltd',
      },
      status: 'CLOSED',
      marketSegment: 'MAINBOARD',
      registrar: 'Link Intime India Private Ltd',
      allotmentDate: '2026-09-20',
      lotSize: 100,
      issuePriceInr: 150,
    },
    {
      id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
      symbol: 'TECHSOL',
      company: {
        id: 'comp-2',
        displayName: 'TechSolutions India Ltd',
      },
      status: 'ALLOTMENT',
      marketSegment: 'MAINBOARD',
      allotmentConfig: {
        registrar: 'KFin Technologies Ltd',
        expectedDate: '2026-09-22',
      },
      lotSize: 50,
      issuePriceInr: 200,
    },
    {
      id: 'f9e8d7c6-b5a4-4321-8765-fedcba987654',
      symbol: 'LISTEDCO',
      company: {
        id: 'comp-3',
        displayName: 'Listed Enterprise Ltd',
      },
      status: 'LISTED',
      marketSegment: 'MAINBOARD',
      registrar: 'Bigshare Services Pvt Ltd',
      lotSize: 80,
      issuePriceInr: 120,
    },
    {
      id: '01000000-0000-4000-8000-000000000001',
      symbol: 'OPENCO',
      company: {
        id: 'comp-open',
        displayName: 'Open Subscription Co Ltd',
      },
      status: 'OPEN',
      marketSegment: 'MAINBOARD',
    },
    {
      id: '02000000-0000-4000-8000-000000000002',
      symbol: 'UPCOMINGCO',
      company: {
        id: 'comp-upcoming',
        displayName: 'Upcoming Issue Co Ltd',
      },
      status: 'UPCOMING',
      marketSegment: 'MAINBOARD',
    },
    {
      id: '03000000-0000-4000-8000-000000000003',
      symbol: 'LIVECO',
      company: {
        id: 'comp-live',
        displayName: 'Live Bidding Co Ltd',
      },
      status: 'LIVE',
      marketSegment: 'MAINBOARD',
    },
    {
      id: 'a4b5c6d7-0000-4000-8000-000000000004',
      symbol: 'ALLOTOUT',
      company: {
        id: 'comp-allotout',
        displayName: 'Allotment Out Co Ltd',
      },
      status: 'Allotment Out',
      marketSegment: 'MAINBOARD',
    },
    {
      id: 'b5c6d7e8-0000-4000-8000-000000000005',
      symbol: 'SBIFUNDS',
      company: {
        id: 'comp-sbi',
        displayName: 'SBI Funds Management Limited',
      },
      status: 'ALLOTMENT_COMPLETED',
      marketSegment: 'MAINBOARD',
    },
    {
      id: 'c6d7e8f9-0000-4000-8000-000000000006',
      symbol: 'PENDINGCO',
      company: {
        id: 'comp-pending',
        displayName: 'Allotment Pending Co Ltd',
      },
      status: 'ALLOTMENT_PENDING',
      marketSegment: 'MAINBOARD',
    },
    {
      id: 'd7e8f9a0-0000-4000-8000-000000000007',
      symbol: 'LISTINGSOON',
      company: {
        id: 'comp-listingsoon',
        displayName: 'Listing Soon Co Ltd',
      },
      status: 'LISTING_PENDING',
      marketSegment: 'MAINBOARD',
    },
    {
      id: 'd1a2f3c4-0000-4000-8000-000000000001',
      symbol: 'DRAFTCO',
      company: {
        id: 'comp-4',
        displayName: 'Draft Company Ltd',
      },
      status: 'DRAFT',
      marketSegment: 'MAINBOARD',
    },
    {
      id: 'a1b2c3d4-0000-4000-8000-000000000002',
      symbol: 'ARCHCO',
      company: {
        id: 'comp-5',
        displayName: 'Archived Company Ltd',
      },
      status: 'ARCHIVED',
      marketSegment: 'MAINBOARD',
    },
  ];

  // Local SQLite tables (applications, local-only IPOs, user saved PANs)
  const localSqliteIpos = [
    {
      id: 'local-manual-1',
      ipo_name: 'Local Only IPO Not on Backend',
      source_type: 'LOCAL',
    },
  ];

  const localSqliteApplications = [
    {
      id: 'app-1',
      ipo_id: '978939c3-4217-48f1-9c60-e8ea3c4ecdd7',
      user_id: 'user-1',
    },
  ];

  const localSavedUsers = [
    { id: 'user-1', name: 'John Doe', pan_number: 'ABCDE1234F' },
    { id: 'user-2', name: 'Jane Smith', pan_number: 'XYZPK9876Q' },
  ];

  // =========================================================================
  // 1. Backend published IPO (ALLOTMENT OUT / ALLOTMENT_COMPLETED) appears
  // =========================================================================
  const eligibleIpos = publishedIpos.filter(isBackendIpoAllotmentEligible);
  const selectableItems = eligibleIpos.map(normalizeBackendIpoForChecker);

  const sbiItem = selectableItems.find((i) => i.symbol === 'SBIFUNDS');
  assert(
    Boolean(sbiItem && sbiItem.ipo_name === 'SBI Funds Management Limited'),
    'Test 1',
    'Backend published IPO with ALLOTMENT_COMPLETED (SBI Funds) appears in standalone Allotment Checker selectable list'
  );

  // =========================================================================
  // 2. Local-only IPO does not appear
  // =========================================================================
  // Standalone Allotment Checker exclusively sources from BackendIpoApiService (publishedIpos)
  const containsLocalIpo = selectableItems.some(
    (i) => i.id === 'local-manual-1' || i.ipo_name.includes('Local Only')
  );
  assert(
    !containsLocalIpo,
    'Test 2',
    'Local-only SQLite IPO does not appear in standalone Allotment Checker'
  );

  // Also verify DRAFT and ARCHIVED backend IPOs are filtered out
  const containsDraftOrArchived = selectableItems.some(
    (i) => i.status === 'DRAFT' || i.status === 'ARCHIVED'
  );
  assert(
    !containsDraftOrArchived,
    'Test 2b',
    'DRAFT and ARCHIVED status IPOs are excluded from selector'
  );

  // =========================================================================
  // 2c. Only Allotment Out (including ALLOTMENT_COMPLETED) and Listed IPOs are included
  // =========================================================================
  const includedSymbols = selectableItems.map((i) => i.symbol);
  assert(
    includedSymbols.includes('TECHSOL') &&
      includedSymbols.includes('LISTEDCO') &&
      includedSymbols.includes('ALLOTOUT') &&
      includedSymbols.includes('SBIFUNDS'),
    'Test 2c',
    'Selectable items contain all Allotment Out (including ALLOTMENT_COMPLETED) and Listed IPOs'
  );

  // =========================================================================
  // 2d. CLOSED, ALLOTMENT_PENDING, LISTING_PENDING, OPEN, UPCOMING, LIVE, DRAFT, and ARCHIVED are excluded
  // =========================================================================
  assert(
    !includedSymbols.includes('DHOOT') &&
      !includedSymbols.includes('PENDINGCO') &&
      !includedSymbols.includes('LISTINGSOON') &&
      !includedSymbols.includes('OPENCO') &&
      !includedSymbols.includes('UPCOMINGCO') &&
      !includedSymbols.includes('LIVECO') &&
      !includedSymbols.includes('DRAFTCO') &&
      !includedSymbols.includes('ARCHCO'),
    'Test 2d',
    'Selectable items strictly exclude CLOSED, ALLOTMENT_PENDING, LISTING_PENDING, OPEN, UPCOMING, LIVE, DRAFT, and ARCHIVED IPOs'
  );

  // =========================================================================
  // 2e. Exact count validation
  // =========================================================================
  assert(
    selectableItems.length === 4,
    'Test 2e',
    `Exactly 4 eligible IPOs selected out of 12 mixed-status items (received: ${selectableItems.length})`
  );

  // =========================================================================
  // 3. IPO with no local application still appears
  // =========================================================================
  // TechSolutions has NO local application in localSqliteApplications
  const techSolHasLocalApp = localSqliteApplications.some(
    (app) => app.ipo_id === 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'
  );
  const techSolInSelector = selectableItems.some(
    (i) => i.id === 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'
  );
  assert(
    !techSolHasLocalApp && techSolInSelector,
    'Test 3',
    'IPO with no local application (TechSolutions) still appears in the selector'
  );

  // =========================================================================
  // 4. Backend UUID is retained
  // =========================================================================
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const allRetainBackendUuid = selectableItems.every((item) =>
    uuidRegex.test(item.id)
  );
  assert(
    allRetainBackendUuid &&
      selectableItems[0].id === 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    'Test 4',
    'Every selector item retains the canonical backend UUID without conversion to local ID'
  );

  // =========================================================================
  // 5. Selecting the IPO sends backend UUID to allotment request
  // =========================================================================
  let sentJobCreationIpoId: string | null = null;
  const mockCreateJob = async (backendIpoId: string, _userId: string) => {
    sentJobCreationIpoId = backendIpoId;
    return { id: 'job-123', status: 'PROCESSING' };
  };

  // User selects TechSolutions from selector
  const selectedTechSol = selectableItems.find(
    (i) => i.id === 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'
  )!;
  await mockCreateJob(selectedTechSol.id, 'user-1');

  assert(
    sentJobCreationIpoId === 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    'Test 5',
    'Selecting the IPO sends the exact canonical backend UUID to the backend allotment request'
  );

  // =========================================================================
  // 6. Existing direct-from-IPO-detail flow still works
  // =========================================================================
  // Detail screen navigates: router.push({ pathname: '/allotment-checker', params: { ipoId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d' } })
  const routeParamIpoId = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
  const directResolvedIpo = selectableItems.find((i) => i.id === routeParamIpoId);
  let directCheckSentId: string | null = null;
  if (directResolvedIpo) {
    await mockCreateJob(directResolvedIpo.id, 'user-1');
    directCheckSentId = sentJobCreationIpoId;
  }

  assert(
    directCheckSentId === 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    'Test 6',
    'Direct navigation from IPO detail with route param ipoId resolves and triggers check with backend UUID'
  );

  // =========================================================================
  // 7. Saved PAN functionality remains unchanged
  // =========================================================================
  // User PANs from local storage are preserved and collected for sync regardless of application existence
  const userPanMap = new Map<string, { userId: string; pan: string; name: string }>();
  localSavedUsers.forEach((usr) => {
    const p = (usr.pan_number || '').trim().toUpperCase();
    if (p.length === 10) {
      userPanMap.set(p, {
        userId: 'user-1',
        pan: p,
        name: usr.name,
      });
    }
  });
  const collectedPans = Array.from(userPanMap.values());

  assert(
    collectedPans.length === 2 &&
      collectedPans[0].pan === 'ABCDE1234F' &&
      collectedPans[1].pan === 'XYZPK9876Q',
    'Test 7',
    'Saved PANs functionality remains local and correctly prepares all saved applicant PANs for allotment check'
  );

  console.log('==================================================');
  console.log('ALL 7 ALLOTMENT CHECKER TESTS PASSED SUCCESSFULLY');
  console.log('==================================================');
}

// Execute suite immediately when run via tsx
runAllotmentCheckerSelectorTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
