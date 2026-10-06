import {
  evaluateLifecycle,
  calculateNormalizedIPOStatus,
  normalizeLifecycleStatus,
  getLifecycleStatusLabel,
  getISTDateTime,
} from '../services/ipo/statusNormalizer';
import { IPOParser } from '../services/ipo/ipoParser';

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

export async function runExpoGoIpoStatusTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING EXPO GO / MOBILE IPO LIFECYCLE STATUS TEST SUITE');
  console.log('===============================================================\n');

  // Case 1: Backend status ALLOTMENT_AWAITING -> mobile ALLOTTED_PENDING ("Allotment Awaited")
  {
    const record = {
      status: 'ALLOTMENT_AWAITING',
      open_date: '2026-10-01',
      close_date: '2026-10-05',
      allotment_date: '2026-10-08',
      listing_date: '2026-10-10',
    };
    const norm = calculateNormalizedIPOStatus(record, '2026-10-06');
    const label = getLifecycleStatusLabel(norm);
    assert(norm === 'ALLOTTED_PENDING', 'Case 1: ALLOTMENT_AWAITING', `Normalized status is ${norm}`);
    assert(label === 'Allotment Awaited', 'Case 1: UI Label', `Label is "${label}"`);
  }

  // Case 2: Backend status ALLOTMENT_PENDING -> mobile ALLOTTED_PENDING
  {
    const record = {
      status: 'ALLOTMENT_PENDING',
      open_date: '2026-10-01',
      close_date: '2026-10-05',
      allotment_date: '2026-10-08',
      listing_date: '2026-10-10',
    };
    const norm = calculateNormalizedIPOStatus(record, '2026-10-06');
    const label = getLifecycleStatusLabel(norm);
    assert(norm === 'ALLOTTED_PENDING', 'Case 2: ALLOTMENT_PENDING', `Normalized status is ${norm}`);
    assert(label === 'Allotment Awaited', 'Case 2: UI Label', `Label is "${label}"`);
  }

  // Case 3: Closing day at 16:59 IST -> CLOSING_TODAY
  {
    const record = {
      status: 'OPEN',
      open_date: '2026-10-01',
      close_date: '2026-10-06',
      allotment_date: '2026-10-08',
      listing_date: '2026-10-10',
    };
    const norm = calculateNormalizedIPOStatus(
      record,
      '2026-10-06',
      { hours: 16, minutes: 59 }
    );
    const label = getLifecycleStatusLabel(norm);
    assert(norm === 'CLOSING_TODAY', 'Case 3: Closing day 16:59 IST', `Status at 16:59 IST is ${norm}`);
    assert(label === 'Closing Today', 'Case 3: UI Label', `Label is "${label}"`);
  }

  // Case 4: Closing day at 17:00 IST -> CLOSED
  {
    const record = {
      status: 'CLOSING_TODAY',
      open_date: '2026-10-01',
      close_date: '2026-10-06',
      allotment_date: '2026-10-08',
      listing_date: '2026-10-10',
    };
    const norm = calculateNormalizedIPOStatus(
      record,
      '2026-10-06',
      { hours: 17, minutes: 0 }
    );
    const label = getLifecycleStatusLabel(norm);
    assert(norm === 'CLOSED', 'Case 4: Closing day 17:00 IST', `Status at 17:00 IST is ${norm}`);
    assert(label === 'Closed', 'Case 4: UI Label', `Label is "${label}"`);
  }

  // Case 5: Closing day at 17:01 IST -> CLOSED
  {
    const record = {
      status: 'CLOSING_TODAY',
      open_date: '2026-10-01',
      close_date: '2026-10-06',
      allotment_date: '2026-10-08',
      listing_date: '2026-10-10',
    };
    const norm = calculateNormalizedIPOStatus(
      record,
      '2026-10-06',
      { hours: 17, minutes: 1 }
    );
    const label = getLifecycleStatusLabel(norm);
    assert(norm === 'CLOSED', 'Case 5: Closing day 17:01 IST', `Status at 17:01 IST is ${norm}`);
    assert(label === 'Closed', 'Case 5: UI Label', `Label is "${label}"`);
  }

  // Case 6: Closed IPO with later allotment date/status -> must not remain CLOSED once ALLOTMENT_AWAITING or post-close date
  {
    // 6a: Backend explicit ALLOTMENT_AWAITING on a closed IPO
    const recordWithAwaiting = {
      status: 'ALLOTMENT_AWAITING',
      open_date: '2026-10-01',
      close_date: '2026-10-05',
      allotment_date: '2026-10-08',
      listing_date: '2026-10-10',
    };
    const norm6a = calculateNormalizedIPOStatus(recordWithAwaiting, '2026-10-06');
    assert(
      norm6a === 'ALLOTTED_PENDING',
      'Case 6a: ALLOTMENT_AWAITING precedence',
      'Does not remain CLOSED once backend sends ALLOTMENT_AWAITING'
    );

    // 6b: Post-close day progression (closeDate in past)
    const recordPastClose = {
      status: 'CLOSED',
      open_date: '2026-10-01',
      close_date: '2026-10-05',
      allotment_date: '2026-10-08',
      listing_date: '2026-10-10',
    };
    const norm6b = calculateNormalizedIPOStatus(recordPastClose, '2026-10-06');
    assert(
      norm6b === 'ALLOTTED_PENDING',
      'Case 6b: Post-close date progression',
      'Day after close date progresses from CLOSED to ALLOTTED_PENDING ("Allotment Awaited")'
    );
  }

  // Case 7: Same IPO after fresh API sync -> IPOParser parses latest status correctly
  {
    const rawApiPayload = {
      id: 'test-ipo-123',
      company_name: 'Test Tech Ltd',
      status: 'ALLOTMENT_AWAITING',
      open_date: '2026-10-01',
      close_date: '2026-10-05',
      allotment_date: '2026-10-08',
      listing_date: '2026-10-10',
    };
    const parsed = IPOParser.parse(rawApiPayload);
    assert(
      parsed.status === 'ALLOTTED_PENDING',
      'Case 7: Parser Sync Normalization',
      `Parsed status is ${parsed.status}`
    );
  }

  // Case 8: Expo Go and standalone parity (deterministic status calculation across environments)
  {
    const statusesToTest = [
      { input: 'UPCOMING', expected: 'UPCOMING' },
      { input: 'OPEN', expected: 'OPEN' },
      { input: 'LIVE NOW', expected: 'OPEN' },
      { input: 'CLOSING_TODAY', expected: 'CLOSING_TODAY' },
      { input: 'ALLOTMENT_AWAITING', expected: 'ALLOTTED_PENDING' },
      { input: 'ALLOTMENT_PENDING', expected: 'ALLOTTED_PENDING' },
      { input: 'ALLOTMENT_AWAITED', expected: 'ALLOTTED_PENDING' },
      { input: 'ALLOTMENT_OUT', expected: 'ALLOTTED_AVAILABLE' },
      { input: 'ALLOTTED_AVAILABLE', expected: 'ALLOTTED_AVAILABLE' },
      { input: 'LISTING_UPCOMING', expected: 'LISTING_UPCOMING' },
      { input: 'LISTED', expected: 'LISTED' },
    ];

    for (const item of statusesToTest) {
      const normalized = normalizeLifecycleStatus(item.input);
      assert(
        normalized === item.expected,
        `Case 8: Parity for ${item.input}`,
        `${item.input} -> ${normalized} (expected: ${item.expected})`
      );
    }
  }

  // Case 9: IST Timezone calculation check
  {
    // UTC 2026-10-06T11:29:00Z -> IST 2026-10-06 16:59
    const d1 = new Date('2026-10-06T11:29:00Z');
    const ist1 = getISTDateTime(d1);
    assert(
      ist1.istDate === '2026-10-06' && ist1.istHours === 16 && ist1.istMinutes === 59,
      'Case 9a: IST Time at 16:59',
      `UTC 11:29:00Z is IST ${ist1.istDate} ${ist1.istHours}:${ist1.istMinutes}`
    );

    // UTC 2026-10-06T11:30:00Z -> IST 2026-10-06 17:00
    const d2 = new Date('2026-10-06T11:30:00Z');
    const ist2 = getISTDateTime(d2);
    assert(
      ist2.istDate === '2026-10-06' && ist2.istHours === 17 && ist2.istMinutes === 0,
      'Case 9b: IST Time at 17:00',
      `UTC 11:30:00Z is IST ${ist2.istDate} ${ist2.istHours}:${ist2.istMinutes}`
    );
  }

  console.log(`\nTEST SUITE COMPLETED: ${passCount} PASSED, ${failCount} FAILED.\n`);
}

if (require.main === module) {
  runExpoGoIpoStatusTestSuite().catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
}
