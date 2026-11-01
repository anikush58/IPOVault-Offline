import { isLightBackground, getStatusBarStyleForColor } from '../utils/colorUtils';

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

function runAutoStatusBarTests() {
  console.log('===============================================================');
  console.log('RUNNING AUTO STATUS BAR & LUMINANCE ADAPTATION TEST SUITE');
  console.log('===============================================================');

  // Test 1: Onboarding and Auth Screen Background (#F9FBFE)
  console.log('\n--- TEST 1: Auth & Onboarding Screen Background (#F9FBFE) ---');
  {
    const isLight = isLightBackground('#F9FBFE');
    assert(isLight === true, 'TEST 1.1', '#F9FBFE is correctly identified as a light background');
    const statusBarStyle = getStatusBarStyleForColor('#F9FBFE');
    assert(statusBarStyle === 'dark', 'TEST 1.2', '#F9FBFE yields "dark" status bar content for high visibility');
  }

  // Test 2: Standard Light Theme Colors
  console.log('\n--- TEST 2: Standard Light Theme Colors ---');
  {
    assert(isLightBackground('#FFFFFF') === true, 'TEST 2.1', '#FFFFFF is light -> "dark" icons');
    assert(getStatusBarStyleForColor('#FFFFFF') === 'dark', 'TEST 2.2', '#FFFFFF yields dark status bar style');
    assert(isLightBackground('#FAFAFC') === true, 'TEST 2.3', '#FAFAFC is light -> "dark" icons');
    assert(isLightBackground('#F8F9FA') === true, 'TEST 2.4', '#F8F9FA is light -> "dark" icons');
    assert(isLightBackground('rgb(249, 251, 254)') === true, 'TEST 2.5', 'rgb(249, 251, 254) is light -> "dark" icons');
    assert(isLightBackground('rgba(255, 255, 255, 0.95)') === true, 'TEST 2.6', 'rgba white is light -> "dark" icons');
    assert(isLightBackground('white') === true, 'TEST 2.7', 'named "white" is light -> "dark" icons');
  }

  // Test 3: Standard Dark Theme Colors
  console.log('\n--- TEST 3: Standard Dark Theme Colors ---');
  {
    assert(isLightBackground('#090A0F') === false, 'TEST 3.1', '#090A0F (app dark bg) is dark -> "light" icons');
    assert(getStatusBarStyleForColor('#090A0F') === 'light', 'TEST 3.2', '#090A0F yields light status bar style');
    assert(isLightBackground('#000000') === false, 'TEST 3.3', '#000000 is dark -> "light" icons');
    assert(isLightBackground('#1E293B') === false, 'TEST 3.4', '#1E293B is dark -> "light" icons');
    assert(isLightBackground('rgb(15, 23, 42)') === false, 'TEST 3.5', 'rgb(15, 23, 42) is dark -> "light" icons');
    assert(isLightBackground('black') === false, 'TEST 3.6', 'named "black" is dark -> "light" icons');
  }

  // Test 4: Edge Cases and Graceful Defaults
  console.log('\n--- TEST 4: Edge Cases & Graceful Defaults ---');
  {
    assert(isLightBackground('') === true, 'TEST 4.1', 'empty string defaults safely to light');
    assert(isLightBackground(undefined) === true, 'TEST 4.2', 'undefined defaults safely to light');
    assert(isLightBackground('transparent') === true, 'TEST 4.3', '"transparent" defaults safely to light');
    assert(getStatusBarStyleForColor('') === 'dark', 'TEST 4.4', 'empty string yields dark status bar');
  }

  console.log('\n===============================================================');
  console.log(`ALL AUTO STATUS BAR TESTS PASSED (${passCount}/${passCount})`);
  console.log('===============================================================');
}

runAutoStatusBarTests();
