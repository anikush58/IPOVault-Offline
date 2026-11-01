import * as fs from 'fs';
import * as path from 'path';
import { maskApplicantName, MASK_APPLICANT_NAMES_KEY } from '../utils/formatters';

let passCount = 0;

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

function runNameMaskingTests() {
  console.log('===============================================================');
  console.log('RUNNING ALLOTMENT CHECKER APPLICANT NAME MASKING TEST SUITE');
  console.log('===============================================================');

  // Test 1: maskApplicantName edge cases
  console.log('\n--- TEST 1: maskApplicantName Edge Cases ---');
  {
    assert(maskApplicantName(undefined) === '', 'TEST 1.1', 'undefined returns empty string');
    assert(maskApplicantName(null) === '', 'TEST 1.2', 'null returns empty string');
    assert(maskApplicantName('') === '', 'TEST 1.3', 'empty string returns empty string');
    assert(maskApplicantName('   ') === '', 'TEST 1.4', 'whitespace returns empty string');
  }

  // Test 2: Standard Names Masking
  console.log('\n--- TEST 2: Standard Two-Word Names ---');
  {
    assert(maskApplicantName('Rahul Sharma') === 'R•••• S•••••', 'TEST 2.1', 'Rahul Sharma -> R•••• S•••••');
    assert(maskApplicantName('Anish Kumar') === 'A•••• K••••', 'TEST 2.2', 'Anish Kumar -> A•••• K••••');
    assert(maskApplicantName('John Doe') === 'J••• D••', 'TEST 2.3', 'John Doe -> J••• D••');
    assert(maskApplicantName('Mukesh Ambani') === 'M••••• A•••••', 'TEST 2.4', 'Mukesh Ambani -> M••••• A•••••');
  }

  // Test 3: Single-Word Names
  console.log('\n--- TEST 3: Single-Word Names ---');
  {
    assert(maskApplicantName('Om') === 'O•', 'TEST 3.1', 'Om -> O•');
    assert(maskApplicantName('Rahul') === 'R••••', 'TEST 3.2', 'Rahul -> R••••');
    assert(maskApplicantName('Applicant') === 'A••••••••', 'TEST 3.3', 'Applicant -> A••••••••');
    assert(maskApplicantName('A') === 'A', 'TEST 3.4', 'Single letter remains unchanged');
  }

  // Test 4: Multi-Word Names and Initials
  console.log('\n--- TEST 4: Multi-Word Names and Initials ---');
  {
    assert(
      maskApplicantName('Mohandas Karamchand Gandhi') === 'M••••••• K••••••••• G•••••',
      'TEST 4.1',
      'Mohandas Karamchand Gandhi -> M••••••• K••••••••• G•••••'
    );
    assert(maskApplicantName('A. K. Sharma') === 'A• K• S•••••', 'TEST 4.2', 'A. K. Sharma -> A• K• S•••••');
    assert(maskApplicantName('  Rahul   Sharma  ') === 'R•••• S•••••', 'TEST 4.3', 'Handles irregular spaces gracefully');
  }

  // Test 5: Storage Key
  console.log('\n--- TEST 5: Storage Key Definition ---');
  {
    assert(
      MASK_APPLICANT_NAMES_KEY === 'ipovault_mask_applicant_names',
      'TEST 5.1',
      'MASK_APPLICANT_NAMES_KEY is ipovault_mask_applicant_names'
    );
  }

  // Test 6: Header & Allotment Checker File Integrity
  console.log('\n--- TEST 6: File Verification in app/allotment-checker.tsx ---');
  {
    const filePath = path.join(__dirname, '..', 'app', 'allotment-checker.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // Button presence in headerRightActions beside history button
    assert(
      content.includes('styles.headerRightActions'),
      'TEST 6.1',
      'headerRightActions exists in allotment checker'
    );
    assert(
      content.includes('toggleMaskNames'),
      'TEST 6.2',
      'toggleMaskNames is wired to the mask toggle button'
    );
    assert(
      content.includes("name={isMaskNames ? 'eye-off' : 'eye'}"),
      'TEST 6.3',
      'Mask button toggles Feather eye/eye-off icon'
    );
    assert(
      content.includes('name="clock"'),
      'TEST 6.4',
      'Allotment history button with clock icon is present beside it'
    );

    // State persistence
    assert(
      content.includes('safeAsyncStorage') && content.includes('MASK_APPLICANT_NAMES_KEY'),
      'TEST 6.5',
      'Preference is loaded and saved to safeAsyncStorage'
    );
    assert(
      content.includes('Haptics.impactAsync'),
      'TEST 6.6',
      'Haptic feedback triggers on toggle'
    );

    // Masked rendering in result cards & modal
    assert(
      content.includes('isMaskNames ? maskApplicantName(applicant.userName) : applicant.userName'),
      'TEST 6.7',
      'Applicant name is conditionally masked in allotment result cards'
    );
    assert(
      content.includes('avatarUrl={isMaskNames ? undefined : applicant.avatarUrl}'),
      'TEST 6.8',
      'Applicant avatar hides face photo when masked to preserve complete privacy'
    );
    assert(
      content.includes('isMaskNames ? maskApplicantName(item.userName) : item.userName'),
      'TEST 6.9',
      'Applicant name is masked in Allotment History Modal rows'
    );
    assert(
      content.includes('paddingRight: 116'),
      'TEST 6.10',
      'headerCenterPro has safe horizontal padding (paddingRight: 116) to avoid collision with both header icons'
    );
  }

  console.log('\n===============================================================');
  console.log(`ALL ${passCount} ALLOTMENT CHECKER NAME MASKING TESTS PASSED!`);
  console.log('===============================================================\n');
}

runNameMaskingTests();
