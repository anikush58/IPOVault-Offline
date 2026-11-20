import fs from 'fs';
import path from 'path';
import { formatDate, formatShortDate } from '../utils/formatters';
import { formatAllotmentTimestamp, getAllotmentItemMonthYear, AllotmentHistoryItem } from '../utils/allotmentHistoryUtils';

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

export function runDateFormatRegressionTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING DATE FORMAT DD-MM-YYYY REGRESSION TEST SUITE');
  console.log('===============================================================\n');

  // Test 1: formatDate from ISO YYYY-MM-DD
  const isoFormatted = formatDate('2026-09-17');
  assert(
    isoFormatted === '17-09-2026',
    'formatDate - ISO string',
    `Expected '17-09-2026' but got '${isoFormatted}'`
  );

  // Test 2: formatDate from already DD-MM-YYYY
  const dmyFormatted = formatDate('25-12-2025');
  assert(
    dmyFormatted === '25-12-2025',
    'formatDate - DD-MM-YYYY input',
    `Expected '25-12-2025' but got '${dmyFormatted}'`
  );

  // Test 3: formatDate from slash separated DD/MM/YYYY
  const slashFormatted = formatDate('05/04/2026');
  assert(
    slashFormatted === '05-04-2026',
    'formatDate - DD/MM/YYYY input normalized to DD-MM-YYYY',
    `Expected '05-04-2026' but got '${slashFormatted}'`
  );

  // Test 4: formatDate from Date object
  const dateObj = new Date(2027, 2, 8); // March 8, 2027
  const dateObjFormatted = formatDate(dateObj);
  assert(
    dateObjFormatted === '08-03-2027',
    'formatDate - Date object',
    `Expected '08-03-2027' but got '${dateObjFormatted}'`
  );

  // Test 5: formatDate enforces DD-MM-YYYY regex and no slashes
  const testSample = formatDate('2024-01-02');
  assert(
    /^\d{2}-\d{2}-\d{4}$/.test(testSample),
    'formatDate - Regex enforcement',
    `'${testSample}' matches DD-MM-YYYY`
  );
  assert(
    !testSample.includes('/'),
    'formatDate - No slashes',
    `'${testSample}' does not contain slashes`
  );

  // Test 6: formatDate safe fallbacks
  assert(formatDate(null) === 'N/A', 'formatDate - null', 'Returns N/A');
  assert(formatDate(undefined) === 'N/A', 'formatDate - undefined', 'Returns N/A');
  assert(formatDate(false) === 'N/A', 'formatDate - boolean false', 'Returns N/A');
  assert(formatDate('invalid-date') === 'N/A', 'formatDate - invalid string', 'Returns N/A');

  // Test 7: formatShortDate returns DD-MM
  const shortDate = formatShortDate('2026-09-17');
  assert(
    shortDate === '17-09',
    'formatShortDate - Output',
    `Expected '17-09' but got '${shortDate}'`
  );

  // Test 8: formatAllotmentTimestamp returns DD-MM-YYYY
  const altTimestamp = formatAllotmentTimestamp('2026-10-29T13:45:00.000Z');
  assert(
    altTimestamp !== undefined && /^\d{2}-\d{2}-\d{4}$/.test(altTimestamp),
    'formatAllotmentTimestamp - DD-MM-YYYY format',
    `Timestamp formatted to '${altTimestamp}'`
  );

  // Test 9: getAllotmentItemMonthYear parses DD-MM-YYYY checkedAtFormatted
  const mockItem: AllotmentHistoryItem = {
    id: 'mock_1',
    ipoName: 'Test IPO',
    userName: 'Tester',
    pan: 'ABCDE1234F',
    status: 'ALLOTTED',
    checkedAtFormatted: '29-10-2026',
  };
  const my = getAllotmentItemMonthYear(mockItem);
  assert(
    my !== null && my.month === 'Oct' && my.year === 2026 && my.label === 'Oct 26',
    'getAllotmentItemMonthYear - DD-MM-YYYY support',
    `Parsed month '${my?.month}' year '${my?.year}' label '${my?.label}'`
  );

  // Test 10: Static source verification for DatePickerModal
  const datePickerPath = path.resolve(__dirname, '../components/DatePickerModal.tsx');
  const datePickerContent = fs.readFileSync(datePickerPath, 'utf8');
  assert(
    datePickerContent.includes("selected.getFullYear()}`}") &&
    datePickerContent.includes("selected.getDate()).padStart(2, '0')}-${String(selected.getMonth() + 1).padStart(2, '0')}-${selected.getFullYear()}"),
    'DatePickerModal - Static Source Check',
    'DatePickerModal formats selected date display as DD-MM-YYYY'
  );

  // Test 11: Static source verification for IPODetailsLayout formatFullDate
  const ipoDetailsPath = path.resolve(__dirname, '../components/ipo/IPODetailsLayout.tsx');
  const ipoDetailsContent = fs.readFileSync(ipoDetailsPath, 'utf8');
  assert(
    ipoDetailsContent.includes('return `${day}-${month}-${year}`;'),
    'IPODetailsLayout - formatFullDate Static Source Check',
    'formatFullDate returns DD-MM-YYYY'
  );

  // Test 12: Static source verification for IPODetailsLayout updatedText
  assert(
    ipoDetailsContent.includes('updatedText = `Updated ${formatDate(observedAt)}, ${timeStr}`;'),
    'IPODetailsLayout - updatedText Static Source Check',
    'updatedText uses formatDate for DD-MM-YYYY'
  );

  // Test 13: Static source verification for IPOCalendar formatDateDisplay
  const calendarPath = path.resolve(__dirname, '../app/ipo-calendar.tsx');
  const calendarContent = fs.readFileSync(calendarPath, 'utf8');
  assert(
    calendarContent.includes('full: `${days[d.getDay()]}, ${day}-${month}-${year}`'),
    'IPOCalendar - formatDateDisplay Static Source Check',
    'Calendar displays dates as Day, DD-MM-YYYY'
  );

  // Test 14: Static source verification for AddIPOModal & add-ipo.tsx
  const addIpoModalPath = path.resolve(__dirname, '../components/AddIPOModal.tsx');
  const addIpoModalContent = fs.readFileSync(addIpoModalPath, 'utf8');
  assert(
    addIpoModalContent.includes('{value ? formatDate(value) : \'Select date\'}'),
    'AddIPOModal - Static Source Check',
    'AddIPOModal formats dates with formatDate'
  );

  const addIpoPagePath = path.resolve(__dirname, '../app/add-ipo.tsx');
  const addIpoPageContent = fs.readFileSync(addIpoPagePath, 'utf8');
  assert(
    addIpoPageContent.includes('{formOpenDate ? formatDate(formOpenDate) : \'Select\'}'),
    'app/add-ipo.tsx - Static Source Check',
    'add-ipo.tsx formats dates with formatDate'
  );

  console.log(`\n===============================================================`);
  console.log(`Date format test suite completed: ${passCount} passed, ${failCount} failed.`);
  console.log(`===============================================================\n`);
}

runDateFormatRegressionTestSuite();
