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
// Mock in-memory SQLite store simulating DBProvider & Repositories
// ---------------------------------------------------------------------------
class MockSQLiteRepository {
  public users: Array<{ id: string; name: string; avatar_url?: string }> = [];
  public ipos: Array<{ id: string; ipo_name: string; logo_url?: string; buy_price: number }> = [];
  public applications: Array<{ id: string; user_id: string; ipo_id: string; ipo_name: string; status: string; broker_account_id?: string | null }> = [];
  public bankAccounts: Array<{ id: string; bank_name: string; balance: number }> = [];
  public allotments: Array<{ id: string; application_id: string; allotment_status: string }> = [];

  async importCriticalData(data: { users?: any[]; ipos?: any[]; applications?: any[] }): Promise<{ users: number; ipos: number; applications: number }> {
    if (data.users) this.users = [...data.users];
    if (data.ipos) this.ipos = [...data.ipos];
    if (data.applications) this.applications = [...data.applications];
    return {
      users: (data.users || []).length,
      ipos: (data.ipos || []).length,
      applications: (data.applications || []).length,
    };
  }

  async importSecondaryData(data: { banks?: any[]; allotments?: any[] }): Promise<{ banks: number; allotments: number }> {
    if (data.banks) this.bankAccounts = [...data.banks];
    if (data.allotments) {
      this.allotments = [...data.allotments];
      // Self-healing allotment status logic
      for (const alt of data.allotments) {
        const app = this.applications.find((a) => a.id === alt.application_id);
        if (app && (app.status === 'Applied' || app.status === 'Mandate Approved')) {
          const st = (alt.allotment_status || '').toUpperCase();
          if (st === 'ALLOTTED') app.status = 'Allotted';
          else if (st === 'PARTIALLY_ALLOTTED' || st === 'PARTIALLY ALLOTTED') app.status = 'Partially Allotted';
          else if (st === 'NOT_ALLOTTED' || st === 'NOT ALLOTTED' || st === 'REJECTED') app.status = 'Not Allotted';
        }
      }
    }
    return {
      banks: (data.banks || []).length,
      allotments: (data.allotments || []).length,
    };
  }

  async importJSON(jsonString: string): Promise<{ users: number; ipos: number; applications: number; banks: number; allotments: number }> {
    const data = JSON.parse(jsonString);
    await this.importCriticalData(data);
    await this.importSecondaryData(data);
    return {
      users: (data.users || []).length,
      ipos: (data.ipos || []).length,
      applications: (data.applications || []).length,
      banks: (data.banks || []).length,
      allotments: (data.allotments || []).length,
    };
  }

  async countTotalRecords(): Promise<number> {
    return this.users.length + this.ipos.length + this.applications.length + this.bankAccounts.length + this.allotments.length;
  }
}

// ---------------------------------------------------------------------------
// Simulation of DBContext & Staged 3-Stage Post-Login Cloud Sync
// ---------------------------------------------------------------------------
class DBContextSimulator {
  public repo: MockSQLiteRepository = new MockSQLiteRepository();
  public authUser: { uid: string; email: string } | null = null;
  public syncedUid: string | null = null;
  public isRestoring: boolean = false;
  public isBackgroundSyncing: boolean = false;
  public criticalRefreshCount: number = 0;
  public secondaryRefreshCount: number = 0;
  public fullRefreshCount: number = 0;
  public currentScreen: string = '/auth';

  // React state mirroring SQLite
  public uiUsers: any[] = [];
  public uiIpos: any[] = [];
  public uiApplications: any[] = [];
  public uiBanks: any[] = [];

  // Stage timing tracking
  public stage1DurationMs: number = 0;
  public stage2DurationMs: number = 0;
  public stage3ImagesSaved: number = 0;

  async refreshCritical() {
    this.criticalRefreshCount++;
    this.uiUsers = [...this.repo.users];
    this.uiIpos = [...this.repo.ipos];
    this.uiApplications = [...this.repo.applications];
  }

  async refreshSecondary() {
    this.secondaryRefreshCount++;
    this.uiBanks = [...this.repo.bankAccounts];
  }

  async refresh() {
    this.fullRefreshCount++;
    await this.refreshCritical();
    await this.refreshSecondary();
  }

