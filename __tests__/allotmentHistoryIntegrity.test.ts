/**
 * Allotment History Integrity & Issue-Date Sorting Regression Test Suite
 *
 * Covers:
 * 1. Only verified positive-share allotments are displayed (ALLOTTED & PARTIALLY_ALLOTTED with shares > 0).
 * 2. Zero-share and non-allotted records are completely excluded (NOT_ALLOTTED, NO_RECORD, Applied, etc.).
 * 3. Never infer allotment from IPO application quantity, applied lots, or status alone.
 * 4. Latest IPO issue/opening date appears first, even when an older IPO was checked more recently.
 * 5. Records for the same IPO are grouped together and ordered by check timestamp (newest first).
 * 6. Missing IPO opening dates are handled deterministically without fabricated dates.
 * 7. Legitimate historical allotments remain visible across different IPOs and users/PANs without contamination.
 * 8. SQLite reload and sync/restore cycle preserve sorting invariants.
 */

import { compareAllotmentHistory, AllotmentHistoryItem, formatAllotmentTimestamp, parseIpoDate } from '../utils/allotmentHistoryUtils';
import { IPOAllotmentRecord, SaveAllotmentParams } from '../context/DBContext';

function assert(condition: boolean, testName: string, detail: string) {
  if (!condition) {
    console.error(`❌ FAIL: [${testName}] - ${detail}`);
    throw new Error(`Test failed: [${testName}] - ${detail}`);
  }
  console.log(`✓ PASS: [${testName}] ${detail}`);
}

// In-memory SQLite simulation matching context/DBContext.tsx
class MockSQLiteDB {
  ipo_allotments: IPOAllotmentRecord[] = [];
  ipo_applications: Array<{
    id: string;
    user_id: string;
    ipo_id: string;
    status: string;
    quantity: number;
    shares_count: number | null;
    owner_id: string | null;
    created_at: string;
    updated_at: string;
  }> = [];

  async saveAllotmentResult(params: SaveAllotmentParams): Promise<IPOAllotmentRecord> {
    const now = new Date().toISOString();
    const existingIdx = this.ipo_allotments.findIndex((a) => a.application_id === params.application_id);
    const id = existingIdx >= 0 ? this.ipo_allotments[existingIdx].id : `alt_${params.application_id}`;

    const allottedLots = params.allotted_lots ?? (params.allotment_status === 'ALLOTTED' ? 1 : 0);
    const allottedShares = params.allotted_shares ?? 0;
    const checkedAt = params.checked_at || now;

    const record: IPOAllotmentRecord = {
      id,
      application_id: params.application_id,
      user_id: params.user_id,
      ipo_id: params.ipo_id,
      allotment_status: params.allotment_status,
      allotted_lots: allottedLots,
      allotted_shares: allottedShares,
      allotment_price: params.allotment_price || 0,
      application_amount: params.application_amount || 0,
      refund_amount: params.refund_amount || 0,
      registrar: params.registrar || '',
      verification_method: params.verification_method || 'AUTOMATED',
      checked_at: checkedAt,
      error_code: params.error_code || '',
      created_at: existingIdx >= 0 ? this.ipo_allotments[existingIdx].created_at : now,
      updated_at: now,
    };

    if (existingIdx >= 0) {
      this.ipo_allotments[existingIdx] = record;
    } else {
      this.ipo_allotments.push(record);
    }

    // Update application status
    const app = this.ipo_applications.find((a) => a.id === params.application_id);
    if (app && app.status !== 'Holding' && app.status !== 'Sold') {
      const statusUpper = (params.allotment_status || '').trim().toUpperCase();
      if (statusUpper === 'ALLOTTED') {
        app.status = 'Allotted';
        app.shares_count = allottedShares;
      } else if (statusUpper === 'PARTIALLY_ALLOTTED') {
        app.status = 'Partially Allotted';
        app.shares_count = allottedShares;
      } else if (statusUpper === 'NOT_ALLOTTED' || statusUpper === 'REJECTED') {
        app.status = 'Not Allotted';
        app.shares_count = 0;
      }
    }

    return record;
  }

  async getAllotments(ownerId?: string | null): Promise<IPOAllotmentRecord[]> {
    return this.ipo_allotments
      .filter((alt) => {
        const app = this.ipo_applications.find((a) => a.id === alt.application_id);
        if (!ownerId) return true;
        return app ? app.owner_id === ownerId || !app.owner_id : true;
      })
      .sort((a, b) => Date.parse(b.checked_at) - Date.parse(a.checked_at));
  }
}

