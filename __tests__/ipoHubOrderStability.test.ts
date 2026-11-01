import { BackendIpo } from '../types/backend-ipo';
import { isRecordDifferent, mapBackendIpoToRecord } from '../services/ipo/ipoHubCacheService';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
    passCount++;
  } else {
    console.error(`✗ FAIL: [${testName}] ${detail}`);
    failCount++;
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

// Mirror parseIpoDateToTimestamp from app/new-ipos.tsx
function parseIpoDateToTimestamp(str?: string | null): number {
  if (!str) return Infinity;
  const clean = str.trim();
  if (!clean || clean.toUpperCase() === 'TBA' || clean.toUpperCase() === 'N/A') return Infinity;

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(clean)) {
    const parts = clean.split(/[-/]/);
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(Date.UTC(year, month, day));
    return isNaN(d.getTime()) ? Infinity : d.getTime();
  }

  // YYYY-MM-DD or ISO string
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(clean)) {
    const datePart = clean.split('T')[0];
    const parts = datePart.split(/[-/]/);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(Date.UTC(year, month, day));
    return isNaN(d.getTime()) ? Infinity : d.getTime();
  }

  const d = new Date(clean);
  return isNaN(d.getTime()) ? Infinity : d.getTime();
}

function sortIposTimeline(list: BackendIpo[]): BackendIpo[] {
  return [...list].sort((a, b) => {
    const tA = parseIpoDateToTimestamp(a.openDate || a.lifecycle?.openDate);
    const tB = parseIpoDateToTimestamp(b.openDate || b.lifecycle?.openDate);
    if (tA !== tB) {
      if (tA === Infinity) return 1;
      if (tB === Infinity) return -1;
      return tB - tA; // DESC: newest open dates first
    }
    const nameA = (a.company?.displayName || a.companyName || a.symbol || '').toLowerCase();
    const nameB = (b.company?.displayName || b.companyName || b.symbol || '').toLowerCase();
    const nameCmp = nameA.localeCompare(nameB);
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  });
}

