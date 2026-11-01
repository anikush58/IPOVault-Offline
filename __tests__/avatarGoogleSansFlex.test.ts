/**
 * Avatar Google Sans Flex Typography & Rendering Test Suite
 *
 * Verifies:
 * 1. All avatar monogram/initial text styles across the entire mobile codebase
 *    explicitly use `GoogleSansFlex_700Bold` (or `fontFamily.sansBold` / `DesignSystem.typography.fontBold`).
 * 2. No conflicting `fontWeight` exists on any avatar style (preventing Android font synthesis bugs).
 * 3. `isCustomAvatarUrl` properly filters out DiceBear and SVG initials so that native Google Sans Flex
 *    vector gradients are rendered.
 * 4. `getCustomAvatarUrl` yields `null` for non-photo users, ensuring instant 0ms native rendering.
 * 5. All major screens (Users, Apply IPO, Bulk Apply, Allotment Checker, Settings, Account)
 *    route non-photo users to native Google Sans Flex initial avatars.
 */

import fs from 'fs';
import path from 'path';
import {
  isCustomAvatarUrl,
  getCustomAvatarUrl,
  getEffectiveAvatarUrl,
  getDiceBearAvatarUrl,
} from '../utils/avatarUtils';

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

export async function runAvatarTestSuite() {
  console.log('========================================================================');
  console.log('RUNNING GOOGLE SANS FLEX AVATAR TYPOGRAPHY & INTEGRITY AUDIT');
  console.log('========================================================================\n');

  const rootDir = path.resolve(__dirname, '..');

  // --- 1. Custom Avatar Detection Logic ---
  console.log('--- 1. Testing isCustomAvatarUrl & getCustomAvatarUrl ---');

  // Real user photo urls
  assert(
    isCustomAvatarUrl('https://res.cloudinary.com/ipovault/image/upload/v123/avatar.jpg') === true,
    'Custom Cloudinary',
    'Recognizes Cloudinary image URL as custom photo'
  );
  assert(
    isCustomAvatarUrl('https://firebasestorage.googleapis.com/v0/b/ipovault/o/photo.png') === true,
    'Custom Firebase Storage',
    'Recognizes Firebase Storage image URL as custom photo'
  );
  assert(
    isCustomAvatarUrl('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...') === true,
    'Custom Data URL',
    'Recognizes base64 data:image URL as custom photo'
  );
  assert(
    isCustomAvatarUrl('file:///data/user/0/host.exp.exponent/cache/avatar.jpg') === true,
    'Custom Local File',
    'Recognizes local file:// asset as custom photo'
  );

  // DiceBear or SVG initials must NEVER be treated as custom photos
  assert(
    isCustomAvatarUrl('https://api.dicebear.com/10.x/initials/svg?seed=Anish') === false,
    'Reject DiceBear Seed',
    'DiceBear seed URL is rejected to prevent system-ui SVG override'
  );
  assert(
    isCustomAvatarUrl('https://api.dicebear.com/7.x/initials/svg?seed=Neha') === false,
    'Reject DiceBear v7',
    'DiceBear v7 URL is rejected'
  );
  assert(
    isCustomAvatarUrl('https://cdn.example.com/initials.svg') === false,
    'Reject Generic SVG Initial',
    'SVG initial URLs rejected so native Google Sans Flex text is displayed'
  );
  assert(
    isCustomAvatarUrl('') === false,
    'Reject Empty String',
    'Empty avatar url is not custom photo'
  );
  assert(
    isCustomAvatarUrl(null) === false,
    'Reject Null',
    'Null avatar url is not custom photo'
  );
  assert(
    isCustomAvatarUrl(undefined) === false,
    'Reject Undefined',
    'Undefined avatar url is not custom photo'
  );

  // getCustomAvatarUrl resolution
  const userWithPhoto = { id: 'u1', name: 'Anish', avatar_url: 'https://cloudinary.com/myphoto.jpg' };
  assert(
    getCustomAvatarUrl(userWithPhoto) === 'https://cloudinary.com/myphoto.jpg',
    'getCustomAvatarUrl Photo',
    'Extracts custom photo correctly'
  );

  const userWithDiceBear = { id: 'u2', name: 'Neha', avatar_url: 'https://api.dicebear.com/10.x/initials/svg?seed=Neha' };
  assert(
    getCustomAvatarUrl(userWithDiceBear) === null,
    'getCustomAvatarUrl DiceBear Null',
    'Returns null for DiceBear URL so native Google Sans Flex monogram is rendered'
  );

  const userNoPhoto = { id: 'u3', name: 'Rahul', avatar_url: '' };
  assert(
    getCustomAvatarUrl(userNoPhoto) === null,
    'getCustomAvatarUrl Empty Null',
    'Returns null for empty avatar so native Google Sans Flex monogram is rendered'
  );

  // Backwards compatibility for cloud backup
  assert(
    getDiceBearAvatarUrl('Anish') === 'https://api.dicebear.com/10.x/initials/svg?seed=Anish',
    'Backup Fallback DiceBear',
    'Maintains getDiceBearAvatarUrl for cloud backup serialization'
  );
  assert(
    getEffectiveAvatarUrl(userWithPhoto) === 'https://cloudinary.com/myphoto.jpg',
    'Effective Avatar Custom',
    'getEffectiveAvatarUrl preserves custom photos'
  );
  assert(
    getEffectiveAvatarUrl(userNoPhoto) === 'https://api.dicebear.com/10.x/initials/svg?seed=Rahul',
    'Effective Avatar Cloud Serialization',
    'getEffectiveAvatarUrl maintains deterministic seed URL for cloud backups'
  );

  // --- 2. Codebase Scan: Avatar Typography & Font Weights ---
  console.log('\n--- 2. Auditing Avatar Monogram Typography across App & Components ---');

  const avatarFiles = [
    'components/UserCard.tsx',
    'components/ApplicationCard.tsx',
    'components/UpdateApplicationModal.tsx',
    'components/BulkApplySheet.tsx',
    'components/allotment/AllotmentSuccessModal.tsx',
    'components/compare/CompareCard.tsx',
    'components/ipo/IPOCard.tsx',
    'components/ipo/IPODetailsLayout.tsx',
    'components/ipo/IPODiscoverTab.tsx',
    'components/AddUserModal.tsx',
    'app/allotment-checker.tsx',
    'app/apply-ipo.tsx',
    'app/bulk-apply.tsx',
    'app/ipo-management.tsx',
    'app/new-ipos.tsx',
    'app/portfolio-report.tsx',
    'app/pro-details.tsx',
    'app/settings-account.tsx',
    'app/(tabs)/bids.tsx',
    'app/(tabs)/settings.tsx',
  ];

  for (const relFile of avatarFiles) {
    const fullPath = path.join(rootDir, relFile);
    assert(fs.existsSync(fullPath), 'File Exists', `${relFile} exists`);
    const fileContent = fs.readFileSync(fullPath, 'utf8');

    // Find all style objects containing avatar/monogram/initial
    const regex = /([a-zA-Z0-9_-]*(avatar|monogram|initial)[a-zA-Z0-9_-]*)\s*:\s*\{([^}]+)\}/gi;
    let match;
    let checkedStylesInFile = 0;

    while ((match = regex.exec(fileContent)) !== null) {
      const styleName = match[1];
      const body = match[3];

      // If this style formats text (has fontSize or is a known text style, not a View container)
      const isContainer = /Container|Wrap|Section|Outer|Circle|Box|Row|Badge|Item|Btn/i.test(styleName);
      if (!isContainer && (body.includes('fontSize') || /text|letter|initial/i.test(styleName))) {
        // 1. Verify it specifies GoogleSansFlex
        const hasGoogleSans =
          body.includes('GoogleSansFlex_700Bold') ||
          body.includes('GoogleSansFlex_600SemiBold') ||
          body.includes('DesignSystem.typography.fontBold');
        assert(
          hasGoogleSans,
          `Avatar Font: ${relFile}`,
          `Style '${styleName}' declares Google Sans Flex (found: ${body.trim().replace(/\s+/g, ' ')})`
        );

        // 2. Verify NO conflicting fontWeight (preventing Android faux-bold font distortion)
        const hasConflictingWeight = /fontWeight\s*:/i.test(body);
        assert(
          !hasConflictingWeight,
          `No Weight Conflict: ${relFile}`,
          `Style '${styleName}' does not declare conflicting fontWeight with Google Sans Flex`
        );

        checkedStylesInFile++;
      }
    }

    assert(
      checkedStylesInFile > 0,
      `Avatar Styles Found: ${relFile}`,
      `Verified ${checkedStylesInFile} avatar text styles in ${relFile}`
    );
  }

  // --- 3. Component Architecture: Image Override Prevention ---
  console.log('\n--- 3. Verifying Component Native Avatar Routing ---');

  // UserCard.tsx: uses getCustomAvatarUrl so Image never mounts for default users
  const userCardContent = fs.readFileSync(path.join(rootDir, 'components', 'UserCard.tsx'), 'utf8');
  assert(
    userCardContent.includes('getCustomAvatarUrl(user)'),
    'UserCard Logic',
    'UserCard resolves custom avatar via getCustomAvatarUrl'
  );
  assert(
    userCardContent.includes('customAvatarUrl && !avatarError ?'),
    'UserCard Image Mount',
    'UserCard only renders Image when a real custom photo exists'
  );
  assert(
    userCardContent.includes('styles.avatarText'),
    'UserCard Native Gradient',
    'UserCard renders native LinearGradient with styles.avatarText'
  );

  // apply-ipo.tsx: uses getCustomAvatarUrl
  const applyIpoContent = fs.readFileSync(path.join(rootDir, 'app', 'apply-ipo.tsx'), 'utf8');
  assert(
    applyIpoContent.includes('getCustomAvatarUrl(user)'),
    'Apply IPO Logic',
    'apply-ipo resolves custom avatar via getCustomAvatarUrl'
  );
  assert(
    applyIpoContent.includes('customAvatar && !isFailedAvatar ?'),
    'Apply IPO Image Mount',
    'apply-ipo only renders Image when custom photo exists'
  );

  // bulk-apply.tsx: uses isCustomAvatarUrl
  const bulkApplyContent = fs.readFileSync(path.join(rootDir, 'app', 'bulk-apply.tsx'), 'utf8');
  assert(
    bulkApplyContent.includes('isCustomAvatarUrl(customAvatar)'),
    'Bulk Apply Logic',
    'bulk-apply validates custom avatar with isCustomAvatarUrl'
  );

  // BulkApplySheet.tsx: uses isCustomAvatarUrl
  const bulkSheetContent = fs.readFileSync(path.join(rootDir, 'components', 'BulkApplySheet.tsx'), 'utf8');
  assert(
    bulkSheetContent.includes('isCustomAvatarUrl(customAvatar)'),
    'BulkApplySheet Logic',
    'BulkApplySheet validates custom avatar with isCustomAvatarUrl'
  );

  // settings.tsx: uses isCustomAvatarUrl
  const settingsContent = fs.readFileSync(path.join(rootDir, 'app', '(tabs)', 'settings.tsx'), 'utf8');
  assert(
    settingsContent.includes('isCustomAvatarUrl(avatarUri)'),
    'Settings Logic',
    'settings validates avatarUri with isCustomAvatarUrl'
  );

  // settings-account.tsx: uses isCustomAvatarUrl
  const settingsAccountContent = fs.readFileSync(path.join(rootDir, 'app', 'settings-account.tsx'), 'utf8');
  assert(
    settingsAccountContent.includes('isCustomAvatarUrl(avatarUri'),
    'Settings Account Logic',
    'settings-account validates avatar with isCustomAvatarUrl'
  );

  // AddUserModal.tsx: uses isCustomAvatarUrl
  const addUserModalContent = fs.readFileSync(path.join(rootDir, 'components', 'AddUserModal.tsx'), 'utf8');
  assert(
    addUserModalContent.includes('isCustomAvatarUrl(avatarUrl)'),
    'AddUserModal Logic',
    'AddUserModal validates avatarUrl with isCustomAvatarUrl'
  );
  assert(
    addUserModalContent.includes('avatarPlaceholderInitial'),
    'AddUserModal Initial',
    'AddUserModal displays Google Sans Flex initial in placeholder'
  );

  console.log('\n========================================================================');
  console.log(`ALL AVATAR GOOGLE SANS FLEX AUDIT TESTS PASSED (${passCount} passed, ${failCount} failed)`);
  console.log('========================================================================\n');
}

runAvatarTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