// History builder replicating app/allotment-checker.tsx
function buildHistoryItems(params: {
  allotments: IPOAllotmentRecord[];
  applications: Array<{ id: string; user_id: string; ipo_id: string; ipo_name?: string; user_name?: string; open_date?: string; status: string; quantity: number; shares_count: number | null }>;
  users: Array<{ id: string; name: string; pan_number: string }>;
  ipos: Array<{ id: string; ipo_name: string; company_name?: string; open_date?: string; openDate?: string; lot_size?: number }>;
  activeJob?: { items: Array<{ maskedId: string; status: string; sharesAllotted?: number; checkedAt?: string }>; updatedAt?: string } | null;
  selectedIpo?: { id: string; ipo_name: string; company_name?: string; open_date?: string; lot_size: number } | null;
}): AllotmentHistoryItem[] {
  const itemsMap = new Map<string, AllotmentHistoryItem>();

  const ipoOpenDateMap = new Map<string, string>();
  for (const i of params.ipos || []) {
    const d = i.open_date || i.openDate;
    if (d && typeof d === 'string' && d.trim()) {
      const val = d.trim();
      if (i.id) ipoOpenDateMap.set(i.id, val);
      if (i.ipo_name) ipoOpenDateMap.set(i.ipo_name.trim().toLowerCase(), val);
      if (i.company_name) ipoOpenDateMap.set(i.company_name.trim().toLowerCase(), val);
    }
  }
  for (const a of params.applications || []) {
    const d = a.open_date;
    if (d && typeof d === 'string' && d.trim()) {
      const val = d.trim();
      if (a.ipo_id) ipoOpenDateMap.set(a.ipo_id, val);
      if (a.ipo_name) ipoOpenDateMap.set(a.ipo_name.trim().toLowerCase(), val);
    }
  }

  const getIpoOpenDate = (ipoId?: string, ipoName?: string): string | undefined => {
    if (ipoId && ipoOpenDateMap.has(ipoId)) return ipoOpenDateMap.get(ipoId);
    const norm = (ipoName || '').trim().toLowerCase();
    if (norm && ipoOpenDateMap.has(norm)) return ipoOpenDateMap.get(norm);
    return undefined;
  };

  // Canonical mapping for reliable deduplication across all sources
  const ipoCanonicalMap = new Map<string, string>();
  for (const i of params.ipos || []) {
    const cName = (i.company_name || i.ipo_name || i.id || '').trim().toLowerCase();
    if (i.id) ipoCanonicalMap.set(i.id, cName);
    if (i.ipo_name) ipoCanonicalMap.set(i.ipo_name.trim().toLowerCase(), cName);
    if (i.company_name) ipoCanonicalMap.set(i.company_name.trim().toLowerCase(), cName);
  }
  for (const a of params.applications || []) {
    const cName = (a.ipo_name || a.ipo_id || '').trim().toLowerCase();
    if (a.ipo_id) ipoCanonicalMap.set(a.ipo_id, ipoCanonicalMap.get(a.ipo_id) || cName);
    if (a.ipo_name) ipoCanonicalMap.set(a.ipo_name.trim().toLowerCase(), cName);
  }

  const userCanonicalMap = new Map<string, string>();
  for (const u of params.users || []) {
    const cUser = (u.pan_number ? u.pan_number.trim().toUpperCase() : u.id || u.name || '').trim().toLowerCase();
    if (u.id) userCanonicalMap.set(u.id, cUser);
    if (u.pan_number) userCanonicalMap.set(u.pan_number.trim().toUpperCase(), cUser);
    if (u.name) userCanonicalMap.set(u.name.trim().toLowerCase(), cUser);
  }

  const getCanonicalKey = (
    ipoId?: string,
    ipoName?: string,
    userId?: string,
    pan?: string,
    userName?: string,
  ) => {
    const normIpo = (
      (ipoName ? ipoCanonicalMap.get(ipoName.trim().toLowerCase()) : undefined) ||
      (ipoId ? ipoCanonicalMap.get(ipoId) : undefined) ||
      ipoName ||
      ipoId ||
      ''
    ).trim().toLowerCase();

    const normUser = (
      (pan ? userCanonicalMap.get(pan.trim().toUpperCase()) : undefined) ||
      (pan && pan.trim().toUpperCase() ? pan.trim().toUpperCase() : undefined) ||
      (userName && userName !== 'Applicant' ? userCanonicalMap.get(userName.trim().toLowerCase()) : undefined) ||
      (userName && userName !== 'Applicant' ? userName.trim().toLowerCase() : undefined) ||
      (userId ? userCanonicalMap.get(userId) : undefined) ||
      userId ||
      userName ||
      ''
    ).trim().toLowerCase();

    return `${normIpo}:::${normUser}`;
  };

  const upsertItem = (item: AllotmentHistoryItem, userId?: string) => {
    const canonicalKey = getCanonicalKey(item.ipoId, item.ipoName, userId, item.pan, item.userName);
    const existing = itemsMap.get(canonicalKey);
    if (!existing) {
      itemsMap.set(canonicalKey, item);
    } else {
      const betterShares =
        item.sharesAllotted && item.sharesAllotted > 0
          ? item.sharesAllotted
          : existing.sharesAllotted;
      const betterTime = item.checkedAt || existing.checkedAt;
      const betterFormattedTime = item.checkedAtFormatted || existing.checkedAtFormatted;
      const betterStatus = item.status || existing.status;
      const betterOpenDate = item.ipoOpenDate || existing.ipoOpenDate;
      const betterPan = existing.pan || item.pan;
      const betterUserName =
        existing.userName && existing.userName !== 'Applicant'
          ? existing.userName
          : item.userName || existing.userName;

      itemsMap.set(canonicalKey, {
        ...existing,
        sharesAllotted: betterShares,
        checkedAt: betterTime,
        checkedAtFormatted: betterFormattedTime,
        status: betterStatus,
        ipoOpenDate: betterOpenDate,
        pan: betterPan,
        userName: betterUserName,
      });
    }
  };

  // 1. Process persisted allotment records from ipo_allotments table
  for (const alt of params.allotments || []) {
    const normStatus = (alt.allotment_status || '').trim().toUpperCase();
    const isAllotted = normStatus === 'ALLOTTED' || normStatus === 'PARTIALLY_ALLOTTED';

    // Strict requirement: Only display applications with a verified allotment result
    if (!isAllotted) continue;

    const app = params.applications.find((a) => a.id === alt.application_id);
    const usr = params.users.find((u) => u.id === alt.user_id || u.id === app?.user_id);
    const ipo = params.ipos.find((i) => i.id === alt.ipo_id || i.id === app?.ipo_id);

    const allottedShares =
      typeof alt.allotted_shares === 'number' && alt.allotted_shares > 0
        ? alt.allotted_shares
        : typeof app?.shares_count === 'number' && app.shares_count > 0
        ? app.shares_count
        : 0;

    // Exclude zero-share records; never infer from applied quantity or lot size
    if (allottedShares <= 0) continue;

    const ipoId = ipo?.id || app?.ipo_id;
    const ipoName = app?.ipo_name || ipo?.company_name || ipo?.ipo_name || 'IPO';
    const ipoOpenDate = getIpoOpenDate(ipoId, ipoName);

    upsertItem({
      id: alt.id,
      ipoId,
      ipoName,
      ipoOpenDate,
      userName: app?.user_name || usr?.name || 'Applicant',
      pan: usr?.pan_number || '',
      status: normStatus,
      sharesAllotted: allottedShares,
      checkedAt: alt.checked_at,
      checkedAtFormatted: formatAllotmentTimestamp(alt.checked_at),
    }, alt.user_id || app?.user_id || usr?.id);
  }

  // 2. Merge activeJob items if available
  if (params.activeJob?.items && params.selectedIpo) {
    for (const item of params.activeJob.items) {
      const rawStatus = (item.status || '').trim().toUpperCase();
      const isAllotted = rawStatus === 'ALLOTTED' || rawStatus === 'PARTIALLY_ALLOTTED';

      if (!isAllotted) continue;

      const allottedShares = typeof item.sharesAllotted === 'number' && item.sharesAllotted > 0 ? item.sharesAllotted : 0;
      if (allottedShares <= 0) continue;

      const backendMask = (item.maskedId || '').trim().toUpperCase();
      const usr = params.users.find((u) => {
        const p = (u.pan_number || '').trim().toUpperCase();
        if (p.length !== 10) return false;
        const mask = `${p.slice(0, 3)}****${p.slice(-2)}`;
        return mask === backendMask;
      });

      const app = params.applications.find((a) => a.user_id === usr?.id && (a.ipo_id === params.selectedIpo!.id || a.ipo_name === params.selectedIpo!.ipo_name));
      const checkedAt = item.checkedAt || params.activeJob.updatedAt;

      const existingAlt = app ? params.allotments.find((a) => a.application_id === app.id) : undefined;
      const key = existingAlt && existingAlt.checked_at === checkedAt
        ? existingAlt.id
        : `job_${params.selectedIpo.id}_${usr?.id || item.maskedId}_${checkedAt || ''}`;

      const ipoId = params.selectedIpo.id;
      const ipoName = params.selectedIpo.company_name || params.selectedIpo.ipo_name || 'IPO';
      const ipoOpenDate = getIpoOpenDate(ipoId, ipoName) || params.selectedIpo.open_date;

      upsertItem({
        id: key,
        ipoId,
        ipoName,
        ipoOpenDate,
        userName: usr?.name || 'Applicant',
        pan: usr?.pan_number || '',
        status: rawStatus,
        sharesAllotted: allottedShares,
        checkedAt,
        checkedAtFormatted: formatAllotmentTimestamp(checkedAt),
      }, usr?.id);
    }
  }

  // 3. Include applications with genuine allotment status that lack an ipo_allotments row
  for (const app of params.applications) {
    const isLegitAllotted =
      app.status === 'Allotted' ||
      app.status === 'Partially Allotted';

    if (!isLegitAllotted) continue;

    const sharesCount = typeof app.shares_count === 'number' && app.shares_count > 0 ? app.shares_count : 0;
    if (sharesCount <= 0) continue;

    const usr = params.users.find((u) => u.id === app.user_id);
    const ipo = params.ipos.find((i) => i.id === app.ipo_id);
    const ipoId = app.ipo_id;
    const ipoName = app.ipo_name || ipo?.company_name || ipo?.ipo_name || 'IPO';
    const canonicalKey = getCanonicalKey(ipoId, ipoName, app.user_id, usr?.pan_number, app.user_name || usr?.name);
    if (itemsMap.has(canonicalKey)) continue;

    const status = app.status === 'Partially Allotted' ? 'PARTIALLY_ALLOTTED' : 'ALLOTTED';
    const ipoOpenDate = getIpoOpenDate(ipoId, ipoName);

    upsertItem({
      id: app.id,
      ipoId,
      ipoName,
      ipoOpenDate,
      userName: usr?.name || 'Applicant',
      pan: usr?.pan_number || '',
      status,
      sharesAllotted: sharesCount,
      checkedAt: undefined,
      checkedAtFormatted: undefined,
    }, app.user_id);
  }

  const items = Array.from(itemsMap.values());
  items.sort(compareAllotmentHistory);
  return items;
}

