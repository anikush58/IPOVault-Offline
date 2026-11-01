import {
  detectBigshareCaptcha,
  checkBigshareCaptchaPresence,
  getRegistrarConfig,
  getRegistrarShortName,
  getRegistrarDomain,
  getRegistrarWebsite,
  isAutomatedCheckSupported,
} from '../services/allotment/registrarConfig';
import { resolveRegistrarCode, getRegistrarLabel } from '../constants/ipoControls';

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

  // Test 4: Unsupported / manual-only registrars remain false for automated check
  assert(
    isAutomatedCheckSupported('CAMEO') === false,
    'Test 4a',
    'isAutomatedCheckSupported("CAMEO") === false'
  );
  assert(
    isAutomatedCheckSupported('INTEGRATED') === false,
    'Test 4b',
    'isAutomatedCheckSupported("INTEGRATED") === false'
  );
  assert(
    isAutomatedCheckSupported('Integrated Registry Management Services') === false,
    'Test 4c',
    'isAutomatedCheckSupported("Integrated Registry Management Services") === false'
  );
  assert(
    isAutomatedCheckSupported('MAS') === false,
    'Test 4d',
    'isAutomatedCheckSupported("MAS") === false'
  );
  assert(
    isAutomatedCheckSupported('MAS Services Limited') === false,
    'Test 4e',
    'isAutomatedCheckSupported("MAS Services Limited") === false'
  );
  assert(
    isAutomatedCheckSupported('MUDRA') === false,
    'Test 4f',
    'isAutomatedCheckSupported("MUDRA") === false'
  );
  assert(
    isAutomatedCheckSupported('Mudra RTA') === false,
    'Test 4g',
    'isAutomatedCheckSupported("Mudra RTA") === false'
  );
  assert(
    isAutomatedCheckSupported('ALANKIT') === false,
    'Test 4h',
    'isAutomatedCheckSupported("ALANKIT") === false'
  );
  assert(
    isAutomatedCheckSupported('Alankit Assignments Limited') === false,
    'Test 4i',
    'isAutomatedCheckSupported("Alankit Assignments Limited") === false'
  );
  assert(
    isAutomatedCheckSupported('UNKNOWN_REGISTRAR') === false,
    'Test 4j',
    'isAutomatedCheckSupported("UNKNOWN_REGISTRAR") === false'
  );
  assert(
    isAutomatedCheckSupported(null) === false,
    'Test 4k',
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

  // Test 6: getRegistrarConfig for INTEGRATED resolves official URL & MANUAL_ONLY supportLevel
  const integratedConfig = getRegistrarConfig('INTEGRATED');
  assert(
    integratedConfig.url === 'https://ipostatus.integratedregistry.in/' &&
      integratedConfig.supportLevel === 'MANUAL_ONLY',
    'Test 6',
    'getRegistrarConfig("INTEGRATED") resolves official Integrated portal URL and MANUAL_ONLY supportLevel'
  );

  // Test 7: Verify INTEGRATED IPO selection routes to manual redirect / WebView flow
  const mockIntegratedIpo = {
    id: 'integrated-test-ipo-1',
    ipo_name: 'Sample Integrated IPO Ltd',
    registrar: 'Integrated Registry Management Services Private Limited',
  };

  const registrarUpper = (mockIntegratedIpo.registrar || '').toUpperCase();
  const manualRedirectRegistrar = registrarUpper.includes('CAMEO')
    ? 'CAMEO'
    : registrarUpper.includes('INTEGRATED')
      ? 'INTEGRATED'
      : registrarUpper.includes('MAS')
        ? 'MAS'
        : registrarUpper.includes('MUDRA')
          ? 'MUDRA'
          : registrarUpper.includes('ALANKIT')
            ? 'ALANKIT'
            : null;

  let webBrowserUrlOpened = '';
  if (manualRedirectRegistrar) {
    const portalConfig = getRegistrarConfig(manualRedirectRegistrar);
    webBrowserUrlOpened = portalConfig.url;
  }

  assert(
    manualRedirectRegistrar === 'INTEGRATED' &&
      webBrowserUrlOpened === 'https://ipostatus.integratedregistry.in/',
    'Test 7',
    'Selecting an Integrated IPO routes directly to in-app browser with https://ipostatus.integratedregistry.in/'
  );

  // Test 8: getRegistrarConfig and WebView routing for MAS Services
  const masConfig = getRegistrarConfig('MAS Services Limited');
  assert(
    masConfig.url === 'https://www.masserv.com/opt.asp' &&
      masConfig.supportLevel === 'MANUAL_ONLY',
    'Test 8a',
    'getRegistrarConfig("MAS Services Limited") resolves https://www.masserv.com/opt.asp and MANUAL_ONLY'
  );

  const mockMasIpo = {
    id: 'mas-test-ipo-1',
    ipo_name: 'Sample MAS IPO Ltd',
    registrar: 'MAS Services Limited',
  };
  const masUpper = (mockMasIpo.registrar || '').toUpperCase();
  const masManualRedirect = masUpper.includes('MAS') ? 'MAS' : null;
  const masOpenedUrl = masManualRedirect ? getRegistrarConfig(masManualRedirect).url : '';
  assert(
    masManualRedirect === 'MAS' && masOpenedUrl === 'https://www.masserv.com/opt.asp',
    'Test 8b',
    'Selecting a MAS IPO routes directly to in-app browser with https://www.masserv.com/opt.asp'
  );

  // Test 9: getRegistrarConfig and WebView routing for Mudra RTA
  const mudraConfig = getRegistrarConfig('Mudra RTA Private Limited');
  assert(
    mudraConfig.url === 'https://mudrarta.com/ipo.php' &&
      mudraConfig.supportLevel === 'MANUAL_ONLY',
    'Test 9a',
    'getRegistrarConfig("Mudra RTA Private Limited") resolves https://mudrarta.com/ipo.php and MANUAL_ONLY'
  );

  const mockMudraIpo = {
    id: 'mudra-test-ipo-1',
    ipo_name: 'Sample Mudra IPO Ltd',
    registrar: 'Mudra RTA Private Limited',
  };
  const mudraUpper = (mockMudraIpo.registrar || '').toUpperCase();
  const mudraManualRedirect = mudraUpper.includes('MUDRA') ? 'MUDRA' : null;
  const mudraOpenedUrl = mudraManualRedirect ? getRegistrarConfig(mudraManualRedirect).url : '';
  assert(
    mudraManualRedirect === 'MUDRA' && mudraOpenedUrl === 'https://mudrarta.com/ipo.php',
    'Test 9b',
    'Selecting a Mudra IPO routes directly to in-app browser with https://mudrarta.com/ipo.php'
  );

  // Test 10: getRegistrarConfig and WebView routing for Alankit Assignments
  const alankitConfig = getRegistrarConfig('Alankit Assignments Limited');
  assert(
    alankitConfig.url === 'https://ipo.alankit.com/' &&
      alankitConfig.supportLevel === 'MANUAL_ONLY',
    'Test 10a',
    'getRegistrarConfig("Alankit Assignments Limited") resolves https://ipo.alankit.com/ and MANUAL_ONLY'
  );

  const mockAlankitIpo = {
    id: 'alankit-test-ipo-1',
    ipo_name: 'Sample Alankit IPO Ltd',
    registrar: 'Alankit Assignments Limited',
  };
  const alankitUpper = (mockAlankitIpo.registrar || '').toUpperCase();
  const alankitManualRedirect = alankitUpper.includes('ALANKIT') ? 'ALANKIT' : null;
  const alankitOpenedUrl = alankitManualRedirect ? getRegistrarConfig(alankitManualRedirect).url : '';
  assert(
    alankitManualRedirect === 'ALANKIT' && alankitOpenedUrl === 'https://ipo.alankit.com/',
    'Test 10b',
    'Selecting an Alankit IPO routes directly to in-app browser with https://ipo.alankit.com/'
  );

  // =========================================================================
  // Test 11: Bigshare flow — CAPTCHA absent vs CAPTCHA present
  // =========================================================================
  // 11a: CAPTCHA detection logic
  const pageWithCaptcha = `
    <html>
      <body>
        <form>
          <input type="text" id="txtPan" />
          <img id="imgCaptcha" src="captcha.aspx" />
          <input type="text" name="txtCaptcha" placeholder="Enter Captcha" />
        </form>
      </body>
    </html>
  `;
  const pageWithoutCaptcha = `
    <html>
      <body>
        <form>
          <input type="text" id="txtPan" />
          <button id="btnSearch">Search</button>
        </form>
      </body>
    </html>
  `;

  assert(
    detectBigshareCaptcha(pageWithCaptcha) === true,
    'Test 11a',
    'detectBigshareCaptcha returns true when CAPTCHA image/field is present in HTML'
  );
  assert(
    detectBigshareCaptcha(pageWithoutCaptcha) === false,
    'Test 11b',
    'detectBigshareCaptcha returns false when CAPTCHA elements are absent'
  );

  // 11c: Bigshare flow when CAPTCHA is absent → Automatic direct check executed
  const mockBigshareIpo = {
    id: 'bigshare-ipo-1',
    ipo_name: 'Advit Jewels Limited',
    registrar: 'Bigshare Services Pvt Ltd',
  };

  let directCheckExecuted = false;
  let webViewOpenedUrl = '';

  const mockFetchNoCaptcha: typeof fetch = async () =>
    new Response(pageWithoutCaptcha, { status: 200 });

  const captchaPresentForNoCaptcha = await checkBigshareCaptchaPresence({
    customFetch: mockFetchNoCaptcha,
  });

  if (captchaPresentForNoCaptcha) {
    const portalConfig = getRegistrarConfig('BIGSHARE');
    webViewOpenedUrl = portalConfig.url;
  } else {
    directCheckExecuted = true;
  }

  assert(
    captchaPresentForNoCaptcha === false && directCheckExecuted === true && webViewOpenedUrl === '',
    'Test 11c',
    'Bigshare flow with CAPTCHA absent automatically triggers direct check without opening WebView'
  );

  // 11d: Bigshare flow when CAPTCHA is present → Directly opens WebView, NO direct check
  let directCheckAttemptedWhenCaptcha = false;
  let webViewOpenedUrlWhenCaptcha = '';

  const mockFetchWithCaptcha: typeof fetch = async () =>
    new Response(pageWithCaptcha, { status: 200 });

  const captchaPresentForWithCaptcha = await checkBigshareCaptchaPresence({
    customFetch: mockFetchWithCaptcha,
  });

  if (captchaPresentForWithCaptcha) {
    const portalConfig = getRegistrarConfig('BIGSHARE');
    webViewOpenedUrlWhenCaptcha = portalConfig.url;
  } else {
    directCheckAttemptedWhenCaptcha = true;
  }

  assert(
    captchaPresentForWithCaptcha === true &&
      directCheckAttemptedWhenCaptcha === false &&
      webViewOpenedUrlWhenCaptcha === 'https://www.bigshareonline.com/ipo_allotment.html',
    'Test 11d',
    'Bigshare flow with CAPTCHA present immediately opens WebView portal and does not attempt direct check'
  );

  // 11e: Exact runtime resolution case: "Bigshare Services Pvt Ltd" -> supported Bigshare adapter
  const bigsharePvtLtdConfig = getRegistrarConfig('Bigshare Services Pvt Ltd');
  const isBigsharePvtLtdSupported = isAutomatedCheckSupported('Bigshare Services Pvt Ltd');
  const resolvedCode = resolveRegistrarCode('Bigshare Services Pvt Ltd');

  assert(
    bigsharePvtLtdConfig.name === 'Bigshare Services Pvt Ltd' &&
      isBigsharePvtLtdSupported === true &&
      resolvedCode === 'BIGSHARE',
    'Test 11e',
    '"Bigshare Services Pvt Ltd" resolves to supported Bigshare adapter and controlled code BIGSHARE'
  );

  
  // =========================================================================
  // Test 12: Verify all known Indian IPO registrars resolve properly with official portal URLs
  // =========================================================================
  const knownRegistrars = [
    { input: 'Link Intime India Pvt Ltd', expectedShort: 'Link Intime', expectedHost: 'mufg.com' },
    { input: 'MUFG Intime India', expectedShort: 'Link Intime', expectedHost: 'mufg.com' },
    { input: 'KFin Technologies Limited', expectedShort: 'KFintech', expectedHost: 'kfintech.com' },
    { input: 'Karvy Fintech', expectedShort: 'KFintech', expectedHost: 'kfintech.com' },
    { input: 'Bigshare Services Pvt Ltd', expectedShort: 'Bigshare', expectedHost: 'bigshareonline.com' },
    { input: 'Cameo Corporate Services Limited', expectedShort: 'Cameo', expectedHost: 'cameoindia.com' },
    { input: 'Maashitla Securities Private Limited', expectedShort: 'Maashitla', expectedHost: 'maashitla.com' },
    { input: 'Skyline Financial Services Private Ltd', expectedShort: 'Skyline', expectedHost: 'skylinerta.com' },
    { input: 'Purva Sharegistry India Pvt Ltd', expectedShort: 'Purva', expectedHost: 'purvashare.com' },
    { input: 'Integrated Registry Management Services', expectedShort: 'Integrated', expectedHost: 'integratedregistry.in' },
    { input: 'MAS Services Limited', expectedShort: 'MAS Services', expectedHost: 'masserv.com' },
    { input: 'Mudra RTA Private Limited', expectedShort: 'Mudra RTA', expectedHost: 'mudrarta.com' },
    { input: 'Alankit Assignments Limited', expectedShort: 'Alankit', expectedHost: 'alankit.com' },
    { input: 'Beetal Financial & Computer Services Pvt Ltd', expectedShort: 'Beetal', expectedHost: 'beetalfinancial.com' },
    { input: 'Datamatics Business Solutions Limited', expectedShort: 'Datamatics', expectedHost: 'datamaticsbpm.com' },
    { input: 'Venture Capital and Corporate Investments Private Limited', expectedShort: 'VCCIPL', expectedHost: 'vccipl.com' },
    { input: 'Ankit Consultancy Private Limited', expectedShort: 'Ankit', expectedHost: 'ankitonline.com' },
    { input: 'S.K. Info Solutions Private Limited', expectedShort: 'SK Info', expectedHost: 'skinfo.in' },
    { input: 'Sharex Dynamic (India) Private Limited', expectedShort: 'Sharex', expectedHost: 'sharexindia.com' },
    { input: 'MCS Share Transfer Agent Limited', expectedShort: 'MCS', expectedHost: 'mcsregistrars.com' },
    { input: 'Niche Technologies Private Limited', expectedShort: 'Niche', expectedHost: 'nichetechpl.com' },
    { input: 'Maheshwari Datamatics Private Limited', expectedShort: 'Maheshwari', expectedHost: 'mdpl.in' },
    { input: 'BSE India', expectedShort: 'BSE', expectedHost: 'bseindia.com' },
    { input: 'NSE India', expectedShort: 'NSE', expectedHost: 'nseindia.com' },
  ];

  for (const reg of knownRegistrars) {
    const cfg = getRegistrarConfig(reg.input);
    const shortName = getRegistrarShortName(reg.input);
    const domain = getRegistrarDomain(cfg.url);
    const website = getRegistrarWebsite(reg.input);

    assert(
      shortName === reg.expectedShort,
      `Test 12 ShortName [${reg.input}]`,
      `Expected ${reg.expectedShort}, got ${shortName}`
    );
    assert(
      domain.includes(reg.expectedHost),
      `Test 12 Domain [${reg.input}]`,
      `Expected domain to contain ${reg.expectedHost}, got ${domain}`
    );
    assert(
      website.startsWith('http://') || website.startsWith('https://'),
      `Test 12 Website [${reg.input}]`,
      `Expected valid URL, got ${website}`
    );
  }

  // =========================================================================
  // Test 13: Null and empty fallbacks
  // =========================================================================
  assert(
    getRegistrarShortName(null) === 'Registrar',
    'Test 13a',
    'getRegistrarShortName(null) returns "Registrar"'
  );
  assert(
    getRegistrarShortName('') === 'Registrar',
    'Test 13b',
    'getRegistrarShortName("") returns "Registrar"'
  );
  assert(
    getRegistrarWebsite(null) === 'https://www.bseindia.com/investors/appli_check.aspx',
    'Test 13c',
    'getRegistrarWebsite(null) falls back to BSE portal'
  );
  assert(
    getRegistrarDomain(null) === 'bseindia.com',
    'Test 13d',
    'getRegistrarDomain(null) falls back to bseindia.com'
  );

  // =========================================================================
  // Test 14: Controlled Registrars sync
  // =========================================================================
  assert(
    resolveRegistrarCode('Beetal Financial') === 'BEETAL',
    'Test 14a',
    'resolveRegistrarCode("Beetal Financial") resolves BEETAL'
  );
  assert(
    resolveRegistrarCode('Datamatics Business Solutions') === 'DATAMATICS',
    'Test 14b',
    'resolveRegistrarCode("Datamatics Business Solutions") resolves DATAMATICS'
  );
  assert(
    resolveRegistrarCode('VCCIPL') === 'VCCIPL',
    'Test 14c',
    'resolveRegistrarCode("VCCIPL") resolves VCCIPL'
  );
  assert(
    resolveRegistrarCode('Ankit Consultancy') === 'ANKIT',
    'Test 14d',
    'resolveRegistrarCode("Ankit Consultancy") resolves ANKIT'
  );
  assert(
    getRegistrarLabel('BEETAL') === 'Beetal Financial',
    'Test 14e',
    'getRegistrarLabel("BEETAL") resolves "Beetal Financial"'
  );
  assert(
    getRegistrarLabel('DATAMATICS') === 'Datamatics',
    'Test 14f',
    'getRegistrarLabel("DATAMATICS") resolves "Datamatics"'
  );

  console.log('==================================================');
  console.log('ALL REGISTRAR CONFIG TESTS PASSED SUCCESSFULLY');
  console.log('==================================================');
}

runRegistrarConfigTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
