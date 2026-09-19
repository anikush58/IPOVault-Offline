import {
  getRegistrarConfig,
  isAutomatedCheckSupported,
} from '../services/allotment/registrarConfig';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export async function runRegistrarConfigTestSuite() {
  console.log('==================================================');
  console.log('RUNNING REGISTRAR CONFIG & MUFG ENABLEMENT TESTS');
  console.log('==================================================');

  // Test 1: KFIN and KFINTECH return true
  assert(
    isAutomatedCheckSupported('KFINTECH') === true,
    'Test 1a',
    'isAutomatedCheckSupported("KFINTECH") === true'
  );
  assert(
    isAutomatedCheckSupported('KFIN') === true,
    'Test 1b',
    'isAutomatedCheckSupported("KFIN") === true'
  );

  // Test 2: MUFG_INTIME, MUFG, MUFG Intime India return true
  assert(
    isAutomatedCheckSupported('MUFG_INTIME') === true,
    'Test 2a',
    'isAutomatedCheckSupported("MUFG_INTIME") === true'
  );
  assert(
    isAutomatedCheckSupported('MUFG') === true,
    'Test 2b',
    'isAutomatedCheckSupported("MUFG") === true'
  );
  assert(
    isAutomatedCheckSupported('MUFG Intime India') === true,
    'Test 2c',
    'isAutomatedCheckSupported("MUFG Intime India") === true'
  );

  // Test 3: Link Intime returns true
  assert(
    isAutomatedCheckSupported('Link Intime') === true,
    'Test 3',
    'isAutomatedCheckSupported("Link Intime") === true'
  );

  // Test 4: Unsupported / unknown registrars remain false
  assert(
    isAutomatedCheckSupported('CAMEO') === false,
    'Test 4a',
    'isAutomatedCheckSupported("CAMEO") === false'
  );
  assert(
    isAutomatedCheckSupported('SKYLINE') === false,
    'Test 4b',
    'isAutomatedCheckSupported("SKYLINE") === false'
  );
  assert(
    isAutomatedCheckSupported('UNKNOWN_REGISTRAR') === false,
    'Test 4c',
    'isAutomatedCheckSupported("UNKNOWN_REGISTRAR") === false'
  );
  assert(
    isAutomatedCheckSupported(null) === false,
    'Test 4d',
    'isAutomatedCheckSupported(null) === false'
  );

  // Test 5: getRegistrarConfig for MUFG_INTIME resolves official URL & AUTOMATED supportLevel
  const mufgConfig = getRegistrarConfig('MUFG_INTIME');
  assert(
    mufgConfig.url === 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html' &&
      mufgConfig.supportLevel === 'AUTOMATED',
    'Test 5',
    'getRegistrarConfig("MUFG_INTIME") resolves official MUFG URL and AUTOMATED supportLevel'
  );

  // Test 6: Verify MUFG_INTIME IPO selection triggers automated check without short-circuiting
  const mockIpo = {
    id: 'manika-plastech-uuid-1234',
    ipo_name: 'Manika Plastech Ltd',
    registrar: 'MUFG_INTIME',
  };

  const targetRegistrar = getRegistrarConfig(
    mockIpo.registrar || mockIpo.ipo_name
  ).name;
  const isAutomated = isAutomatedCheckSupported(targetRegistrar);

  let checkTriggered = false;
  const mockStartAutomatedCheck = (ipoId: string) => {
    checkTriggered = true;
    return ipoId;
  };

  if (targetRegistrar && isAutomated) {
    mockStartAutomatedCheck(mockIpo.id);
  }

  assert(
    isAutomated && checkTriggered,
    'Test 6',
    'Manika Plastech (MUFG_INTIME) evaluates as automated supported and triggers startAutomatedAllotmentCheck'
  );

  console.log('==================================================');
  console.log('ALL REGISTRAR CONFIG TESTS PASSED SUCCESSFULLY');
  console.log('==================================================');
}

runRegistrarConfigTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
