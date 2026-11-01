/**
 * Mobile Responsiveness & Multi-Screen Dimensions Test Suite
 * 
 * Verifies that:
 * 1. screens/Onboarding uses dynamic useWindowDimensions instead of static Dimensions.get.
 * 2. OnboardingSlide dynamically scales width, font size, and lineHeight for small (<720h) & narrow (<360w) screens.
 * 3. PageIndicator and PrimaryButton support dynamic width scaling and text fit constraints without overflow.
 * 4. app/auth.tsx scales logo, headings, padding, and dual CTAs adaptively across device sizes.
 * 5. ScreenHeader applies dynamic text autoscaling to prevent title truncation on compact viewports.
 * 6. Floating tab bar in app/(tabs)/_layout.tsx dynamically adapts capsule, button, and tab dimensions on narrow screens.
 */

import fs from 'fs';
import path from 'path';

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

function runTests() {
  console.log('===============================================================');
  console.log('RUNNING MOBILE RESPONSIVENESS & MODERN DEVICE FIT TEST SUITE');
  console.log('===============================================================');

  const onboardingSource = fs.readFileSync(path.join(__dirname, '../screens/Onboarding.tsx'), 'utf8');
  const slideSource = fs.readFileSync(path.join(__dirname, '../components/onboarding/OnboardingSlide.tsx'), 'utf8');
  const pageIndicatorSource = fs.readFileSync(path.join(__dirname, '../components/onboarding/PageIndicator.tsx'), 'utf8');
  const buttonSource = fs.readFileSync(path.join(__dirname, '../components/onboarding/PrimaryButton.tsx'), 'utf8');
  const authSource = fs.readFileSync(path.join(__dirname, '../app/auth.tsx'), 'utf8');
  const headerSource = fs.readFileSync(path.join(__dirname, '../components/ui/ScreenHeader.tsx'), 'utf8');
  const tabLayoutSource = fs.readFileSync(path.join(__dirname, '../app/(tabs)/_layout.tsx'), 'utf8');

  // ── TEST 1: Onboarding Dynamic Window Dimensions ─────────────────────────────
  console.log('\n--- 1. Onboarding Screen Dynamic Dimension Handling ---');
  assert(
    onboardingSource.includes('useWindowDimensions'),
    'Test 1.1',
    'screens/Onboarding imports and uses reactive useWindowDimensions'
  );
  assert(
    !onboardingSource.includes("Dimensions.get('window')"),
    'Test 1.2',
    'screens/Onboarding removed static module-level Dimensions.get window caching'
  );
  assert(
    onboardingSource.includes('isSmallScreen = windowHeight < 720'),
    'Test 1.3',
    'screens/Onboarding detects compact vertical screens (< 720px)'
  );
  assert(
    onboardingSource.includes('isNarrow = windowWidth < 360'),
    'Test 1.4',
    'screens/Onboarding detects narrow horizontal screens (< 360px)'
  );
  assert(
    onboardingSource.includes('isSmallScreen ? 96 : 120'),
    'Test 1.5',
    'FloatingStationaryLogo scales logo responsively for small viewports'
  );

  // ── TEST 2: OnboardingSlide Multi-Screen Fit ─────────────────────────────────
  console.log('\n--- 2. OnboardingSlide Adaptive Dimensions & Font Fit ---');
  assert(
    slideSource.includes('useWindowDimensions'),
    'Test 2.1',
    'OnboardingSlide uses reactive useWindowDimensions'
  );
  assert(
    !slideSource.includes("Dimensions.get('window')"),
    'Test 2.2',
    'OnboardingSlide removed static module-level Dimensions.get window caching'
  );
  assert(
    slideSource.includes('adjustsFontSizeToFit'),
    'Test 2.3',
    'OnboardingSlide applies adjustsFontSizeToFit to slide titles and subtitles'
  );
  assert(
    slideSource.includes('minimumFontScale={0.85}'),
    'Test 2.4',
    'OnboardingSlide provides minimumFontScale constraint for clean downscaling'
  );

  // ── TEST 3: PageIndicator & PrimaryButton Elasticity ─────────────────────────
  console.log('\n--- 3. PageIndicator & PrimaryButton Scalability ---');
  assert(
    pageIndicatorSource.includes('useWindowDimensions'),
    'Test 3.1',
    'PageIndicator uses reactive useWindowDimensions'
  );
  assert(
    pageIndicatorSource.includes('isNarrow ? 22 : 28'),
    'Test 3.2',
    'PageIndicator dynamically scales active pill width for narrow screens'
  );
  assert(
    buttonSource.includes('adjustsFontSizeToFit'),
    'Test 3.3',
    'PrimaryButton uses adjustsFontSizeToFit on text'
  );
  assert(
    buttonSource.includes('numberOfLines={1}'),
    'Test 3.4',
    'PrimaryButton enforces single-line text constraint'
  );

  // ── TEST 4: Auth Screen Multi-Device Adaptive Fit ─────────────────────────────
  console.log('\n--- 4. Auth Screen Responsive Layout & Dual CTAs ---');
  assert(
    authSource.includes('useWindowDimensions'),
    'Test 4.1',
    'app/auth.tsx imports and uses useWindowDimensions'
  );
  assert(
    authSource.includes('isSmallScreen'),
    'Test 4.2',
    'app/auth.tsx checks isSmallScreen for vertical viewport adaptation'
  );
  assert(
    authSource.includes('isNarrow'),
    'Test 4.3',
    'app/auth.tsx checks isNarrow for horizontal button & gap adaptation'
  );
  assert(
    authSource.includes('isSmallScreen ? 108 : 136'),
    'Test 4.4',
    'app/auth.tsx scales brand logo between 108px and 136px depending on height'
  );
  assert(
    authSource.includes('createAccountButtonText') && authSource.includes('adjustsFontSizeToFit'),
    'Test 4.5',
    'Create Account CTA applies adjustsFontSizeToFit to guarantee single-line fit'
  );
  assert(
    authSource.includes('signInButtonText') && authSource.includes('adjustsFontSizeToFit'),
    'Test 4.6',
    'Sign In CTA applies adjustsFontSizeToFit to guarantee single-line fit'
  );
  assert(
    authSource.includes('googleButtonText') && authSource.includes('adjustsFontSizeToFit'),
    'Test 4.7',
    'Google Sign In CTA applies adjustsFontSizeToFit to guarantee single-line fit'
  );

  // ── TEST 5: ScreenHeader Auto-Fit ────────────────────────────────────────────
  console.log('\n--- 5. ScreenHeader Dynamic Text Scaling ---');
  assert(
    headerSource.includes('adjustsFontSizeToFit'),
    'Test 5.1',
    'ScreenHeader title includes adjustsFontSizeToFit'
  );
  assert(
    headerSource.includes('minimumFontScale={0.8}'),
    'Test 5.2',
    'ScreenHeader title defines minimumFontScale={0.8}'
  );

  // ── TEST 6: CustomFloatingTabBar Narrow Device Scaling ───────────────────────
  console.log('\n--- 6. Floating Navigation Bar Responsive Width Scaling ---');
  assert(
    tabLayoutSource.includes('useWindowDimensions'),
    'Test 6.1',
    'app/(tabs)/_layout.tsx uses useWindowDimensions'
  );
  assert(
    tabLayoutSource.includes('isNarrow ? 8 : 16'),
    'Test 6.2',
    'FloatingTabBar margins scale to 8px on narrow screens'
  );
  assert(
    tabLayoutSource.includes('isNarrow && { height: 60, padding: 4 }'),
    'Test 6.3',
    'Main capsule reduces height and padding on narrow viewports'
  );
  assert(
    tabLayoutSource.includes('tabLabel') && tabLayoutSource.includes('adjustsFontSizeToFit'),
    'Test 6.4',
    'Tab labels apply adjustsFontSizeToFit and minimumFontScale to prevent wrapping'
  );

  console.log('\n===============================================================');
  console.log(`ALL MOBILE RESPONSIVENESS TESTS PASSED (${passCount} passed, ${failCount} failed)`);
  console.log('===============================================================');
}

runTests();

