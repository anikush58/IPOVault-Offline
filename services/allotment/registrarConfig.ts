export interface RegistrarConfig {
  name: string;
  keywords: string[];
  url: string;
  supportLevel: 'AUTOMATED' | 'MANUAL_ONLY' | 'HYBRID';
}

export const REGISTRAR_CONFIGS: RegistrarConfig[] = [
  {
    name: 'MUFG Intime India (formerly Link Intime)',
    keywords: [
      'MUFG',
      'MUFG_INTIME',
      'MUFG INTIME',
      'LINK INTIME',
      'LINKINTIME',
      'LINK',
      'INTIME',
      'ESDS',
    ],
    url: 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html',
    supportLevel: 'AUTOMATED',
  },
  {
    name: 'KFin Technologies Limited',
    keywords: ['KFIN', 'KFINTECH', 'KARVY', 'ASHUTOSH', 'DHOOT'],
    url: 'https://ris.kfintech.com/ipostatus/',
    supportLevel: 'AUTOMATED',
  },
  {
    name: 'Bigshare Services Pvt Ltd',
    keywords: [
      'BIGSHARE',
      'BIG_SHARE',
      'BIG SHARE',
      'BIGSHARE_SERVICES',
      'BIGSHARE SERVICES',
      'BIGSHAREONLINE',
      'BIGSHARE SERVICES PVT LTD',
      'BIGSHARE SERVICES PRIVATE LIMITED',
    ],
    url: 'https://www.bigshareonline.com/ipo_allotment.html',
    supportLevel: 'HYBRID',
  },
  {
    name: 'Cameo Corporate Services Limited',
    keywords: ['CAMEO'],
    url: 'https://ipostatus1.cameoindia.com/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Maashitla Securities Private Limited',
    keywords: ['MAASHITLA'],
    url: 'https://maashitla.com/',
    supportLevel: 'AUTOMATED',
  },
  {
    name: 'Skyline Financial Services Private Ltd',
    keywords: ['SKYLINE'],
    url: 'https://www.skylinerta.com/ipo.php',
    supportLevel: 'AUTOMATED',
  },
  {
    name: 'Purva Sharegistry India Pvt Ltd',
    keywords: ['PURVA', 'PURVASHAREREGISTRY'],
    url: 'https://www.purvashare.com/investor-service/ipo-query',
    supportLevel: 'AUTOMATED',
  },
  {
    name: 'Integrated Registry Management Services Private Limited',
    keywords: ['INTEGRATED', 'INTEGRATED_REGISTRY', 'INTEGRATED REGISTRY'],
    url: 'https://ipostatus.integratedregistry.in/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'MAS Services Limited',
    keywords: ['MAS', 'MAS_SERVICES', 'MAS SERVICES'],
    url: 'https://www.masserv.com/opt.asp',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Mudra RTA Private Limited',
    keywords: ['MUDRA', 'MUDRARTA', 'MUDRA_RTA', 'MUDRA RTA'],
    url: 'https://mudrarta.com/ipo.php',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Alankit Assignments Limited',
    keywords: ['ALANKIT', 'ALANKIT_ASSIGNMENTS', 'ALANKIT ASSIGNMENTS'],
    url: 'https://ipo.alankit.com/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'BSE Fallback',
    keywords: ['BSE'],
    url: 'https://www.bseindia.com/investors/appli_check.aspx',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'NSE Fallback',
    keywords: ['NSE'],
    url: 'https://www.nseindia.com/products/dynaContent/equities/ipos/ipo_login.jsp',
    supportLevel: 'MANUAL_ONLY',
  },
];

export function getRegistrarConfig(registrarName?: string | null): RegistrarConfig {
  if (!registrarName) {
    return {
      name: 'Official Portal',
      keywords: [],
      url: 'https://www.bseindia.com/investors/appli_check.aspx',
      supportLevel: 'MANUAL_ONLY',
    };
  }

  const upper = registrarName.trim().toUpperCase();
  const normalized = upper.replace(/[\s_.-]+/g, '');
  const found = REGISTRAR_CONFIGS.find((cfg) =>
    cfg.keywords.some((kw) => {
      const kwUpper = kw.toUpperCase();
      const kwNormalized = kwUpper.replace(/[\s_.-]+/g, '');
      return upper.includes(kwUpper) || normalized.includes(kwNormalized);
    })
  );

  if (found) return found;

  return {
    name: registrarName,
    keywords: [upper],
    url: 'https://www.bseindia.com/investors/appli_check.aspx',
    supportLevel: 'MANUAL_ONLY',
  };
}

export function isAutomatedCheckSupported(registrarName?: string | null): boolean {
  if (!registrarName) return false;
  const upper = registrarName.trim().toUpperCase();
  const normalized = upper.replace(/[\s_.-]+/g, '');
  return (
    upper.includes('KFIN') ||
    upper.includes('MUFG') ||
    upper.includes('LINK') ||
    upper.includes('INTIME') ||
    upper.includes('ESDS') ||
    upper.includes('MAASHITLA') ||
    upper.includes('SKYLINE') ||
    upper.includes('BIGSHARE') ||
    normalized.includes('BIGSHARE')
  );
}

/**
 * Checks whether response text / HTML contains a CAPTCHA challenge on Bigshare.
 */
export function detectBigshareCaptcha(content: string): boolean {
  if (!content || typeof content !== 'string') return false;

  const captchaPatterns = [
    /<img[^>]+(?:captcha|CaptchaImage)[^>]*>/i,
    /<(?:input|div|span)[^>]+(?:id|name)=["'](?:captcha|txtCaptcha|captchaCode|cpatchaTextBox|hfCaptcha)["']/i,
    /<(?:div|span)[^>]+class=["'][^"']*(?:g-recaptcha|h-captcha|cf-turnstile|captcha-container)[^"']*["']/i,
    /["']?captcha_required["']?\s*:\s*true/i,
    /["']?status["']?\s*:\s*["']captcha_required["']/i,
    /CAPTCHA_DETECTED/i,
    /enter\s+(?:the\s+)?captcha/i,
    /enter\s+security\s+code/i,
  ];

  return captchaPatterns.some((pattern) => pattern.test(content));
}

/**
 * Checks the Bigshare portal/endpoint to determine if CAPTCHA is currently present.
 */
export async function checkBigshareCaptchaPresence(options?: {
  url?: string;
  customFetch?: typeof fetch;
}): Promise<boolean> {
  const fetchFn = options?.customFetch || (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!fetchFn) {
    return true; // Safe fallback to WebView if no fetch environment
  }

  const targetUrl = options?.url || 'https://www.bigshareonline.com/ipo_allotment.html';

  try {
    const res = await fetchFn(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      return true;
    }

    const text = await res.text();
    return detectBigshareCaptcha(text);
  } catch (_err) {
    // If checking fails, default to manual WebView
    return true;
  }
}

