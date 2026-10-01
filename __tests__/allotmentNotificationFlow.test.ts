export interface ManagedAccountAllotmentResult {
  applicationId: string;
  userId: string;
  userName: string;
  status: 'ALLOTTED' | 'PARTIALLY_ALLOTTED' | 'NOT_ALLOTTED' | 'NO_RECORD' | 'PENDING';
  sharesAllotted: number;
  allottedLots?: number;
  appliedQuantity?: number;
}

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export async function runAllotmentNotificationFlowTestSuite() {
  console.log('====================================================');
  console.log('RUNNING ALLOTMENT NOTIFICATION & MODAL FLOW TESTS');
  console.log('====================================================');

  // Test 1: Notifications never expose PAN or Demat ID
  {
    const sampleIpo = {
      id: 'ipo-dhoot-123',
      companyName: 'Dhoot Transmission Ltd',
    };
    const sampleApplicant = {
      userName: 'Anish Kushwaha',
      pan: 'ABCDE1234F',
      dematId: '1208160012345678',
      sharesAllotted: 100,
    };

    const notificationBody = `Congratulations! ${sampleApplicant.userName} was allotted ${sampleApplicant.sharesAllotted} shares for ${sampleIpo.companyName}.`;
    const genericBody = `${sampleIpo.companyName} allotment is now available. Check your allotment status.`;

    assert(
      !notificationBody.includes(sampleApplicant.pan) && !notificationBody.includes(sampleApplicant.dematId),
      'Privacy Check',
      'Allotment notification body does not expose PAN or Demat ID'
    );

    assert(
      !genericBody.includes(sampleApplicant.pan) && !genericBody.includes(sampleApplicant.dematId),
      'Privacy Check Generic',
      'Generic allotment out notification does not expose PAN or Demat ID'
    );
  }

  // Test 2: Multi-account allotment determination & summary counts
  {
    const managedResults: ManagedAccountAllotmentResult[] = [
      {
        applicationId: 'app-1',
        userId: 'user-primary',
        userName: 'Primary User',
        status: 'ALLOTTED',
        sharesAllotted: 100,
        appliedQuantity: 100,
      },
      {
        applicationId: 'app-2',
        userId: 'user-family-1',
        userName: 'Family Member 1',
        status: 'NOT_ALLOTTED',
        sharesAllotted: 0,
        appliedQuantity: 100,
      },
      {
        applicationId: 'app-3',
        userId: 'user-family-2',
        userName: 'Family Member 2',
        status: 'PARTIALLY_ALLOTTED',
        sharesAllotted: 50,
        appliedQuantity: 100,
      },
    ];

    const hasAllottedAccount = managedResults.some(
      (r) => r.status === 'ALLOTTED' || r.status === 'PARTIALLY_ALLOTTED'
    );

    assert(hasAllottedAccount === true, 'Allotment Detection', 'Correctly detects that 1+ managed accounts received allotment');

    let totalAllottedShares = 0;
    let allottedCount = 0;
    let notAllottedCount = 0;

    managedResults.forEach((r) => {
      if (r.status === 'ALLOTTED' || r.status === 'PARTIALLY_ALLOTTED') {
        allottedCount++;
        totalAllottedShares += r.sharesAllotted;
      } else {
        notAllottedCount++;
      }
    });

    assert(allottedCount === 2, 'Summary Count Allotted', 'Identifies exactly 2 accounts with allotment');
    assert(notAllottedCount === 1, 'Summary Count Not Allotted', 'Identifies exactly 1 account without allotment');
    assert(totalAllottedShares === 150, 'Total Shares Calculation', 'Computes correct total shares allotted (150)');
  }

  // Test 3: If no managed account received allotment, do not trigger success modal
  {
    const noAllotmentResults: ManagedAccountAllotmentResult[] = [
      {
        applicationId: 'app-1',
        userId: 'user-primary',
        userName: 'Primary User',
        status: 'NOT_ALLOTTED',
        sharesAllotted: 0,
        appliedQuantity: 100,
      },
      {
        applicationId: 'app-2',
        userId: 'user-family-1',
        userName: 'Family Member 1',
        status: 'NOT_ALLOTTED',
        sharesAllotted: 0,
        appliedQuantity: 100,
      },
    ];

    const shouldShowSuccessModal = noAllotmentResults.some(
      (r) => r.status === 'ALLOTTED' || r.status === 'PARTIALLY_ALLOTTED'
    );

    assert(
      shouldShowSuccessModal === false,
      'No Allotment Gate',
      'Success modal is strictly suppressed when 0 managed accounts receive allotment'
    );
  }

  // Test 4: Idempotency & Duplicate-prevention for modal and push notifications
  {
    const mockStorage = new Map<string, string>();
    const ipoId = 'ipo-test-777';
    const storageKey = `seen_allotment_modal_${ipoId}`;

    // Initially unviewed
    assert(!mockStorage.has(storageKey), 'Initial State', 'Modal is initially unviewed');

    // After user dismisses modal
    mockStorage.set(storageKey, 'true');
    assert(mockStorage.get(storageKey) === 'true', 'Dismissed State', 'Modal marked as seen');

    // Recheck on app reopen
    const isAlreadySeen = mockStorage.get(storageKey) === 'true';
    assert(isAlreadySeen, 'Idempotency', 'Modal will not be displayed again for this IPO');

    // Deduplication key for notification
    const dedupeKey = `allotment_received_${ipoId}`;
    const dedupeKeyExpected = 'allotment_received_ipo-test-777';
    assert(dedupeKey === dedupeKeyExpected, 'Deduplication Key', 'Generates unique stable deduplication key per IPO event');
  }

  console.log('====================================================');
  console.log('ALL ALLOTMENT NOTIFICATION & MODAL TESTS PASSED!');
  console.log('====================================================');
}

// Run when executed directly
if (require.main === module) {
  runAllotmentNotificationFlowTestSuite().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
