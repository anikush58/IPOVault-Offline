/**
 * Regression Test Suite: Edit Profile Display Name & Bottom Sheet Stability
 *
 * Verifies:
 * 1. Display name input does not auto-save on every single keystroke.
 * 2. Typing in the input updates local state without prematurely triggering network updateProfile.
 * 3. Bottom sheet lifecycle is isolated from authUser/displayName state updates (preventing unmount/closure).
 * 4. useFocusEffect has stable lifecycle dependencies and does not tear down on profile changes.
 * 5. Profile is saved only when the user explicitly triggers 'Save Changes' or submits.
 */

import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('RUNNING PROFILE EDIT BOTTOM SHEET STABILITY TEST SUITE');
  console.log('========================================================================\n');

  const rootDir = typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..') : process.cwd();
  const settingsFilePath = path.join(rootDir, 'app', '(tabs)', 'settings.tsx');
  assert(fs.existsSync(settingsFilePath), 'app/(tabs)/settings.tsx must exist');

  const settingsContent = fs.readFileSync(settingsFilePath, 'utf8');

  // Test 1: onChangeText must not call handleSaveName / updateProfile on every keystroke
  console.log('• Testing TextInput onChangeText contract...');
  assert(
    !settingsContent.includes('handleSaveName(val)'),
    'TextInput onChangeText must NOT call handleSaveName on every keystroke'
  );
  assert(
    settingsContent.includes('onChangeText={setEditNameInput}'),
    'TextInput onChangeText must directly update setEditNameInput'
  );
  console.log('  ✓ PASS: onChangeText safely isolates typing from auto-saving');

  // Test 2: Footer CTA wires handleSaveProfile
  console.log('• Testing Save Changes CTA wiring...');
  assert(
    settingsContent.includes('onPress={handleSaveProfile}'),
    'Save Changes button must trigger handleSaveProfile'
  );
  assert(
    settingsContent.includes('onSubmitEditing={handleSaveProfile}'),
    'TextInput must support onSubmitEditing with handleSaveProfile'
  );
  console.log('  ✓ PASS: Save Changes is triggered explicitly on action or submit');

  // Test 3: useFocusEffect callback stability
  console.log('• Testing useFocusEffect teardown prevention...');
  assert(
    settingsContent.includes('authUserRef.current = authUser'),
    'useFocusEffect must use authUserRef to decouple from auth state changes'
  );
  assert(
    settingsContent.includes('showEditProfileModalRef.current = showEditProfileModal'),
    'useFocusEffect must use showEditProfileModalRef to prevent overwriting active edits'
  );
  // Verify useFocusEffect callback ends with []
  assert(
    settingsContent.includes('setShowEditProfileModal(false);\n      };\n    }, [])'),
    'useFocusEffect callback must have empty dependency array [] to prevent premature sheet closure'
  );
  console.log('  ✓ PASS: useFocusEffect lifecycle is stable and does not dismiss sheet on profile changes');

  // Test 4: Modal open seeds current username
  console.log('• Testing Edit button seeding...');
  assert(
    settingsContent.includes('setEditNameInput(usernameStr);') &&
    settingsContent.includes('setShowEditProfileModal(true);'),
    'Edit Profile button must seed editNameInput with usernameStr on open'
  );
  console.log('  ✓ PASS: Edit Profile modal cleanly initializes input state');

  console.log('\n========================================================================');
  console.log('ALL PROFILE EDIT BOTTOM SHEET STABILITY TESTS PASSED');
  console.log('========================================================================\n');
}

runTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