export function runIpoHubOrderStabilityTests() {
  console.log('========================================================================');
  console.log('RUNNING IPO HUB ORDER STABILITY & REFRESH PREVENTION TESTS');
  console.log('========================================================================\n');

  // --- 1. Date Format Timestamp Consistency ---
  const tIso = parseIpoDateToTimestamp('2026-10-25');
  const tDmy = parseIpoDateToTimestamp('25-10-2026');
  const tSlash = parseIpoDateToTimestamp('25/10/2026');
  const tIsoFull = parseIpoDateToTimestamp('2026-10-25T00:00:00.000Z');

  assert(tIso === tDmy, 'Date Parse UTC', 'YYYY-MM-DD and DD-MM-YYYY parse to exact same UTC timestamp');
  assert(tIso === tSlash, 'Date Slash Parse', 'DD/MM/YYYY parses to exact same UTC timestamp');
  assert(tIso === tIsoFull, 'Date ISO Full Parse', 'Full ISO string parses to exact same UTC timestamp');
  assert(parseIpoDateToTimestamp(null) === Infinity, 'Null Date', 'Null date parses to Infinity');
  assert(parseIpoDateToTimestamp('TBA') === Infinity, 'TBA Date', 'TBA parses to Infinity');

  // --- 2. Deterministic Position Stability Across Renders ---
  const ipoListA: BackendIpo[] = [
    {
      id: 'ipo-1',
      symbol: 'ALPHA',
      companyName: 'Alpha Tech Ltd',
      status: 'OPEN',
      marketSegment: 'MAINBOARD',
      openDate: '25-10-2026', // Formatted from SQLite
    },
    {
      id: 'ipo-2',
      symbol: 'BETA',
      companyName: 'Beta Energy Ltd',
      status: 'OPEN',
      marketSegment: 'MAINBOARD',
      openDate: '2026-10-25', // Formatted from backend API
    },
    {
      id: 'ipo-3',
      symbol: 'GAMMA',
      companyName: 'Gamma Healthcare Ltd',
      status: 'OPEN',
      marketSegment: 'MAINBOARD',
      openDate: '2026-10-28',
    },
  ];

  // Simulating second load where dates might come in ISO format from backend
  const ipoListB: BackendIpo[] = [
    {
      id: 'ipo-2',
      symbol: 'BETA',
      companyName: 'Beta Energy Ltd',
      status: 'OPEN',
      marketSegment: 'MAINBOARD',
      openDate: '2026-10-25T00:00:00.000Z',
    },
    {
      id: 'ipo-3',
      symbol: 'GAMMA',
      companyName: 'Gamma Healthcare Ltd',
      status: 'OPEN',
      marketSegment: 'MAINBOARD',
      openDate: '28-10-2026',
    },
    {
      id: 'ipo-1',
      symbol: 'ALPHA',
      companyName: 'Alpha Tech Ltd',
      status: 'OPEN',
      marketSegment: 'MAINBOARD',
      openDate: '2026-10-25',
    },
  ];

  const sortedA = sortIposTimeline(ipoListA);
  const sortedB = sortIposTimeline(ipoListB);

  assert(sortedA[0].id === 'ipo-3', 'Order A 1st', 'Newest open date (Gamma 28th) is 1st');
  assert(sortedA[1].id === 'ipo-1', 'Order A 2nd', 'Tie-breaker for 25th: Alpha Tech before Beta Energy');
  assert(sortedA[2].id === 'ipo-2', 'Order A 3rd', 'Beta Energy is 3rd');

  assert(sortedB[0].id === 'ipo-3', 'Order B 1st', 'Gamma remains 1st regardless of input order or date format');
  assert(sortedB[1].id === 'ipo-1', 'Order B 2nd', 'Alpha remains 2nd (no position flipping)');
  assert(sortedB[2].id === 'ipo-2', 'Order B 3rd', 'Beta remains 3rd (no position flipping)');

  // --- 3. Reconciliation Idempotency & Zero False Positives ---
  const existingSqliteRow = {
    id: 'ipo-1',
    company_name: 'Alpha Tech Ltd',
    symbol: 'ALPHA',
    status: 'OPEN',
    lifecycle_status: 'OPEN',
    market_segment: 'MAINBOARD',
    open_date: '2026-10-25',
    close_date: '2026-10-28',
    price_band_min: 100,
    price_band_max: 105,
    lot_size: 100,
    gmp_amount: 25,
    gmp_percent: 23.8,
    gmp_updated_at: '2026-10-29T10:00:00.000Z',
    financials_json: null,
    documents_json: '',
    participants_json: '[]',
    anchor_details_json: null,
    logo_url: 'https://res.cloudinary.com/demo/image/upload/logo.png',
  };

  const incomingBackendRecord = mapBackendIpoToRecord({
    id: 'ipo-1',
    symbol: 'ALPHA',
    companyName: 'Alpha Tech Ltd',
    status: 'OPEN',
      marketSegment: 'MAINBOARD',
    openDate: '2026-10-25',
    closeDate: '2026-10-28',
    priceBandLow: 100,
    priceBandHigh: 105,
    lotSize: 100,
    currentGmp: {
      gmpAmount: 25,
      gmpPercentage: 23.8,
      observedAt: '2026-10-29T10:00:00Z', // Different ISO format representation (without .000)
    },
    company: {
      displayName: 'Alpha Tech Ltd',
      logoUrl: 'https://res.cloudinary.com/demo/image/upload/e_trim/logo.png', // With e_trim
      financials: [], // Empty array
    },
    documents: [],
    participants: [],
  });

  const isDiff = isRecordDifferent(existingSqliteRow, incomingBackendRecord);
  assert(isDiff === false, 'Reconciliation False-Positive Guard', 'isRecordDifferent correctly detects ZERO changes between SQLite row and API payload');

  // --- 4. Genuine Change Detection ---
  const modifiedIncoming = { ...incomingBackendRecord, gmp_amount: 30 };
  const isDiffModified = isRecordDifferent(existingSqliteRow, modifiedIncoming);
  assert(isDiffModified === true, 'Reconciliation Real Change', 'isRecordDifferent detects genuine GMP change (25 -> 30)');

  console.log(`\n=================================================================`);
  console.log(`IPO Hub Order Stability Tests Complete: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`=================================================================\n`);
}

if (require.main === module) {
  runIpoHubOrderStabilityTests();
}

