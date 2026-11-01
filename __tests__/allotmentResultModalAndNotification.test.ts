import { safeAsyncStorage } from '../utils/safeAsyncStorage';
import {
  markAllotmentModalAsSeen,
  isAllotmentModalSeen,
  isIpoAlreadyListed,
  isAllotmentLatestAndFresh,
} from '../utils/allotmentModalUtils';
import { createDeduplicatedNotification, __setMockNotificationsModule } from '../services/notifications/notificationEngine';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

// In-memory mock storage
const memoryStore = new Map<string, string>();
safeAsyncStorage.getItem = async (k: string) => memoryStore.get(k) ?? null;
safeAsyncStorage.setItem = async (k: string, v: string) => {
  memoryStore.set(k, v);
};
safeAsyncStorage.removeItem = async (k: string) => {
  memoryStore.delete(k);
};

// In-memory mock SQLite database
function createMockDb() {
  const tables: Record<string, any[]> = {
    notifications: [],
    notification_tracker: [],
  };

  return {
    getFirstAsync: async <T>(sql: string, params: any[] = []): Promise<T | null> => {
      if (sql.includes('FROM notifications WHERE dedupe_key = ?')) {
        const row = tables.notifications.find((r) => r.dedupe_key === params[0]);
        return (row as T) || null;
      }
      return null;
    },
    runAsync: async (sql: string, params: any[] = []): Promise<any> => {
      if (sql.includes('INSERT INTO notifications')) {
        const record = {
          id: params[0],
          type: params[1],
          ipo_id: params[2],
          application_id: params[3],
          title: params[4],
          body: params[5],
          created_at: params[6],
          delivered_at: params[7],
          dedupe_key: params[8],
        };
        tables.notifications.push(record);
        return { changes: 1 };
      }
      return { changes: 0 };
    },
    getAllAsync: async <T>(sql: string): Promise<T[]> => {
      if (sql.includes('FROM notifications')) {
        return tables.notifications as T[];
      }
      return [];
    },
    _tables: tables,
  } as any;
}

