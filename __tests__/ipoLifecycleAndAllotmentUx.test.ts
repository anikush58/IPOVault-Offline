import {
  evaluateLifecycle,
  calculateNormalizedIPOStatus,
  normalizeLifecycleStatus,
  getLifecycleStatusLabel,
  getISTDateTime,
} from '../services/ipo/statusNormalizer';
import { getRegistrarConfig } from '../services/allotment/registrarConfig';
import { isBackendIpoAllotmentEligible } from '../services/allotment/allotmentCheckerIpoSource';
import { isRecordDifferent } from '../services/ipo/ipoHubCacheService';

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

export async function runIpoLifecycleAndUxTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING IPO LIFECYCLE & ALLOTMENT UX REGRESSION TEST SUITE');
  console.log('===============================================================\n');

  // ── 1. IPO Status Lifecycle: Closed -> Allotment Awaited on Allotment Date -> Allotment Out ──
  {
    const baseIpo = {
      open_date: '2026-10-15',
      close_date: '2026-10-19',
      allotment_date: '2026-10-22',
      listing_date: '2026-10-25',
    };

    // 1.1 While bidding is open
    const statusDuringBidding = calculateNormalizedIPOStatus({ ...baseIpo, status: 'OPEN' }, '2026-10-16');
    assert(statusDuringBidding === 'OPEN', 'Lifecycle 1.1', 'Status during bidding window is OPEN');

    // 1.2 On closing day before 17:00 IST
    const statusClosingMorning = calculateNormalizedIPOStatus(
      { ...baseIpo, status: 'OPEN' },
      '2026-10-19',
      { hours: 16, minutes: 45 }
    );
    assert(statusClosingMorning === 'CLOSING_TODAY', 'Lifecycle 1.2', 'Status on closing day at 16:45 IST is CLOSING_TODAY');

    // 1.3 On closing day at/after 17:00 IST
    const statusClosingEvening = calculateNormalizedIPOStatus(
      { ...baseIpo, status: 'OPEN' },
      '2026-10-19',
      { hours: 17, minutes: 0 }
    );
    assert(statusClosingEvening === 'CLOSED', 'Lifecycle 1.3', 'Status on closing day at 17:00 IST is CLOSED');

    // 1.4 Post-close, BEFORE configured allotment date (2026-10-20 & 2026-10-21)
    const statusDayAfterClose = calculateNormalizedIPOStatus({ ...baseIpo, status: 'CLOSED' }, '2026-10-20');
    assert(
      statusDayAfterClose === 'CLOSED',
      'Lifecycle 1.4a',
      'Day after close remains CLOSED when allotment date is in the future'
    );
    assert(
      getLifecycleStatusLabel(statusDayAfterClose) === 'Closed',
      'Lifecycle 1.4b',
      'User-facing label is "Closed"'
    );

    const statusEveOfAllotment = calculateNormalizedIPOStatus({ ...baseIpo, status: 'CLOSED' }, '2026-10-21');
    assert(
      statusEveOfAllotment === 'CLOSED',
      'Lifecycle 1.4c',
      'Eve of allotment date remains CLOSED'
    );

    // 1.5 ON configured allotment date (2026-10-22) -> transitions to ALLOTTED_PENDING ("Allotment Awaited")
    const statusOnAllotmentDate = calculateNormalizedIPOStatus({ ...baseIpo, status: 'CLOSED' }, '2026-10-22');
    assert(
      statusOnAllotmentDate === 'ALLOTTED_PENDING',
      'Lifecycle 1.5a',
      'Transitions to ALLOTTED_PENDING on configured allotment date'
    );
    assert(
      getLifecycleStatusLabel(statusOnAllotmentDate) === 'Allotment Awaited',
      'Lifecycle 1.5b',
      'User-facing label is "Allotment Awaited"'
    );

    // 1.6 Days AFTER configured allotment date without backend declaration -> MUST STAY ALLOTTED_PENDING
    const statusAfterAllotmentDate = calculateNormalizedIPOStatus({ ...baseIpo, status: 'CLOSED' }, '2026-10-23');
    assert(
      statusAfterAllotmentDate === 'ALLOTTED_PENDING',
      'Lifecycle 1.6a',
      'Passage of allotment date NEVER automatically marks allotment as out'
    );

    const statusTwoDaysAfter = calculateNormalizedIPOStatus({ ...baseIpo, status: 'CLOSED' }, '2026-10-24');
    assert(
      statusTwoDaysAfter === 'ALLOTTED_PENDING',
      'Lifecycle 1.6b',
      'Remains ALLOTTED_PENDING until official backend declaration'
    );

    // 1.7 Official backend declaration of allotment out -> ALLOTTED_AVAILABLE ("Allotment Out")
    const statusDeclaredOut = calculateNormalizedIPOStatus({ ...baseIpo, status: 'ALLOTMENT_OUT' }, '2026-10-23');
    assert(
      statusDeclaredOut === 'ALLOTTED_AVAILABLE',
      'Lifecycle 1.7a',
      'Transitions to ALLOTTED_AVAILABLE upon authoritative backend declaration'
    );
    assert(
      getLifecycleStatusLabel(statusDeclaredOut) === 'Allotment Out',
      'Lifecycle 1.7b',
      'User-facing label is "Allotment Out"'
    );

    // 1.8 Support camelCase date properties and nested lifecycle object
    const camelCaseRecord = {
      status: 'CLOSED',
      openDate: '2026-10-15',
      closeDate: '2026-10-19',
      allotmentDate: '2026-10-22',
      listingDate: '2026-10-25',
    };
    const camelBefore = calculateNormalizedIPOStatus(camelCaseRecord, '2026-10-20');
    assert(camelBefore === 'CLOSED', 'Lifecycle 1.8a', 'camelCase allotmentDate recognized before allotment date');
    const camelOnDate = calculateNormalizedIPOStatus(camelCaseRecord, '2026-10-22');
    assert(camelOnDate === 'ALLOTTED_PENDING', 'Lifecycle 1.8b', 'camelCase allotmentDate recognized on allotment date');
  }

  // ── 2. Registrar Portal Fallback Until Allotment Is Out ──
  {
    // 2.1 Backend IPO eligibility predicate
    const closedIpo = {
      id: 'ipo-1',
      company_name: 'Tech Corp',
      status: 'CLOSED',
      registrar: 'KFin Technologies',
    };
    const awaitedIpo = {
      id: 'ipo-2',
      company_name: 'Health Corp',
      status: 'ALLOTMENT_PENDING',
      registrar: 'Link Intime',
    };
    const outIpo = {
      id: 'ipo-3',
      company_name: 'Solar Corp',
      status: 'ALLOTMENT_OUT',
      registrar: 'Bigshare',
    };
    const listedIpo = {
      id: 'ipo-4',
      company_name: 'Energy Corp',
      status: 'LISTED',
      registrar: 'Maashitla',
    };

    assert(!isBackendIpoAllotmentEligible(closedIpo as any), 'Registrar 2.1a', 'CLOSED IPO is NOT eligible for automated check');
    assert(!isBackendIpoAllotmentEligible(awaitedIpo as any), 'Registrar 2.1b', 'ALLOTMENT_PENDING IPO is NOT eligible for automated check');
    assert(isBackendIpoAllotmentEligible(outIpo as any), 'Registrar 2.1c', 'ALLOTMENT_OUT IPO IS eligible for automated check');
    assert(isBackendIpoAllotmentEligible(listedIpo as any), 'Registrar 2.1d', 'LISTED IPO IS eligible for automated check');

    // 2.2 Registrar resolution and verified official URLs
    const kfinConfig = getRegistrarConfig('KFin Technologies Limited');
    assert(kfinConfig.url === 'https://ris.kfintech.com/ipostatus/', 'Registrar 2.2a', 'KFintech official portal verified');

    const linkConfig = getRegistrarConfig('Link Intime India Pvt Ltd');
    assert(linkConfig.url === 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html', 'Registrar 2.2b', 'MUFG/Link Intime official portal verified');

    const bigshareConfig = getRegistrarConfig('Bigshare Services');
    assert(bigshareConfig.url === 'https://www.bigshareonline.com/ipo_allotment.html', 'Registrar 2.2c', 'Bigshare official portal verified');

    const maashitlaConfig = getRegistrarConfig('Maashitla Securities');
    assert(maashitlaConfig.url === 'https://maashitla.com/', 'Registrar 2.2d', 'Maashitla official portal verified');

    const purvaConfig = getRegistrarConfig('Purva Sharegistry');
    assert(purvaConfig.url === 'https://www.purvashare.com/investor-service/ipo-query', 'Registrar 2.2e', 'Purva official portal verified');

    const skylineConfig = getRegistrarConfig('Skyline Financial');
    assert(skylineConfig.url === 'https://www.skylinerta.com/ipo.php', 'Registrar 2.2f', 'Skyline official portal verified');

    const unknownConfig = getRegistrarConfig('Unknown Registrar Ltd');
    assert(unknownConfig.url === 'https://www.bseindia.com/investors/appli_check.aspx', 'Registrar 2.2g', 'Unknown registrar safely falls back to BSE portal');
  }

  // ── 3. Stable SQLite Cache Updates & Change Detection ──
  {
    const existingRow = {
      id: 'ipo-test-100',
      company_name: 'Existing IPO Ltd',
      status: 'OPEN',
      open_date: '2026-10-15',
      close_date: '2026-10-19',
      allotment_date: '2026-10-22',
      price_band_min: 100,
      price_band_max: 105,
      lot_size: 140,
      gmp_amount: 25,
      total_sub: 3.5,
    };

    // Identical record -> NO change detected (prevents re-render / list jumping)
    const identicalIncoming = {
      id: 'ipo-test-100',
      company_name: 'Existing IPO Ltd',
      status: 'OPEN',
      open_date: '2026-10-15',
      close_date: '2026-10-19',
      allotment_date: '2026-10-22',
      price_band_min: 100,
      price_band_max: 105,
      lot_size: 140,
      gmp_amount: 25,
      total_sub: 3.5,
    };
    assert(!isRecordDifferent(existingRow, identicalIncoming), 'Cache 3.1', 'Identical incoming record does not trigger changes');

    // Real change in GMP -> change detected
    const gmpChangedIncoming = { ...identicalIncoming, gmp_amount: 30 };
    assert(isRecordDifferent(existingRow, gmpChangedIncoming), 'Cache 3.2', 'Meaningful GMP change triggers reconciliation update');

    // Real change in Status -> change detected
    const statusChangedIncoming = { ...identicalIncoming, status: 'CLOSED' };
    assert(isRecordDifferent(existingRow, statusChangedIncoming), 'Cache 3.3', 'Status transition triggers reconciliation update');
  }

  // ── 4. IST Date and Time Boundary Validation ──
  {
    const ist = getISTDateTime();
    assert(typeof ist.istDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ist.istDate), 'IST 4.1', `Valid IST Date: ${ist.istDate}`);
    assert(typeof ist.istHours === 'number' && ist.istHours >= 0 && ist.istHours <= 23, 'IST 4.2', `Valid IST Hour: ${ist.istHours}`);
    assert(typeof ist.istMinutes === 'number' && ist.istMinutes >= 0 && ist.istMinutes <= 59, 'IST 4.3', `Valid IST Minute: ${ist.istMinutes}`);
  }

  console.log(`\n===============================================================`);
  console.log(`SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`===============================================================\n`);
}

// Auto-run if executed directly via node/ts-node
if (require.main === module) {
  runIpoLifecycleAndUxTestSuite().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