async function runTests() {
  console.log('======================================================================');
  console.log('RUNNING ALLOTMENT HISTORY INTEGRITY & SORTING REGRESSION TESTS');
  console.log('======================================================================\n');

  // ------------------------------------------------------------------
  // TEST 1: Show Only Allotted Records (HD Fire Protect zero allotments excluded)
  // ------------------------------------------------------------------
  console.log('--- TEST 1: Show Only Allotted Records (Zero Allotments Excluded) ---');
  const db = new MockSQLiteDB();

  // 29 applications for HD Fire Protect (lot size = 55, open date 2026-10-10)
  const users: Array<{ id: string; name: string; pan_number: string }> = [];
  const applications: Array<{ id: string; user_id: string; ipo_id: string; ipo_name: string; open_date?: string; status: string; quantity: number; shares_count: number | null }> = [];
  const hdIpo = { id: 'ipo_hd_fire', ipo_name: 'HD Fire Protect', company_name: 'HD Fire Protect Ltd', open_date: '2026-10-10', lot_size: 55 };

  for (let i = 1; i <= 29; i++) {
    const pan = `ABCDE${String(1000 + i).slice(-4)}F`;
    const user = { id: `user_${i}`, name: `Applicant ${i}`, pan_number: pan };
    users.push(user);
    const app = {
      id: `app_${i}`,
      user_id: user.id,
      ipo_id: hdIpo.id,
      ipo_name: hdIpo.ipo_name,
      open_date: hdIpo.open_date,
      status: 'Applied',
      quantity: 55, // Applied quantity is 55 shares
      shares_count: null,
      owner_id: 'test_owner',
      created_at: '2026-10-10T10:00:00Z',
      updated_at: '2026-10-10T10:00:00Z',
    };
    db.ipo_applications.push(app);
    applications.push(app);
  }

  // Tata Tech application for User 1: legitimately Allotted 55 shares (open date 2026-09-01)
  const tataIpo = { id: 'ipo_tata_tech', ipo_name: 'Tata Technologies', open_date: '2026-09-01', lot_size: 55 };
  const tataApp = {
    id: 'app_tata_1',
    user_id: 'user_1',
    ipo_id: tataIpo.id,
    ipo_name: tataIpo.ipo_name,
    open_date: tataIpo.open_date,
    status: 'Applied',
    quantity: 55,
    shares_count: null,
    owner_id: 'test_owner',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  };
  db.ipo_applications.push(tataApp);
  applications.push(tataApp);

  // Record legitimate allotment for Tata Tech
  await db.saveAllotmentResult({
    application_id: tataApp.id,
    user_id: 'user_1',
    ipo_id: tataIpo.id,
    allotment_status: 'ALLOTTED',
    allotted_lots: 1,
    allotted_shares: 55,
    registrar: 'Link Intime',
    checked_at: '2026-09-15T12:00:00.000Z',
  });

  // Record check results for HD Fire Protect: 28 NOT_ALLOTTED, 1 NO_RECORD
  const checkTime = '2026-10-18T14:30:00.000Z';
  for (let i = 1; i <= 28; i++) {
    await db.saveAllotmentResult({
      application_id: `app_${i}`,
      user_id: `user_${i}`,
      ipo_id: hdIpo.id,
      allotment_status: 'NOT_ALLOTTED',
      allotted_lots: 0,
      allotted_shares: 0,
      registrar: 'Bigshare Services',
      checked_at: checkTime,
    });
  }
  await db.saveAllotmentResult({
    application_id: 'app_29',
    user_id: 'user_29',
    ipo_id: hdIpo.id,
    allotment_status: 'NO_RECORD',
    allotted_lots: 0,
    allotted_shares: 0,
    registrar: 'Bigshare Services',
    checked_at: checkTime,
  });

  const allotmentsFromDb = await db.getAllotments('test_owner');
  const historyItems = buildHistoryItems({
    allotments: allotmentsFromDb,
    applications,
    users,
    ipos: [hdIpo, tataIpo],
    selectedIpo: hdIpo,
  });

  // VERIFY: Allotment History must ONLY show verified positive-share allotted records!
  // HD Fire Protect had zero allotments, so it must have ZERO records in history!
  const hdHistory = historyItems.filter((h) => h.ipoId === hdIpo.id);
  assert(hdHistory.length === 0, 'HD Zero Allotments Excluded', `Expected 0 HD records in Allotment History, got ${hdHistory.length}`);

  // Tata Tech legitimate allotment must be the only record displayed
  assert(historyItems.length === 1, 'Only Legitimate Allotments Displayed', `Expected exactly 1 allotted item, got ${historyItems.length}`);
  const tataHistory = historyItems[0];
  assert(tataHistory.ipoId === tataIpo.id, 'Tata Tech Present', 'Tata Tech is the sole allotted item');
  assert(tataHistory.status === 'ALLOTTED', 'Status is ALLOTTED', `Status: ${tataHistory.status}`);
  assert(tataHistory.sharesAllotted === 55, 'Tata Tech Shares 55', `Shares: ${tataHistory.sharesAllotted}`);

  // ------------------------------------------------------------------
  // TEST 2: Multiple IPOs with legitimate allotments preserved
  // ------------------------------------------------------------------
  console.log('\n--- TEST 2: Multiple IPOs Legitimate Allotments Preserved ---');
  const bajajIpo = { id: 'ipo_bajaj', ipo_name: 'Bajaj Housing Finance', open_date: '2026-09-09', lot_size: 214 };
  await db.saveAllotmentResult({
    application_id: 'app_bajaj_1',
    user_id: 'user_1',
    ipo_id: bajajIpo.id,
    allotment_status: 'ALLOTTED',
    allotted_lots: 1,
    allotted_shares: 214,
    registrar: 'KFin Technologies',
    checked_at: '2026-09-20T10:00:00.000Z',
  });

  const multiIpoAllotments = await db.getAllotments('test_owner');
  const multiHistory = buildHistoryItems({
    allotments: multiIpoAllotments,
    applications: [...applications, { id: 'app_bajaj_1', user_id: 'user_1', ipo_id: bajajIpo.id, ipo_name: bajajIpo.ipo_name, open_date: bajajIpo.open_date, status: 'Allotted', quantity: 214, shares_count: 214 }],
    users,
    ipos: [hdIpo, tataIpo, bajajIpo],
  });

  // Verify: Exactly Tata and Bajaj are visible; HD Fire Protect (0 allotments) remains excluded
  assert(multiHistory.length === 2, 'Two Legitimate Allotments', `Expected 2 items, got ${multiHistory.length}`);
  assert(multiHistory.some((h) => h.ipoId === tataIpo.id), 'Tata Present in Multi', 'Tata present');
  assert(multiHistory.some((h) => h.ipoId === bajajIpo.id), 'Bajaj Present in Multi', 'Bajaj present');
  assert(!multiHistory.some((h) => h.ipoId === hdIpo.id), 'HD Excluded from Multi', 'HD not present');

  // ------------------------------------------------------------------
  // TEST 3: Multiple users/PANs isolation (no cross-user contamination)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 3: Multiple Users/PANs Isolation ---');
  const user1Records = multiHistory.filter((h) => h.pan === users[0].pan_number);
  const user2Records = multiHistory.filter((h) => h.pan === users[1].pan_number);

  assert(user1Records.length === 2, 'User 1 Has 2 Allotments', `User 1 has ${user1Records.length} records`);
  assert(user2Records.length === 0, 'User 2 Has 0 Allotments (No Contamination)', `User 2 has ${user2Records.length} records`);

  // ------------------------------------------------------------------
  // TEST 4: Latest IPO Issue/Opening Date Appears First (Regardless of Check Time)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 4: Latest IPO Issue/Opening Date Appears First ---');
  // Older IPO: ABC Infra opened on 2026-08-01, but was checked recently on 2026-10-18T16:00:00Z
  const olderIpoRecord: AllotmentHistoryItem = {
    id: 'rec_older_ipo',
    ipoId: 'ipo_abc_infra',
    ipoName: 'ABC Infrastructure Ltd',
    ipoOpenDate: '2026-08-01',
    userName: 'User 1',
    pan: 'ABCDE1234F',
    status: 'ALLOTTED',
    sharesAllotted: 100,
    checkedAt: '2026-10-18T16:00:00.000Z',
  };

  // Newer IPO: XYZ Solar opened on 2026-10-15, but was checked earlier on 2026-10-16T10:00:00Z
  const newerIpoRecord: AllotmentHistoryItem = {
    id: 'rec_newer_ipo',
    ipoId: 'ipo_xyz_solar',
    ipoName: 'XYZ Solar Tech Ltd',
    ipoOpenDate: '2026-10-15',
    userName: 'User 1',
    pan: 'ABCDE1234F',
    status: 'ALLOTTED',
    sharesAllotted: 65,
    checkedAt: '2026-10-16T10:00:00.000Z',
  };

  const sortedByIpoDate = [olderIpoRecord, newerIpoRecord].sort(compareAllotmentHistory);
  assert(sortedByIpoDate[0].id === 'rec_newer_ipo', 'Newer IPO Appears First', `Expected XYZ Solar (2026-10-15) first, got ${sortedByIpoDate[0].ipoName}`);
  assert(sortedByIpoDate[1].id === 'rec_older_ipo', 'Older IPO Appears Second', `Expected ABC Infra (2026-08-01) second, got ${sortedByIpoDate[1].ipoName}`);

  // ------------------------------------------------------------------
  // TEST 5: Same IPO Records Grouped and Sorted by Check Timestamp (Newest First)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 5: Same IPO Grouped & Sorted by Check Timestamp ---');
  const ipoAlphaUserOld: AllotmentHistoryItem = {
    id: 'rec_alpha_old',
    ipoId: 'ipo_alpha',
    ipoName: 'Alpha Tech',
    ipoOpenDate: '2026-10-01',
    userName: 'Applicant A',
    pan: 'AAAAA1111A',
    status: 'ALLOTTED',
    sharesAllotted: 50,
    checkedAt: '2026-10-05T09:00:00.000Z', // Checked earlier
  };

  const ipoAlphaUserNew: AllotmentHistoryItem = {
    id: 'rec_alpha_new',
    ipoId: 'ipo_alpha',
    ipoName: 'Alpha Tech',
    ipoOpenDate: '2026-10-01',
    userName: 'Applicant B',
    pan: 'BBBBB2222B',
    status: 'ALLOTTED',
    sharesAllotted: 50,
    checkedAt: '2026-10-05T15:30:00.000Z', // Checked later
  };

  const ipoBeta: AllotmentHistoryItem = {
    id: 'rec_beta',
    ipoId: 'ipo_beta',
    ipoName: 'Beta Energy',
    ipoOpenDate: '2026-09-15', // Older IPO
    userName: 'Applicant C',
    pan: 'CCCCC3333C',
    status: 'ALLOTTED',
    sharesAllotted: 30,
    checkedAt: '2026-10-06T10:00:00.000Z',
  };

  const groupedAndSorted = [ipoAlphaUserOld, ipoBeta, ipoAlphaUserNew].sort(compareAllotmentHistory);
  assert(groupedAndSorted[0].id === 'rec_alpha_new', 'Alpha Tech Newer Check First', `Expected rec_alpha_new at index 0, got ${groupedAndSorted[0].id}`);
  assert(groupedAndSorted[1].id === 'rec_alpha_old', 'Alpha Tech Older Check Second', `Expected rec_alpha_old at index 1, got ${groupedAndSorted[1].id}`);
  assert(groupedAndSorted[2].id === 'rec_beta', 'Older IPO Beta Placed After Alpha', `Expected rec_beta at index 2, got ${groupedAndSorted[2].id}`);

  // ------------------------------------------------------------------
  // TEST 6: Missing IPO Issue Dates Handled Deterministically After Valid Dates
  // ------------------------------------------------------------------
  console.log('\n--- TEST 6: Missing IPO Dates Placed After Valid Dates ---');
  const sampleWithMissingDates: AllotmentHistoryItem[] = [
    {
      id: 'missing_date_b',
      ipoId: 'ipo_missing_b',
      ipoName: 'Zeta Corp (No Date)',
      ipoOpenDate: undefined,
      userName: 'User 1',
      pan: 'ABCDE1234F',
      status: 'ALLOTTED',
      sharesAllotted: 10,
      checkedAt: '2026-10-18T10:00:00.000Z',
    },
    {
      id: 'valid_date_item',
      ipoId: 'ipo_valid',
      ipoName: 'Valid Date IPO',
      ipoOpenDate: '2026-01-15', // Older but valid date
      userName: 'User 1',
      pan: 'ABCDE1234F',
      status: 'ALLOTTED',
      sharesAllotted: 20,
      checkedAt: '2026-10-18T10:00:00.000Z',
    },
    {
      id: 'missing_date_a',
      ipoId: 'ipo_missing_a',
      ipoName: 'Delta Corp (No Date)',
      ipoOpenDate: undefined,
      userName: 'User 1',
      pan: 'ABCDE1234F',
      status: 'ALLOTTED',
      sharesAllotted: 15,
      checkedAt: '2026-10-18T10:00:00.000Z',
    },
  ];

  sampleWithMissingDates.sort(compareAllotmentHistory);
  assert(sampleWithMissingDates[0].id === 'valid_date_item', 'Valid Date IPO Precedes Missing', `Expected valid_date_item first, got ${sampleWithMissingDates[0].id}`);
  assert(sampleWithMissingDates[1].id === 'missing_date_a', 'Delta Corp Deterministic Tie-Breaker', `Expected Delta Corp second, got ${sampleWithMissingDates[1].ipoName}`);
  assert(sampleWithMissingDates[2].id === 'missing_date_b', 'Zeta Corp Deterministic Tie-Breaker', `Expected Zeta Corp third, got ${sampleWithMissingDates[2].ipoName}`);
  assert(sampleWithMissingDates[1].ipoOpenDate === undefined, 'No Fabricated Date Injected', 'ipoOpenDate remains undefined');

  // ------------------------------------------------------------------
  // TEST 7: Zero-Share Allotments and Unverified Inferences Strictly Excluded
  // ------------------------------------------------------------------
  console.log('\n--- TEST 7: Zero-Share Allotments & Unverified Statuses Excluded ---');
  const zeroShareAllotmentDb = new MockSQLiteDB();
  const testUsers = [{ id: 'u_1', name: 'User 1', pan_number: 'ABCDE1234F' }];
  const testIpos = [{ id: 'ipo_zero_test', ipo_name: 'Zero Test IPO', open_date: '2026-10-01', lot_size: 40 }];
  const testApps = [
    // Case A: Application has status 'Allotted' but shares_count = 0 (zero shares)
    { id: 'app_zero_shares', user_id: 'u_1', ipo_id: 'ipo_zero_test', ipo_name: 'Zero Test IPO', open_date: '2026-10-01', status: 'Allotted', quantity: 40, shares_count: 0 },
    // Case B: Application has status 'Applied' and quantity = 40 (MUST NOT infer 40 shares!)
    { id: 'app_applied_only', user_id: 'u_1', ipo_id: 'ipo_zero_test', ipo_name: 'Zero Test IPO', open_date: '2026-10-01', status: 'Applied', quantity: 40, shares_count: null },
  ];

  // Case C: Persisted check with status 'ALLOTTED' but allotted_shares = 0
  await zeroShareAllotmentDb.saveAllotmentResult({
    application_id: 'app_zero_shares',
    user_id: 'u_1',
    ipo_id: 'ipo_zero_test',
    allotment_status: 'ALLOTTED',
    allotted_lots: 0,
    allotted_shares: 0,
    checked_at: '2026-10-05T10:00:00.000Z',
  });

  const zeroHistory = buildHistoryItems({
    allotments: zeroShareAllotmentDb.ipo_allotments,
    applications: testApps,
    users: testUsers,
    ipos: testIpos,
  });

  assert(zeroHistory.length === 0, 'Zero Shares & Applied Inferences Excluded', `Expected 0 records, got ${zeroHistory.length}`);

  // ------------------------------------------------------------------
  // TEST 8: SQLite Reload and Sync/Restore Cycle
  // ------------------------------------------------------------------
  console.log('\n--- TEST 8: SQLite Reload and Sync/Restore Cycle ---');
  const exportData = {
    version: 3,
    allotments: multiIpoAllotments,
  };
  const serialized = JSON.stringify(exportData);
  const parsed = JSON.parse(serialized);

  const restoredDb = new MockSQLiteDB();
  restoredDb.ipo_allotments = parsed.allotments;
  const restoredAllotments = await restoredDb.getAllotments();
  assert(restoredAllotments.length === multiIpoAllotments.length, 'Restored Record Count Matches', `Expected ${multiIpoAllotments.length}, got ${restoredAllotments.length}`);

  const restoredHistory = buildHistoryItems({
    allotments: restoredAllotments,
    applications: [...applications, { id: 'app_bajaj_1', user_id: 'user_1', ipo_id: bajajIpo.id, ipo_name: bajajIpo.ipo_name, open_date: bajajIpo.open_date, status: 'Allotted', quantity: 214, shares_count: 214 }],
    users,
    ipos: [hdIpo, tataIpo, bajajIpo],
  });

  // Verify: Bajaj (open date 2026-09-09) appears before Tata (open date 2026-09-01)
  assert(restoredHistory.length === 2, 'Restored History Has 2 Items', `Expected 2, got ${restoredHistory.length}`);
  assert(restoredHistory[0].ipoId === bajajIpo.id, 'Bajaj First (Newer Issue Date 2026-09-09)', `Expected Bajaj first, got ${restoredHistory[0].ipoName}`);
  assert(restoredHistory[1].ipoId === tataIpo.id, 'Tata Second (Older Issue Date 2026-09-01)', `Expected Tata second, got ${restoredHistory[1].ipoName}`);

  // ------------------------------------------------------------------
  // TEST 9: Strict Deduplication Across Sources & DB Duplicate Rows
  // ------------------------------------------------------------------
  console.log('\n--- TEST 9: Zero Duplicate Records for Same User & Same IPO ---');
  // Scenario: Same user (Anish / ABCDE1234F) has:
  // 1. A persisted row in SQLite allotments (alt_tata_dup_1)
  // 2. A second persisted row in SQLite allotments (alt_tata_dup_2 from earlier rapid polling)
  // 3. An active job polling result item
  // 4. Multiple duplicate rows in SQLite ipo_applications
  const deduplicationTestHistory = buildHistoryItems({
    allotments: [
      {
        id: 'alt_tata_dup_1',
        application_id: 'app_tata_1',
        user_id: 'user_1',
        ipo_id: tataIpo.id,
        allotment_status: 'ALLOTTED',
        allotted_lots: 1,
        allotted_shares: 55,
        allotment_price: 500,
        application_amount: 14850,
        refund_amount: 0,
        registrar: 'Link Intime',
        verification_method: 'AUTOMATED',
        checked_at: '2026-10-24T10:00:00.000Z',
        error_code: '',
        created_at: '2026-10-24T10:00:00.000Z',
        updated_at: '2026-10-24T10:00:00.000Z',
      },
      {
        id: 'alt_tata_dup_2',
        application_id: 'app_tata_dup_2',
        user_id: 'user_1',
        ipo_id: tataIpo.id,
        allotment_status: 'ALLOTTED',
        allotted_lots: 1,
        allotted_shares: 55,
        allotment_price: 500,
        application_amount: 14850,
        refund_amount: 0,
        registrar: 'Link Intime',
        verification_method: 'AUTOMATED',
        checked_at: '2026-10-24T10:00:02.000Z',
        error_code: '',
        created_at: '2026-10-24T10:00:02.000Z',
        updated_at: '2026-10-24T10:00:02.000Z',
      },
    ],
    applications: [
      { id: 'app_tata_1', user_id: 'user_1', ipo_id: tataIpo.id, ipo_name: tataIpo.ipo_name, status: 'Allotted', quantity: 55, shares_count: 55 },
      { id: 'app_tata_dup_2', user_id: 'user_1', ipo_id: tataIpo.id, ipo_name: tataIpo.ipo_name, status: 'Allotted', quantity: 55, shares_count: 55 },
      { id: 'app_tata_dup_3', user_id: 'user_1', ipo_id: tataIpo.id, ipo_name: tataIpo.ipo_name, status: 'Allotted', quantity: 55, shares_count: 55 },
    ],
    users,
    ipos: [tataIpo],
    activeJob: {
      items: [
        {
          maskedId: 'ABC****1F',
          status: 'ALLOTTED',
          sharesAllotted: 55,
          checkedAt: '2026-10-24T10:00:04.000Z',
        },
      ],
      updatedAt: '2026-10-24T10:00:04.000Z',
    },
    selectedIpo: {
      id: tataIpo.id,
      ipo_name: tataIpo.ipo_name,
      company_name: (tataIpo as any).company_name || tataIpo.ipo_name,
      open_date: tataIpo.open_date,
      lot_size: 55,
    },
  });

  assert(deduplicationTestHistory.length === 1, 'Exactly 1 Record per User per IPO (Zero Duplicates)', `Expected 1 item, got ${deduplicationTestHistory.length}`);
  assert(deduplicationTestHistory[0].userName === 'Applicant 1', 'Correct User Name Preserved', `Expected Applicant 1, got ${deduplicationTestHistory[0].userName}`);
  assert(deduplicationTestHistory[0].sharesAllotted === 55, 'Correct Shares Preserved', `Expected 55, got ${deduplicationTestHistory[0].sharesAllotted}`);

  console.log('\n======================================================================');
  console.log('ALL ALLOTMENT HISTORY REGRESSION TESTS PASSED (9/9 CATEGORIES)');
  console.log('======================================================================');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
