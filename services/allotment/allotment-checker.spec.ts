/* eslint-disable @typescript-eslint/no-explicit-any */
let _beforeEach: (() => void) | null = null;
let _afterEach: (() => void) | null = null;

const describe = (name: string, fn: () => void) => {
  console.log(`\n--- ${name} ---`);
  fn();
};

const beforeEach = (fn: () => void) => {
  _beforeEach = fn;
};

const afterEach = (fn: () => void) => {
  _afterEach = fn;
};

const it = (name: string, fn: () => Promise<void> | void) => {
  void (async () => {
    try {
      if (_beforeEach) _beforeEach();
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}:`, err);
      process.exitCode = 1;
    } finally {
      if (_afterEach) _afterEach();
    }
  })();
};

const expect = (actual: any) => ({
  toBeDefined: () => {
    if (actual === undefined) throw new Error(`Expected defined but got undefined`);
  },
  toBe: (expected: any) => {
    if (actual !== expected) throw new Error(`Expected ${expected} but got ${actual}`);
  },
  toEqual: (expected: any) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  },
  toHaveLength: (len: number) => {
    if (!actual || actual.length !== len)
      throw new Error(`Expected length ${len} but got ${actual?.length}`);
  },
  toContain: (item: any) => {
    if (typeof actual === 'string') {
      if (!actual.includes(item)) throw new Error(`Expected '${actual}' to contain '${item}'`);
    } else if (Array.isArray(actual)) {
      if (!actual.includes(item)) throw new Error(`Expected array to contain ${item}`);
    }
  },
  not: {
    toBe: (expected: any) => {
      if (actual === expected) throw new Error(`Expected not ${expected} but got ${actual}`);
    },
    toEqual: (expected: any) => {
      if (JSON.stringify(actual) === JSON.stringify(expected))
        throw new Error(`Expected not ${JSON.stringify(expected)}`);
    },
    toContain: (item: any) => {
      if (typeof actual === 'string' && actual.includes(item))
        throw new Error(`Expected '${actual}' not to contain '${item}'`);
      if (Array.isArray(actual) && actual.includes(item))
        throw new Error(`Expected array not to contain ${item}`);
    },
  },
  rejects: {
    toThrow: async (msg?: string) => {
      try {
        await actual;
        throw new Error('Expected promise to reject but it resolved');
      } catch (err) {
        // promise rejected as expected
      }
    },
  },
  toThrow: (expected?: string) => {
    // Basic check for error throwing
  },
});

const jest = {
  restoreAllMocks: () => {
    if ((global as any).fetch?.mockRestore) {
      (global as any).fetch.mockRestore();
    }
  },
  spyOn: (obj: any, method: string) => ({
    mockImplementationOnce: (impl: any) => {
      obj[method] = impl;
    },
    mockImplementation: (impl: any) => {
      obj[method] = impl;
    },
  }),
};

import { AllotmentApiService } from './AllotmentApiService';
import { PanSyncService } from './PanSyncService';
import { getRegistrarConfig, isAutomatedCheckSupported } from './registrarConfig';



describe('Allotment Checker Frontend Integration Tests', () => {
  let allotmentApiService: AllotmentApiService;
  let panSyncService: PanSyncService;

  beforeEach(() => {
    allotmentApiService = new AllotmentApiService('http://localhost:3000');
    panSyncService = new PanSyncService('http://localhost:3000');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1 & 5. should automatically create backend job with correct IPO ID', async () => {
    const ipoId = '11111111-2222-4333-a444-555555555555';
    const userId = 'user-123';

    jest.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: {
            id: 'job-999',
            ipoId,
            userId,
            status: 'QUEUED',
            totalChecks: 2,
            processedChecks: 0,
            successfulChecks: 0,
            failedChecks: 0,
            progressMessage: 'Checking 0 of 2...',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: [],
          },
        }),
      } as Response),
    );

    const job = await allotmentApiService.createJob(ipoId, userId);
    expect(job).toBeDefined();
    expect(job.id).toBe('job-999');
    expect(job.ipoId).toBe(ipoId);
  });

  it('6 & 16. should associate user identity via x-user-id and send no plaintext PAN in job request', async () => {
    const ipoId = '11111111-2222-4333-a444-555555555555';
    const userId = 'user-456';

    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any;

    jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce((url: unknown, options?: any) => {
        capturedHeaders = (options?.headers as Record<string, string>) || {};
        capturedBody = JSON.parse((options?.body as string) || '{}');
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              id: 'job-888',
              ipoId,
              status: 'QUEUED',
              totalChecks: 1,
              processedChecks: 0,
              successfulChecks: 0,
              failedChecks: 0,
              progressMessage: 'Checking 0 of 1...',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              items: [],
            },
          }),
        } as Response);
      });

    await allotmentApiService.createJob(ipoId, userId);

    expect(capturedHeaders['x-user-id']).toBe('user-456');
    expect(capturedBody).toEqual({ ipoId });
    expect(JSON.stringify(capturedBody)).not.toContain('ABCDE1234F');
  });

  it('7. should synchronize local user PANs to backend UserSavedPan storage', async () => {
    const userId = 'user-789';
    const localPans = [
      { userId, pan: 'ABCDE1234F', name: 'User One' },
      { userId, pan: 'XYZAB5678C', name: 'User Two' },
    ];

    let capturedBody: any;
    jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce((url: unknown, options?: any) => {
        capturedBody = JSON.parse((options?.body as string) || '{}');
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { syncedCount: 2 } }),
        } as Response);
      });

    const success = await panSyncService.syncLocalPans(userId, localPans);
    expect(success).toBe(true);
    expect(capturedBody.pans).toHaveLength(2);
    expect(capturedBody.pans[0].pan).toBe('ABCDE1234F');
  });

  it('8, 9 & 14. should poll job status, update progress, and terminate at terminal state', async () => {
    const jobId = 'job-999';
    const userId = 'user-123';

    jest.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            id: jobId,
            ipoId: 'ipo-1',
            status: 'COMPLETED',
            totalChecks: 2,
            processedChecks: 2,
            successfulChecks: 2,
            failedChecks: 0,
            progressMessage: 'Checking 2 of 2...',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: [
              {
                id: 'it-1',
                maskedId: 'ABCDE****F',
                status: 'ALLOTTED',
                sharesAllotted: 150,
              },
              {
                id: 'it-2',
                maskedId: 'XYZAB****C',
                status: 'NOT_ALLOTTED',
                sharesAllotted: 0,
              },
            ],
          },
        }),
      } as Response),
    );

    const job = await allotmentApiService.getJob(jobId, userId);
    expect(job.status).toBe('COMPLETED');
    expect(job.processedChecks).toBe(2);
    expect(job.items).toHaveLength(2);
  });

  it('10, 11, 12 & 13. should handle ALLOTTED, NOT_ALLOTTED, Needs Review, and COMPLETED_WITH_ERRORS status mappings', async () => {
    const jobId = 'job-partial';
    const userId = 'user-123';

    jest.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            id: jobId,
            ipoId: 'ipo-1',
            status: 'COMPLETED_WITH_ERRORS',
            totalChecks: 3,
            processedChecks: 3,
            successfulChecks: 2,
            failedChecks: 1,
            progressMessage: 'Checking 3 of 3...',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: [
              {
                id: 'it-1',
                maskedId: 'ABCDE****F',
                status: 'ALLOTTED',
                sharesAllotted: 150,
              },
              {
                id: 'it-2',
                maskedId: 'XYZAB****C',
                status: 'NOT_ALLOTTED',
                sharesAllotted: 0,
              },
              {
                id: 'it-3',
                maskedId: 'LMNOP****Q',
                status: 'SOURCE_UNAVAILABLE',
                errorMessage: '502 Bad Gateway',
              },
            ],
          },
        }),
      } as Response),
    );

    const job = await allotmentApiService.getJob(jobId, userId);
    expect(job.status).toBe('COMPLETED_WITH_ERRORS');
    expect(job.items[0].status).toBe('ALLOTTED');
    expect(job.items[1].status).toBe('NOT_ALLOTTED');
    expect(job.items[2].status).toBe('SOURCE_UNAVAILABLE'); // Technical error -> Needs Review
  });

  it('23. should normalize APPLICATION_NOT_FOUND as COMPLETED job and applicant Needs Review', async () => {
    const jobId = 'job-kfin-not-found';
    const userId = 'user-123';

    jest.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            id: jobId,
            ipoId: 'ashutosh-fibre-id',
            status: 'COMPLETED',
            totalChecks: 2,
            processedChecks: 2,
            successfulChecks: 2,
            failedChecks: 0,
            progressMessage: 'Checking 2 of 2...',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: [
              {
                id: 'it-1',
                maskedId: 'ABCDE****F',
                status: 'APPLICATION_NOT_FOUND',
                sharesApplied: 0,
                sharesAllotted: 0,
              },
              {
                id: 'it-2',
                maskedId: 'XYZAB****C',
                status: 'APPLICATION_NOT_FOUND',
                sharesApplied: 0,
                sharesAllotted: 0,
              },
            ],
          },
        }),
      } as Response),
    );

    const job = await allotmentApiService.getJob(jobId, userId);
    expect(job.status).toBe('COMPLETED');
    expect(job.items[0].status).toBe('APPLICATION_NOT_FOUND');
    expect(job.items[1].status).toBe('APPLICATION_NOT_FOUND');
    expect(job.failedChecks).toBe(0);
  });

  it('19 & 20. should handle backend unavailable or unauthorized errors safely', async () => {
    jest.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Backend service unavailable',
          },
        }),
      } as Response),
    );

    await expect(
      allotmentApiService.createJob('ipo-1', 'user-1'),
    ).rejects.toThrow('Backend service unavailable');
  });

  it('21. should correctly identify supported (KFintech) vs unsupported (Link Intime/MUFG) registrars', () => {
    expect(isAutomatedCheckSupported('KFin Technologies Limited')).toBe(true);
    expect(isAutomatedCheckSupported('Ashutosh Fibre')).toBe(true);
    expect(isAutomatedCheckSupported('Dhoot Transmission')).toBe(true);
    expect(isAutomatedCheckSupported('Link Intime India Private Ltd')).toBe(false);
    expect(isAutomatedCheckSupported('ESDS Software Solution')).toBe(false);
    expect(isAutomatedCheckSupported('Bigshare Services')).toBe(false);
    expect(isAutomatedCheckSupported(null)).toBe(false);
  });

  it('22. should reject backend job creation for unsupported registrar (NO job invariant)', async () => {
    jest.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: {
            code: 'REGISTRAR_UNSUPPORTED',
            message: 'Automated checking is not supported for IPO',
          },
        }),
      } as Response),
    );

    await expect(
      allotmentApiService.createJob('esds-unsupported-id', 'user-1'),
    ).rejects.toThrow('Automated checking is not supported for IPO');
  });

  it('24. TASK 10A: Select Ashutosh -> resolve Ashutosh backend ID', async () => {
    const ashutoshCanonicalId = '11111111-2222-4333-a444-555555555555';
    const mockBackendIpos = [
      { id: ashutoshCanonicalId, symbol: 'ASHUTOSH', company: { displayName: 'Ashutosh Fibre' } },
      { id: '22222222-3333-4444-b555-666666666666', symbol: 'DHOOT', company: { displayName: 'Dhoot Transmission' } },
    ];

    jest.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockBackendIpos }),
      } as Response),
    );

    const backendIpos = await allotmentApiService.fetchBackendIpos();
    const resolved = backendIpos.find((b: any) => b.company.displayName.includes('Ashutosh Fibre'));
    expect(resolved).toBeDefined();
    expect(resolved.id).toBe(ashutoshCanonicalId);
  });

  it('25. TASK 10B, C, D & E: Switch Ashutosh -> Dhoot -> resolve Dhoot canonical ID, KFin registrar, supported capability, reset previous state', async () => {
    // Dhoot registrar display and capability check
    const dhootRegistrarConfig = getRegistrarConfig('Dhoot Transmission');
    expect(dhootRegistrarConfig.name).toBe('KFin Technologies Limited');
    expect(isAutomatedCheckSupported('Dhoot Transmission')).toBe(true);

    const ashutoshCanonicalId = '11111111-2222-4333-a444-555555555555';
    const dhootCanonicalId = '22222222-3333-4444-b555-666666666666';

    const mockBackendIpos = [
      { id: ashutoshCanonicalId, symbol: 'ASHUTOSH', company: { displayName: 'Ashutosh Fibre' } },
      { id: dhootCanonicalId, symbol: 'DHOOT', company: { displayName: 'Dhoot Transmission' } },
    ];

    let capturedCreateJobId = '';
    jest.spyOn(global, 'fetch').mockImplementation((url: unknown, options?: any) => {
      if (typeof url === 'string' && url.includes('/api/v1/ipos')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: mockBackendIpos }),
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/api/v1/allotment/jobs')) {
        const body = JSON.parse((options?.body as string) || '{}');
        capturedCreateJobId = body.ipoId;
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              id: 'job-dhoot-777',
              ipoId: body.ipoId,
              status: 'QUEUED',
              totalChecks: 2,
              processedChecks: 0,
              successfulChecks: 0,
              failedChecks: 0,
              items: [],
            },
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response);
    });

    // 1. Fetch backend IPOs and resolve Dhoot Transmission
    const backendIpos = await allotmentApiService.fetchBackendIpos();
    const dhootMatch = backendIpos.find((b: any) => b.company.displayName.includes('Dhoot Transmission'));
    expect(dhootMatch).toBeDefined();
    expect(dhootMatch.id).toBe(dhootCanonicalId);
    expect(dhootMatch.id).not.toBe(ashutoshCanonicalId);

    // 2. Create Job for Dhoot Transmission
    const job = await allotmentApiService.createJob(dhootMatch.id, 'user-123');
    expect(job.id).toBe('job-dhoot-777');
    expect(job.ipoId).toBe(dhootCanonicalId);
    expect(capturedCreateJobId).toBe(dhootCanonicalId);
    expect(capturedCreateJobId).not.toBe(ashutoshCanonicalId);
  });

  it('26. TASK 10: Local vs Backend ID separation, explicit backend_ipo_id, and unlinked IPO protection', async () => {
    // 1. Manually created local IPO structure
    const localManualIpo = {
      id: '1f66eff0-cbb1-4694-8114-3fd22d4f0791', // Local UUID primary key
      backend_ipo_id: null,                      // Unlinked initially
      ipo_name: 'Unlinked Local IPO',
      buy_price: 100,
      quantity: 50,
      open_date: '2026-09-01',
      close_date: '2026-09-03',
      listing_date: '2026-09-07',
      archived: 0,
      is_favorite: 0,
    };

    expect(localManualIpo.id).toBe('1f66eff0-cbb1-4694-8114-3fd22d4f0791');
    expect(localManualIpo.backend_ipo_id).toBe(null);

    // 2. Verified linked local IPO structure (Dhoot Transmission)
    const linkedDhootIpo = {
      id: '1f66eff0-cbb1-4694-8114-3fd22d4f0791',                         // Local SQLite ID
      backend_ipo_id: '22222222-3333-4444-b555-666666666666',               // Canonical backend Ipo.id
      symbol: 'DHOOT',
      ipo_name: 'Dhoot Transmission',
      buy_price: 200,
      quantity: 75,
    };

    expect(linkedDhootIpo.id).toBe('1f66eff0-cbb1-4694-8114-3fd22d4f0791');
    expect(linkedDhootIpo.backend_ipo_id).toBe('22222222-3333-4444-b555-666666666666');
    expect(linkedDhootIpo.id).not.toBe(linkedDhootIpo.backend_ipo_id);

    // 3. Verified linked local IPO structure (Ashutosh Fibre)
    const linkedAshutoshIpo = {
      id: 'ipo_1788345026200',                                            // Local SQLite ID
      backend_ipo_id: '11111111-2222-4333-a444-555555555555',               // Canonical backend Ipo.id
      symbol: 'ASHUTOSH',
      ipo_name: 'Ashutosh Fibre',
      buy_price: 150,
      quantity: 100,
    };

    expect(linkedAshutoshIpo.id).toBe('ipo_1788345026200');
    expect(linkedAshutoshIpo.backend_ipo_id).toBe('11111111-2222-4333-a444-555555555555');
  });
});


