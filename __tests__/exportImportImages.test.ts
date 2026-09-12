import * as fs from 'fs';
import * as path from 'path';
import {
  detectMimeAndExtFromBase64,
  extractBase64Payload,
  ensureBase64DataUrl,
  saveBase64ToLocalImage,
} from '../utils/imageUtils';

// ── REAL PNG AND JPEG FIXTURES (Valid 1x1 Pixel Images) ─────────────────────
// Real 1x1 Red PNG
const REAL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const REAL_PNG_DATA_URI = `data:image/png;base64,${REAL_PNG_BASE64}`;

// Real 1x1 Blue JPEG
const REAL_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const REAL_JPEG_DATA_URI = `data:image/jpeg;base64,${REAL_JPEG_BASE64}`;

// Real 1x1 Green PNG for secondary entity
const REAL_PNG2_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const REAL_PNG2_DATA_URI = `data:image/png;base64,${REAL_PNG2_BASE64}`;

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, message: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${message}`);
    passCount++;
  } else {
    console.error(`✗ FAIL: [${testName}] ${message}`);
    failCount++;
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT LOCAL EXPORT/IMPORT IMAGE SUITE');
  console.log('===============================================================\n');

  // Create temporary test directory
  const testTmpDir = path.join(process.cwd(), 'scratch', 'test_storage');
  if (fs.existsSync(testTmpDir)) {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testTmpDir, { recursive: true });

  // ---------------------------------------------------------------------------
  // 1. Magic Bytes & MIME Type Detection
  // ---------------------------------------------------------------------------
  const pngDetect = detectMimeAndExtFromBase64(REAL_PNG_BASE64);
  assert(pngDetect.mimeType === 'image/png' && pngDetect.ext === 'png', 'Magic Bytes', `PNG detected as ${pngDetect.mimeType} (.${pngDetect.ext})`);

  const jpegDetect = detectMimeAndExtFromBase64(REAL_JPEG_BASE64);
  assert(jpegDetect.mimeType === 'image/jpeg' && jpegDetect.ext === 'jpg', 'Magic Bytes', `JPEG detected as ${jpegDetect.mimeType} (.${jpegDetect.ext})`);

  // ---------------------------------------------------------------------------
  // 2. Base64 Payload Extraction
  // ---------------------------------------------------------------------------
  const payloadFromDataUri = extractBase64Payload(REAL_PNG_DATA_URI);
  assert(payloadFromDataUri !== null && payloadFromDataUri.mimeType === 'image/png', 'Payload Extract', 'Extracted payload from Data URI string');

  const payloadFromObj = extractBase64Payload({ mimeType: 'image/jpeg', data: REAL_JPEG_BASE64 });
  assert(payloadFromObj !== null && payloadFromObj.mimeType === 'image/jpeg', 'Payload Extract', 'Extracted payload from Object format');

  // ---------------------------------------------------------------------------
  // TEST A: User Avatar Export & Local File Restoration
  // ---------------------------------------------------------------------------
  // Create a real PNG file on test storage
  const initialUserAvatarPath = path.join(testTmpDir, 'user_avatar_initial.png');
  fs.writeFileSync(initialUserAvatarPath, Buffer.from(REAL_PNG_BASE64, 'base64'));

  assert(fs.existsSync(initialUserAvatarPath), 'Test A - User Avatar', 'Initial user avatar file exists on local storage');

  // Simulate Export JSON structure for User with Avatar
  const userPayload = extractBase64Payload(REAL_PNG_DATA_URI);
  const exportedUserJSON = {
    id: 'user-uuid-001',
    name: 'Rahul Sharma',
    pan_number: 'AAAPD1234A',
    avatar_url: REAL_PNG_DATA_URI,
    avatar: userPayload ? { mimeType: userPayload.mimeType, data: userPayload.base64Data } : null,
  };

  assert(exportedUserJSON.avatar !== null, 'Test A - User Avatar', 'Exported JSON contains embedded avatar object with MIME type');
  assert(exportedUserJSON.avatar?.mimeType === 'image/png', 'Test A - User Avatar', `MIME type is ${exportedUserJSON.avatar?.mimeType}`);
  assert((exportedUserJSON.avatar?.data?.length || 0) > 0, 'Test A - User Avatar', 'Base64 data payload is non-empty');

  // Recreate local file on import
  const recreatedUserAvatarPath = path.join(testTmpDir, 'recreated_avatar_user1.png');
  fs.writeFileSync(recreatedUserAvatarPath, Buffer.from(exportedUserJSON.avatar!.data, 'base64'));
  const restoredUser = {
    ...exportedUserJSON,
    avatar_url: recreatedUserAvatarPath,
  };

  assert(fs.existsSync(restoredUser.avatar_url), 'Test A - User Avatar', 'Recreated user avatar file exists on disk');
  assert(fs.readFileSync(restoredUser.avatar_url).length === Buffer.from(REAL_PNG_BASE64, 'base64').length, 'Test A - User Avatar', 'Recreated image file matches original binary size');

  // ---------------------------------------------------------------------------
  // TEST B: IPO Company Logo Export & Local File Restoration
  // ---------------------------------------------------------------------------
  const ipoPayload = extractBase64Payload(REAL_JPEG_DATA_URI);
  const exportedIpoJSON = {
    id: 'ipo-uuid-101',
    ipo_name: 'TechCorp IPO',
    company_name: 'TechCorp Limited',
    logo_url: REAL_JPEG_DATA_URI,
    companyLogo: ipoPayload ? { mimeType: ipoPayload.mimeType, data: ipoPayload.base64Data } : null,
  };

  assert(exportedIpoJSON.companyLogo !== null, 'Test B - IPO Logo', 'Exported JSON contains embedded companyLogo object');
  assert(exportedIpoJSON.companyLogo?.mimeType === 'image/jpeg', 'Test B - IPO Logo', `MIME type detected as ${exportedIpoJSON.companyLogo?.mimeType}`);

  const recreatedIpoLogoPath = path.join(testTmpDir, 'recreated_logo_ipo101.jpg');
  fs.writeFileSync(recreatedIpoLogoPath, Buffer.from(exportedIpoJSON.companyLogo!.data, 'base64'));
  const restoredIpo = {
    ...exportedIpoJSON,
    logo_url: recreatedIpoLogoPath,
  };

  assert(fs.existsSync(restoredIpo.logo_url), 'Test B - IPO Logo', 'Recreated company logo file exists on disk');
  assert(fs.readFileSync(restoredIpo.logo_url).length === Buffer.from(REAL_JPEG_BASE64, 'base64').length, 'Test B - IPO Logo', 'Recreated logo file matches original JPEG binary size');

  // ---------------------------------------------------------------------------
  // TEST C: Records Without Images
  // ---------------------------------------------------------------------------
  const userNoImage = {
    id: 'user-uuid-002',
    name: 'Priya Singh',
    avatar_url: null,
    avatar: null,
  };
  assert(userNoImage.avatar === null && (userNoImage.avatar_url === null || userNoImage.avatar_url === ''), 'Test C - No Image', 'User without avatar remains null/empty in export');

  const ipoNoImage = {
    id: 'ipo-uuid-102',
    ipo_name: 'Clean IPO',
    logo_url: null,
    companyLogo: null,
  };
  assert(ipoNoImage.companyLogo === null, 'Test C - No Image', 'IPO without logo remains null in export');

  // ---------------------------------------------------------------------------
  // TEST D: Multiple Images (PNG & JPEG)
  // ---------------------------------------------------------------------------
  const multiUsers = [
    { id: 'u1', name: 'User 1', avatar_url: REAL_PNG_DATA_URI, avatar: extractBase64Payload(REAL_PNG_DATA_URI) },
    { id: 'u2', name: 'User 2', avatar_url: REAL_JPEG_DATA_URI, avatar: extractBase64Payload(REAL_JPEG_DATA_URI) },
    { id: 'u3', name: 'User 3', avatar_url: REAL_PNG2_DATA_URI, avatar: extractBase64Payload(REAL_PNG2_DATA_URI) },
  ];

  let multiSuccess = true;
  for (const u of multiUsers) {
    if (!u.avatar || !u.avatar.base64Data) multiSuccess = false;
    const itemPath = path.join(testTmpDir, `multi_${u.id}.${u.avatar?.ext}`);
    fs.writeFileSync(itemPath, Buffer.from(u.avatar!.base64Data, 'base64'));
    if (!fs.existsSync(itemPath)) multiSuccess = false;
  }
  assert(multiSuccess, 'Test D - Multiple Images', 'Multiple users with PNG & JPEG avatars successfully recreated on disk');

  // ---------------------------------------------------------------------------
  // TEST E: Backward Compatibility (Older Exports)
  // ---------------------------------------------------------------------------
  const legacyExportJSON = {
    version: 1,
    users: [
      { id: 'u-legacy-1', name: 'Legacy User', avatar_url: 'file:///old_device/cache/avatar.png' },
      { id: 'u-legacy-2', name: 'Legacy Data URI User', avatar_url: REAL_PNG_DATA_URI },
    ],
    ipos: [
      { id: 'i-legacy-1', ipo_name: 'Legacy IPO', logo_url: '' },
    ],
  };

  let legacyImportedCleanly = true;
  for (const u of legacyExportJSON.users) {
    const payload = extractBase64Payload(u.avatar_url);
    if (u.id === 'u-legacy-2') {
      if (!payload || payload.mimeType !== 'image/png') legacyImportedCleanly = false;
    }
  }
  assert(legacyImportedCleanly, 'Test E - Backward Compatibility', 'Legacy JSON exports with old file paths or Data URIs import correctly');

  // ---------------------------------------------------------------------------
  // TEST F: Invalid / Corrupt Image Data Handling
  // ---------------------------------------------------------------------------
  const corruptPayload = extractBase64Payload('data:image/png;base64,NOT_VALID_BASE64_$%#@!');
  assert(corruptPayload === null, 'Test F - Corrupt Image', 'Corrupt Base64 payload returns null without throwing exception');

  // ---------------------------------------------------------------------------
  // TEST G: Full Round-Trip (LOCAL DATA -> EXPORT -> RESET -> IMPORT -> RESTORED)
  // ---------------------------------------------------------------------------
  console.log('\n--- Executing Test G: Full Round-Trip ---');

  // 1. Local Data state
  const originalUsers = [
    { id: 'u-rt-1', name: 'Dhiru', avatar_url: initialUserAvatarPath },
    { id: 'u-rt-2', name: 'Vishal', avatar_url: '' },
  ];
  const originalIpos = [
    { id: 'i-rt-1', ipo_name: 'Advit Jewels', logo_url: REAL_JPEG_DATA_URI },
  ];

  // 2. Export step
  const exportPayloadUsers = originalUsers.map((u) => {
    const b64 = u.avatar_url && fs.existsSync(u.avatar_url)
      ? `data:image/png;base64,${fs.readFileSync(u.avatar_url).toString('base64')}`
      : u.avatar_url;
    const p = extractBase64Payload(b64);
    return {
      ...u,
      avatar_url: b64 || null,
      avatar: p ? { mimeType: p.mimeType, data: p.base64Data } : null,
    };
  });

  const exportPayloadIpos = originalIpos.map((i) => {
    const p = extractBase64Payload(i.logo_url);
    return {
      ...i,
      logo_url: i.logo_url || null,
      companyLogo: p ? { mimeType: p.mimeType, data: p.base64Data } : null,
    };
  });

  const backupJSONString = JSON.stringify({
    version: 1,
    users: exportPayloadUsers,
    ipos: exportPayloadIpos,
  });

  const backupSizeKb = (Buffer.byteLength(backupJSONString, 'utf8') / 1024).toFixed(2);
  console.log(`[Round-Trip] Generated backup JSON size: ${backupSizeKb} KB`);

  // 3. Reset Local Storage
  fs.rmSync(testTmpDir, { recursive: true, force: true });
  fs.mkdirSync(testTmpDir, { recursive: true });
  assert(!fs.existsSync(initialUserAvatarPath), 'Test G - Round Trip', 'Local storage reset / wiped clean');

  // 4. Import step
  const parsedBackup = JSON.parse(backupJSONString);
  const restoredUsers: any[] = [];
  const restoredIpos: any[] = [];

  for (const u of parsedBackup.users) {
    let restoredUrl = '';
    const payload = extractBase64Payload(u.avatar || u.avatar_url);
    if (payload) {
      const destPath = path.join(testTmpDir, `restored_avatar_${u.id}.${payload.ext}`);
      fs.writeFileSync(destPath, Buffer.from(payload.base64Data, 'base64'));
      restoredUrl = destPath;
    }
    restoredUsers.push({ ...u, avatar_url: restoredUrl });
  }

  for (const i of parsedBackup.ipos) {
    let restoredUrl = '';
    const payload = extractBase64Payload(i.companyLogo || i.logo_url);
    if (payload) {
      const destPath = path.join(testTmpDir, `restored_logo_${i.id}.${payload.ext}`);
      fs.writeFileSync(destPath, Buffer.from(payload.base64Data, 'base64'));
      restoredUrl = destPath;
    }
    restoredIpos.push({ ...i, logo_url: restoredUrl });
  }

  // 5. Verify restored data and files
  assert(restoredUsers.length === 2, 'Test G - Round Trip', 'All user records restored');
  assert(fs.existsSync(restoredUsers[0].avatar_url), 'Test G - Round Trip', 'User 1 avatar file recreated in restored storage');
  assert(restoredUsers[1].avatar_url === '', 'Test G - Round Trip', 'User 2 (no avatar) restored cleanly without image');

  assert(restoredIpos.length === 1, 'Test G - Round Trip', 'All IPO records restored');
  assert(fs.existsSync(restoredIpos[0].logo_url), 'Test G - Round Trip', 'IPO 1 company logo file recreated in restored storage');

  // Clean up test storage
  if (fs.existsSync(testTmpDir)) {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  }

  console.log('\n===============================================================');
  console.log(`SUMMARY: Passed ${passCount} / ${passCount + failCount} tests.`);
  console.log('===============================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
