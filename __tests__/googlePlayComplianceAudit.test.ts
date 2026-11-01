import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING GOOGLE PLAY PRODUCTION COMPLIANCE & SECURITY AUDIT TESTS');
  console.log('========================================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  let passed = 0;

  // 1. AndroidManifest.xml does not declare SYSTEM_ALERT_WINDOW
  {
    const manifestPath = path.join(rootDir, 'android/app/src/main/AndroidManifest.xml');
    const content = fs.readFileSync(manifestPath, 'utf8');
    assert(
      !content.includes('android.permission.SYSTEM_ALERT_WINDOW'),
      'SYSTEM_ALERT_WINDOW must NOT be declared in production AndroidManifest.xml',
    );
    passed++;
    console.log('✓ PASS: [1] SYSTEM_ALERT_WINDOW removed from production AndroidManifest.xml');
  }

  // 2. AndroidManifest.xml does not request broad READ/WRITE_EXTERNAL_STORAGE
  {
    const manifestPath = path.join(rootDir, 'android/app/src/main/AndroidManifest.xml');
    const content = fs.readFileSync(manifestPath, 'utf8');
    assert(
      !content.includes('android.permission.READ_EXTERNAL_STORAGE') &&
      !content.includes('android.permission.WRITE_EXTERNAL_STORAGE'),
      'Deprecated broad storage permissions must NOT be in AndroidManifest.xml',
    );
    passed++;
    console.log('✓ PASS: [2] Deprecated broad storage permissions removed (Scoped Storage compliant)');
  }

  // 3. AndroidManifest.xml disables allowBackup to protect local SQLite financial data
  {
    const manifestPath = path.join(rootDir, 'android/app/src/main/AndroidManifest.xml');
    const content = fs.readFileSync(manifestPath, 'utf8');
    assert(
      content.includes('android:allowBackup="false"'),
      'android:allowBackup="false" must be set to prevent adb backup data leakage',
    );
    passed++;
    console.log('✓ PASS: [3] android:allowBackup="false" verified (protects SQLite databases)');
  }

  // 4. Target SDK 36 configured in gradle.properties
  {
    const gradlePropsPath = path.join(rootDir, 'android/gradle.properties');
    const content = fs.readFileSync(gradlePropsPath, 'utf8');
    assert(
      content.includes('android.targetSdkVersion=36') && content.includes('android.compileSdkVersion=36'),
      'android.targetSdkVersion=36 must be configured for August 2026 Google Play policy',
    );
    passed++;
    console.log('✓ PASS: [4] Target SDK 36 and Compile SDK 36 configured in gradle.properties');
  }

  // 5. In-app Account Deletion provided in AuthContext and Settings Account screen
  {
    const authContextPath = path.join(rootDir, 'context/AuthContext.tsx');
    const authContent = fs.readFileSync(authContextPath, 'utf8');
    assert(
      authContent.includes('deleteAccount: () => Promise') &&
      authContent.includes('deleteCurrentUserAccount'),
      'AuthContext must provide deleteAccount function',
    );

    const settingsAccountPath = path.join(rootDir, 'app/settings-account.tsx');
    const settingsContent = fs.readFileSync(settingsAccountPath, 'utf8');
    assert(
      settingsContent.includes('handleDeleteAccount') &&
      settingsContent.includes('Delete Account'),
      'Settings Account screen must provide discoverable Delete Account action',
    );
    passed++;
    console.log('✓ PASS: [5] In-app Account Deletion implemented in AuthContext and Settings Account UI');
  }

  // 6. Privacy Policy accurately discloses Google AdMob SDK and Account Deletion
  {
    const privacyPolicyPath = path.join(rootDir, 'app/privacy-policy.tsx');
    const content = fs.readFileSync(privacyPolicyPath, 'utf8');
    assert(
      content.includes('Google AdMob'),
      'Privacy Policy must disclose Google AdMob advertising integration',
    );
    assert(
      !content.includes('There are no tracking or advertising SDKs embedded in the app.'),
      'Privacy Policy must NOT contain contradictory claims about advertising SDKs',
    );
    assert(
      content.includes('Delete Account'),
      'Privacy Policy must disclose account deletion mechanism',
    );
    passed++;
    console.log('✓ PASS: [6] Privacy Policy transparently discloses AdMob and user account deletion');
  }

  // 7. EAS production profile explicitly builds an app-bundle (AAB) with production ad serving
  {
    const easPath = path.join(rootDir, 'eas.json');
    const easJson = JSON.parse(fs.readFileSync(easPath, 'utf8'));
    assert(
      easJson.build.production.android.buildType === 'app-bundle',
      'EAS production profile must specify buildType "app-bundle"',
    );
    assert(
      easJson.build.production.env.EXPO_PUBLIC_USE_PROD_ADS === 'true',
      'EAS production profile must enable EXPO_PUBLIC_USE_PROD_ADS',
    );
    passed++;
    console.log('✓ PASS: [7] EAS production profile configured for Android App Bundle (AAB)');
  }

  // 8. Version code and version name are aligned across app.json and build.gradle
  {
    const appJsonPath = path.join(rootDir, 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

    const gradlePath = path.join(rootDir, 'android/app/build.gradle');
    const gradleContent = fs.readFileSync(gradlePath, 'utf8');

    assert(
      appJson.expo.version === '2.3.0',
      'app.json version must be 2.3.0',
    );
    assert(
      appJson.expo.android.versionCode === 2,
      'app.json versionCode must be 2',
    );
    assert(
      gradleContent.includes('versionCode 2'),
      'build.gradle must have versionCode 2',
    );
    assert(
      gradleContent.includes('versionName "2.3.0"'),
      'build.gradle must have versionName "2.3.0"',
    );
    passed++;
    console.log('✓ PASS: [8] App version (2.3.0) and versionCode (2) aligned across config files');
  }

  console.log(`\n========================================================================`);
  console.log(`ALL ${passed} GOOGLE PLAY COMPLIANCE & SECURITY AUDIT TESTS PASSED!`);
  console.log(`========================================================================\n`);
}

runTests().catch((err) => {
  console.error('\n❌ Google Play Compliance test failed:', err);
  process.exit(1);
});