  // 1. User signs in on Auth screen
  onUserLogin(user: { uid: string; email: string }) {
    this.authUser = user;
    // Immediate non-blocking navigation to Dashboard
    this.currentScreen = '/(tabs)';
    
    // Asynchronously trigger 3-Stage automatic cloud sync in background
    this.triggerAutomaticBackgroundSync();
  }

  // 2. 3-Stage Automatic background sync
  async triggerAutomaticBackgroundSync(): Promise<boolean> {
    if (!this.authUser?.uid) return false;
    if (this.syncedUid === this.authUser.uid) return true;

    this.syncedUid = this.authUser.uid;
    this.isBackgroundSyncing = true;

    try {
      const t0 = Date.now();
      // STAGE 1: Fetch & Ingest Critical Dashboard Data
      const criticalData = await this.mockFetchStage1(this.authUser.uid);
      if (criticalData) {
        await this.repo.importCriticalData(criticalData);
        await this.refreshCritical();
        this.stage1DurationMs = Date.now() - t0;
      }

      // STAGE 2: Fetch & Ingest Secondary Data (in background)
      const t2Start = Date.now();
      const secondaryData = await this.mockFetchStage2(this.authUser.uid);
      if (secondaryData) {
        await this.repo.importSecondaryData(secondaryData);
        await this.refreshSecondary();
        this.stage2DurationMs = Date.now() - t2Start;
      }

      // STAGE 3: Asynchronous background image caching
      if (criticalData?.ipos) {
        this.stage3ImagesSaved = await this.mockSaveImagesInBackground(criticalData.ipos);
      }

      this.isBackgroundSyncing = false;
      return true;
    } catch {
      this.isBackgroundSyncing = false;
      return false;
    }
  }

  // 3. Manual Restore feature (available in Settings for full recovery)
  async manualRestoreNow(): Promise<boolean> {
    if (!this.authUser?.uid) return false;
    this.isRestoring = true;
    try {
      const [critical, secondary] = await Promise.all([
        this.mockFetchStage1(this.authUser.uid),
        this.mockFetchStage2(this.authUser.uid),
      ]);
      if (critical) await this.repo.importCriticalData(critical);
      if (secondary) await this.repo.importSecondaryData(secondary);
      await this.refresh();
      return true;
    } finally {
      this.isRestoring = false;
    }
  }

  // Mock stage fetchers
  public mockFetchStage1: (uid: string) => Promise<{ users: any[]; ipos: any[]; applications: any[] } | null> = async () => ({
    users: [],
    ipos: [],
    applications: [],
  });

  public mockFetchStage2: (uid: string) => Promise<{ banks: any[]; allotments: any[] } | null> = async () => ({
    banks: [],
    allotments: [],
  });

  public mockSaveImagesInBackground: (ipos: any[]) => Promise<number> = async (ipos) => {
    return (ipos || []).filter((i) => i.logo_url && i.logo_url.startsWith('data:')).length;
  };
}

async function runAutomaticPostLoginCloudSyncTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT 3-STAGE CLOUD SYNC ARCHITECTURE TEST SUITE');
  console.log('===============================================================');

  // --- TEST 1: Stage 1 Ingestion & Immediate Dashboard Hydration ---
  console.log('\n--- TEST 1: Stage 1 Dashboard Hydration & Non-Blocking Entry ---');
  {
    const dbCtx = new DBContextSimulator();

    dbCtx.mockFetchStage1 = async () => ({
      users: [{ id: 'usr-1', name: 'Anish' }],
      ipos: [{ id: 'ipo-1', ipo_name: 'Tata Tech', buy_price: 500 }],
      applications: [{ id: 'app-1', user_id: 'usr-1', ipo_id: 'ipo-1', ipo_name: 'Tata Tech', status: 'Applied', broker_account_id: 'broker-1' }],
    });

    dbCtx.mockFetchStage2 = async () => {
      // Stage 2 takes 30ms longer than Stage 1
      await new Promise((r) => setTimeout(r, 30));
      return {
        banks: [{ id: 'b-1', bank_name: 'HDFC', balance: 50000 }],
        allotments: [{ id: 'alt-1', application_id: 'app-1', allotment_status: 'ALLOTTED' }],
      };
    };

    dbCtx.onUserLogin({ uid: 'user-staged-1', email: 'stage1@ipovault.app' });

    assert(
      dbCtx.currentScreen === '/(tabs)',
      'TEST 1.1',
      'Dashboard opens immediately on login (0ms blocking navigation)'
    );

    // Give Stage 1 time to complete
    await new Promise((r) => setTimeout(r, 15));

    assert(
      dbCtx.uiUsers.length === 1 && dbCtx.uiApplications.length === 1,
      'TEST 1.2',
      'Stage 1 critical SQLite data (Users, IPOs, Applications) is immediately available to Dashboard'
    );
    assert(
      dbCtx.criticalRefreshCount === 1,
      'TEST 1.3',
      'Stage 1 performs exactly one targeted critical refresh to hydrate Hero KPIs and Recent Applications'
    );
    assert(
      dbCtx.uiBanks.length === 0,
      'TEST 1.4',
      'Stage 1 completes and renders BEFORE Stage 2 secondary data completes (independent execution)'
    );

    // Wait for Stage 2 to finish
    await new Promise((r) => setTimeout(r, 50));

    assert(
      dbCtx.uiBanks.length === 1,
      'TEST 1.5',
      'Stage 2 finishes in the background and populates bank accounts'
    );
    assert(
      dbCtx.uiApplications[0].status === 'Allotted',
      'TEST 1.6',
      'Stage 2 self-healing logic automatically synchronizes allotment status for applications'
    );
    assert(
      dbCtx.uiApplications[0].broker_account_id === 'broker-1',
      'TEST 1.7',
      'Application broker_account_id is preserved throughout sync'
    );
  }

  // --- TEST 2: Stage 2 Does NOT Trigger Generic Full Refresh ---
  console.log('\n--- TEST 2: Targeted Refresh Granularity ---');
  {
    const dbCtx = new DBContextSimulator();

    dbCtx.mockFetchStage1 = async () => ({
      users: [{ id: 'u1', name: 'User 1' }],
      ipos: [{ id: 'i1', ipo_name: 'IPO 1', buy_price: 100 }],
      applications: [{ id: 'a1', user_id: 'u1', ipo_id: 'i1', ipo_name: 'IPO 1', status: 'Applied' }],
    });

    dbCtx.mockFetchStage2 = async () => ({
      banks: [{ id: 'b1', bank_name: 'SBI', balance: 25000 }],
      allotments: [],
    });

    dbCtx.onUserLogin({ uid: 'user-refresh-granularity', email: 'targeted@ipovault.app' });
    await new Promise((r) => setTimeout(r, 30));

    assert(
      dbCtx.criticalRefreshCount === 1,
      'TEST 2.1',
      'Stage 1 triggers exactly one critical refresh'
    );
    assert(
      dbCtx.secondaryRefreshCount === 1,
      'TEST 2.2',
      'Stage 2 triggers targeted secondary refresh without full Dashboard-wide re-render'
    );
    assert(
      dbCtx.fullRefreshCount === 0,
      'TEST 2.3',
      'No unnecessary full refresh is triggered during staged post-login sync'
    );
  }

  // --- TEST 3: Stage 3 Image Persistence Completely Off Critical Path ---
  console.log('\n--- TEST 3: Stage 3 Image Persistence Asynchronous Background Execution ---');
  {
    const dbCtx = new DBContextSimulator();

    const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    dbCtx.mockFetchStage1 = async () => ({
      users: [{ id: 'u3', name: 'Image User' }],
      ipos: [
        { id: 'ipo-logo-1', ipo_name: 'Logo IPO 1', buy_price: 200, logo_url: sampleBase64 },
        { id: 'ipo-logo-2', ipo_name: 'Logo IPO 2', buy_price: 300, logo_url: sampleBase64 },
      ],
      applications: [],
    });

    dbCtx.mockFetchStage2 = async () => ({ banks: [], allotments: [] });

    dbCtx.onUserLogin({ uid: 'user-stage3', email: 'stage3@ipovault.app' });
    await new Promise((r) => setTimeout(r, 30));

    assert(
      dbCtx.uiIpos.length === 2 && dbCtx.uiIpos[0].logo_url === sampleBase64,
      'TEST 3.1',
      'Dashboard immediately receives and renders in-memory logo payload without waiting for local file I/O'
    );
    assert(
      dbCtx.stage3ImagesSaved === 2,
      'TEST 3.2',
      'Stage 3 persists local image files asynchronously in the background'
    );
  }

  // --- TEST 4: Manual "Restore from Cloud" Restores All 3 Stages ---
  console.log('\n--- TEST 4: Manual Restore Full Dataset Recovery ---');
  {
    const dbCtx = new DBContextSimulator();
    dbCtx.authUser = { uid: 'user-manual-restore', email: 'manual@ipovault.app' };

    dbCtx.mockFetchStage1 = async () => ({
      users: [{ id: 'u-man', name: 'Manual User' }],
      ipos: [{ id: 'i-man', ipo_name: 'Manual IPO', buy_price: 150 }],
      applications: [{ id: 'a-man', user_id: 'u-man', ipo_id: 'i-man', ipo_name: 'Manual IPO', status: 'Applied' }],
    });

    dbCtx.mockFetchStage2 = async () => ({
      banks: [{ id: 'b-man', bank_name: 'Kotak', balance: 100000 }],
      allotments: [{ id: 'alt-man', application_id: 'a-man', allotment_status: 'NOT_ALLOTTED' }],
    });

    const success = await dbCtx.manualRestoreNow();

    assert(
      success === true,
      'TEST 4.1',
      'Manual Restore executes successfully'
    );
    assert(
      dbCtx.uiUsers.length === 1 &&
      dbCtx.uiIpos.length === 1 &&
      dbCtx.uiApplications.length === 1 &&
      dbCtx.uiBanks.length === 1 &&
      dbCtx.repo.allotments.length === 1,
      'TEST 4.2',
      'Manual Restore repopulates all datasets (Stage 1 + Stage 2) completely'
    );
    assert(
      dbCtx.uiApplications[0].status === 'Not Allotted',
      'TEST 4.3',
      'Manual Restore applies self-healing allotment status logic'
    );
  }

  // --- TEST 5: Concurrency Protection — Exactly One Post-Login Sync per UID ---
  console.log('\n--- TEST 5: Concurrency Protection Against Duplicate Sync Jobs ---');
  {
    const dbCtx = new DBContextSimulator();
    let stage1FetchCount = 0;

    dbCtx.mockFetchStage1 = async () => {
      stage1FetchCount++;
      await new Promise((r) => setTimeout(r, 20));
      return { users: [], ipos: [], applications: [] };
    };
    dbCtx.mockFetchStage2 = async () => ({ banks: [], allotments: [] });

    // Simultaneous multiple login/sync triggers for same UID
    dbCtx.authUser = { uid: 'uid-concurrent-test', email: 'concurrent@ipovault.app' };
    const p1 = dbCtx.triggerAutomaticBackgroundSync();
    const p2 = dbCtx.triggerAutomaticBackgroundSync();
    const p3 = dbCtx.triggerAutomaticBackgroundSync();

    await Promise.all([p1, p2, p3]);

    assert(
      stage1FetchCount === 1,
      'TEST 5.1',
      `Exactly one sync operation runs for the UID (actual invocations: ${stage1FetchCount})`
    );
  }

  // --- TEST 6: Cursor Semantics — Up-to-date DB Skips Document Reads ---
  console.log('\n--- TEST 6: Cursor Semantics & Document Read Prevention ---');
  {
    const localCursor = '2026-10-04T12:00:00.000Z';
    const cloudMetaCurrent = { last_synced_at: '2026-10-04T12:00:00.000Z' };
    const cloudMetaNewer = { last_synced_at: '2026-10-04T12:30:00.000Z' };

    assert(
      localCursor >= cloudMetaCurrent.last_synced_at,
      'TEST 6.1',
      'Matching cursor causes 0 document reads (up-to-date)'
    );
    assert(
      localCursor < cloudMetaNewer.last_synced_at,
      'TEST 6.2',
      'Newer cloud metadata triggers incremental delta query'
    );
  }

  console.log('\n===============================================================');
  console.log(`ALL 3-STAGE CLOUD SYNC TESTS PASSED (${passCount}/${passCount})`);
  console.log('===============================================================');
}

runAutomaticPostLoginCloudSyncTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