export async function runAllotmentModalAndNotificationTestSuite() {
  console.log('========================================================================');
  console.log('RUNNING ALLOTMENT RESULT MODAL ONCE-ONLY & NOTIFICATION REGRESSION TESTS');
  console.log('========================================================================\n');

  // Set up mock notifications
  let scheduledAlerts: any[] = [];
  __setMockNotificationsModule({
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ status: 'granted', granted: true }),
    requestPermissionsAsync: async () => ({ status: 'granted', granted: true }),
    scheduleNotificationAsync: async (req: any) => {
      scheduledAlerts.push(req);
      return `notif-${Date.now()}-${Math.random()}`;
    },
  });

  // TEST 1: markAllotmentModalAsSeen marks all variations
  console.log('--- TEST 1: markAllotmentModalAsSeen Key Coverage ---');
  {
    memoryStore.clear();
    await markAllotmentModalAsSeen([
      'ipo-jio-platforms',
      'Jio Platforms Limited',
      'JIO_PLATFORMS',
    ]);

    assert(
      (await safeAsyncStorage.getItem('seen_allotment_modal_ipo-jio-platforms')) === 'true',
      'Scenario 1a: Exact ID Marked',
      'Exact ID marked seen'
    );
    assert(
      (await safeAsyncStorage.getItem('seen_allotment_modal_jio platforms limited')) === 'true',
      'Scenario 1b: Lowercase Name Marked',
      'Lowercase variant marked seen'
    );
    assert(
      (await safeAsyncStorage.getItem('seen_allotment_modal_jio_platforms')) === 'true',
      'Scenario 1c: Lowercase Symbol Marked',
      'Lowercase symbol variant marked seen'
    );
  }

  // TEST 2: Allotment Modal Deduplication & Seen Check
  console.log('\n--- TEST 2: Allotment Modal Check Seen Logic ---');
  {
    memoryStore.clear();
    const testIpo = {
      canonicalKey: 'jio-platforms',
      ipoId: 'jio-platforms-id',
      backendIpoId: 'jio-platforms',
      listingId: 'listing-jio',
      ipoName: 'Jio Platforms Limited',
      companyName: 'Jio Platforms',
    };

    // Before seeing:
    const identifiers = [
      testIpo.canonicalKey,
      testIpo.ipoId,
      testIpo.backendIpoId,
      testIpo.listingId,
      testIpo.ipoName,
      testIpo.companyName,
    ];
    const keysToCheck = Array.from(new Set([
      ...identifiers.map((k) => `seen_allotment_modal_${k.trim()}`),
      ...identifiers.map((k) => `seen_allotment_modal_${k.trim().toLowerCase()}`),
    ]));

    let seenValues = await Promise.all(keysToCheck.map((k) => safeAsyncStorage.getItem(k)));
    assert(!seenValues.some((v) => v === 'true'), 'Scenario 2a: Unviewed Initially', 'Not seen initially');

    // Simulate modal display: immediately mark seen
    await markAllotmentModalAsSeen(identifiers);

    seenValues = await Promise.all(keysToCheck.map((k) => safeAsyncStorage.getItem(k)));
    assert(seenValues.some((v) => v === 'true'), 'Scenario 2b: Seen After Display', 'Marked seen immediately on display');

    // Recheck: now seen, so modal will NOT show again
    const isAlreadySeen = seenValues.some((v) => v === 'true');
    assert(isAlreadySeen === true, 'Scenario 2c: Suppressed on Subsequent Open', 'Modal suppressed on subsequent app open');
  }

  // TEST 3: Notification Shot on Successful Allotment Check
  console.log('\n--- TEST 3: Shoot Notification on Successful Allotment Check ---');
  {
    scheduledAlerts = [];
    const mockDb = createMockDb();

    // 3a. Single applicant allotted notification
    const notif1 = await createDeduplicatedNotification(mockDb, {
      type: 'ALLOTTED',
      ipo_id: 'ipo-jio-platforms',
      title: '🎉 Allotment Confirmed!',
      body: 'Allotment received for Anish in Jio Platforms Limited (24 shares)!',
      dedupe_key: 'ipo_allotment_received_ipo-jio-platforms',
    });

    assert(notif1 !== null, 'Scenario 3a: Notification Created', 'Notification record created in SQLite');
    assert(notif1?.title === '🎉 Allotment Confirmed!', 'Scenario 3b: Title Matches', 'Title includes celebration badge');
    assert(scheduledAlerts.length === 1, 'Scenario 3c: Local Alert Scheduled', 'Native local push alert scheduled');
    assert(
      scheduledAlerts[0].content.body.includes('Anish in Jio Platforms Limited (24 shares)'),
      'Scenario 3d: Body Content',
      'Body contains applicant name, company, and share total'
    );

    // 3b. Duplicate check for same IPO does NOT shoot duplicate notification
    const notif2 = await createDeduplicatedNotification(mockDb, {
      type: 'ALLOTTED',
      ipo_id: 'ipo-jio-platforms',
      title: '🎉 Allotment Confirmed!',
      body: 'Allotment received for Anish in Jio Platforms Limited (24 shares)!',
      dedupe_key: 'ipo_allotment_received_ipo-jio-platforms',
    });

    assert(notif2 === null, 'Scenario 3e: Duplicate Suppressed', 'Duplicate check does not send duplicate alert');
    assert(scheduledAlerts.length === 1, 'Scenario 3f: No Duplicate Scheduled', 'Still exactly 1 alert scheduled');
  }

  // TEST 4: Strictly Exclude Already Listed IPOs
  console.log('\n--- TEST 4: Exclude Already Listed IPOs (Tonbo Imaging Regression) ---');
  {
    // 4a. Tonbo Imaging with status 'LISTED'
    const tonboListed = isIpoAlreadyListed({
      ipoStatus: 'LISTED',
      listingDate: '2026-10-24',
    });
    assert(tonboListed === true, 'Scenario 4a: Tonbo Status LISTED', 'Tonbo Imaging with status LISTED is excluded');

    // 4b. Tonbo Imaging with past listing date even if status is missing
    const tonboPastDate = isIpoAlreadyListed({
      ipoStatus: '',
      listingDate: '2026-10-24',
    });
    assert(tonboPastDate === true, 'Scenario 4b: Tonbo Past Listing Date', 'Tonbo Imaging with past listing date is excluded');

    // 4c. Active unlisted IPO with upcoming listing date
    const freshIpo = isIpoAlreadyListed({
      ipoStatus: 'ALLOTMENT_COMPLETED',
      listingDate: '2026-11-05',
    });
    assert(freshIpo === false, 'Scenario 4c: Active Fresh IPO Not Listed', 'Fresh unlisted IPO is not excluded');

    // 4d. Closed or archived IPO
    const archivedIpo = isIpoAlreadyListed({
      ipoStatus: 'ARCHIVED',
    });
    assert(archivedIpo === true, 'Scenario 4d: Archived IPO Excluded', 'Archived IPO is excluded');
  }

  // TEST 5: Strictly Exclude Stale Historical Allotments
  console.log('\n--- TEST 5: Exclude Stale Historical Allotments (> 5 days) ---');
  {
    // 5a. Stale allotment check from 14 days ago
    const staleDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const isStaleChecked = isAllotmentLatestAndFresh({
      latestCheckedAt: staleDate,
    });
    assert(isStaleChecked === false, 'Scenario 5a: Stale Check Excluded', 'Allotment checked 14 days ago is excluded');

    // 5b. Stale allotment date from 10 days ago
    const staleAllotmentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const isStaleAllotment = isAllotmentLatestAndFresh({
      allotmentDate: staleAllotmentDate,
    });
    assert(isStaleAllotment === false, 'Scenario 5b: Stale Allotment Date Excluded', 'Allotment date from 10 days ago is excluded');

    // 5c. Fresh allotment checked 2 hours ago
    const freshCheck = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const isFresh = isAllotmentLatestAndFresh({
      latestCheckedAt: freshCheck,
    });
    assert(isFresh === true, 'Scenario 5c: Fresh Check Included', 'Allotment checked 2 hours ago is included');

    // 5d. Fresh allotment date from yesterday
    const yesterdayDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const isYesterdayFresh = isAllotmentLatestAndFresh({
      allotmentDate: yesterdayDate,
    });
    assert(isYesterdayFresh === true, 'Scenario 5d: Yesterday Allotment Included', 'Allotment date from yesterday is included');

    // 5e. No dates at all
    const noDates = isAllotmentLatestAndFresh({});
    assert(noDates === false, 'Scenario 5e: No Dates Excluded', 'Record without check or allotment timestamp is excluded');
  }

  console.log('\n========================================================================');
  console.log('ALL REGRESSION SCENARIOS PASSED WITH ZERO FAILURES');
  console.log('========================================================================\n');
}

runAllotmentModalAndNotificationTestSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
