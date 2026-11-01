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
      'LINK INTIME INDIA PVT LTD',
      'LINK INTIME INDIA PVT. LTD.',
      'LINK INTIME INDIA PRIVATE LIMITED',
      'ESDS',
    ],
    url: 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html',
    supportLevel: 'AUTOMATED',
  },
  {
    name: 'KFin Technologies Limited',
    keywords: [
      'KFIN',
      'KFINTECH',
      'KARVY',
      'KFIN TECHNOLOGIES',
      'KFIN TECHNOLOGIES LIMITED',
      'KFIN TECHNOLOGIES LTD',
      'KFIN TECHNOLOGIES LTD.',
      'KFIN TECHNOLOGIES PVT LTD',
      'KFIN TECHNOLOGIES PVT. LTD.',
      'KFIN TECHNOLOGIES PRIVATE LIMITED',
      'ASHUTOSH',
      'DHOOT',
      'SOLLFEGE',
    ],
    url: 'https://ipostatus.kfintech.com/',
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
      'BIGSHARE SERVICES PVT. LTD.',
      'BIGSHARE SERVICES PRIVATE LIMITED',
    ],
    url: 'https://www.bigshareonline.com/ipo_allotment.html',
    supportLevel: 'HYBRID',
  },
  {
    name: 'Cameo Corporate Services Limited',
    keywords: ['CAMEO', 'CAMEO CORPORATE SERVICES'],
    url: 'https://ipostatus1.cameoindia.com/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Maashitla Securities Private Limited',
    keywords: [
      'MAASHITLA',
      'MAASHITLA_SECURITIES',
      'MAASHITLA SECURITIES',
      'MAASHITLA SECURITIES LIMITED',
      'MAASHITLA SECURITIES PVT LTD',
      'MAASHITLA SECURITIES PVT. LTD.',
      'MAASHITLA SECURITIES PRIVATE LIMITED',
      'SJP ULTRASONIC',
    ],
    url: 'https://maashitla.com/allotment-status/public-issues',
    supportLevel: 'AUTOMATED',
  },
  {
    name: 'Skyline Financial Services Private Ltd',
    keywords: [
      'SKYLINE',
      'SKYLINE_FINANCIAL_SERVICES',
      'SKYLINE FINANCIAL SERVICES',
      'SKYLINE FINANCIAL SERVICES LIMITED',
      'SKYLINE FINANCIAL SERVICES PVT LTD',
      'SKYLINE FINANCIAL SERVICES PVT. LTD.',
      'SKYLINE FINANCIAL SERVICES PRIVATE LIMITED',
      'SKYLINERTA',
    ],
    url: 'https://www.skylinerta.com/ipo.php',
    supportLevel: 'AUTOMATED',
  },
  {
    name: 'Purva Sharegistry India Pvt Ltd',
    keywords: ['PURVA', 'PURVASHAREREGISTRY', 'PURVA SHAREGISTRY', 'PURVA SHAREGISTRY INDIA', 'PURVA SHAREGISTRY INDIA PVT LTD'],
    url: 'https://www.purvashare.com/investor-service/ipo-query',
    supportLevel: 'AUTOMATED',
  },
  {
    name: 'Integrated Registry Management Services Private Limited',
    keywords: [
      'INTEGRATED',
      'INTEGRATED_REGISTRY',
      'INTEGRATED REGISTRY',
      'INTEGRATED REGISTRY MANAGEMENT SERVICES',
      'INTEGRATED REGISTRY MANAGEMENT SERVICES PRIVATE LIMITED',
      'INTEGRATED REGISTRY MANAGEMENT SERVICES PVT LTD',
    ],
    url: 'https://ipostatus.integratedregistry.in/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'MAS Services Limited',
    keywords: ['MAS', 'MAS_SERVICES', 'MAS SERVICES', 'MAS SERVICES LIMITED', 'MAS SERVICES LTD'],
    url: 'https://www.masserv.com/opt.asp',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Mudra RTA Private Limited',
    keywords: ['MUDRA', 'MUDRARTA', 'MUDRA_RTA', 'MUDRA RTA', 'MUDRA RTA PRIVATE LIMITED', 'MUDRA RTA PVT LTD'],
    url: 'https://mudrarta.com/ipo.php',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Alankit Assignments Limited',
    keywords: ['ALANKIT', 'ALANKIT_ASSIGNMENTS', 'ALANKIT ASSIGNMENTS', 'ALANKIT ASSIGNMENTS LIMITED', 'ALANKIT ASSIGNMENTS LTD'],
    url: 'https://ipo.alankit.com/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Beetal Financial & Computer Services Pvt Ltd',
    keywords: [
      'BEETAL',
      'BEETAL_FINANCIAL',
      'BEETAL FINANCIAL',
      'BEETAL FINANCIAL & COMPUTER SERVICES',
      'BEETAL FINANCIAL AND COMPUTER SERVICES',
      'BEETAL FINANCIAL & COMPUTER SERVICES PVT LTD',
      'BEETAL FINANCIAL & COMPUTER SERVICES PVT. LTD.',
    ],
    url: 'http://www.beetalfinancial.com/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Maheshwari Datamatics Private Limited',
    keywords: [
      'MAHESHWARI',
      'MAHESHWARI_DATAMATICS',
      'MAHESHWARI DATAMATICS',
      'MAHESHWARI DATAMATICS PRIVATE LIMITED',
      'MAHESHWARI DATAMATICS PVT LTD',
      'MAHESHWARI DATAMATICS PVT. LTD.',
      'MDPL',
    ],
    url: 'https://mdpl.in/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Datamatics Business Solutions Limited',
    keywords: [
      'DATAMATICS',
      'DATAMATICS_FINANCIAL',
      'DATAMATICS FINANCIAL',
      'DATAMATICS BUSINESS SOLUTIONS',
      'DATAMATICS BUSINESS SOLUTIONS LIMITED',
      'DATAMATICS BUSINESS SOLUTIONS LTD',
      'DATAMATICS FINANCIAL SERVICES',
    ],
    url: 'https://www.datamaticsbpm.com/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Venture Capital and Corporate Investments Private Limited',
    keywords: [
      'VCCIPL',
      'VENTURE_CAPITAL',
      'VENTURE CAPITAL',
      'VENTURE CAPITAL AND CORPORATE INVESTMENTS',
      'VENTURE CAPITAL & CORPORATE INVESTMENTS',
      'VENTURE CAPITAL AND CORPORATE INVESTMENTS PRIVATE LIMITED',
      'VENTURE CAPITAL & CORPORATE INVESTMENTS PVT LTD',
      'VENTURE CAPITAL & CORPORATE INVESTMENTS PVT. LTD.',
    ],
    url: 'https://www.vccipl.com/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Ankit Consultancy Private Limited',
    keywords: [
      'ANKIT',
      'ANKIT_CONSULTANCY',
      'ANKIT CONSULTANCY',
      'ANKIT CONSULTANCY PRIVATE LIMITED',
      'ANKIT CONSULTANCY PVT LTD',
      'ANKIT CONSULTANCY PVT. LTD.',
    ],
    url: 'https://www.ankitonline.com/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'S.K. Info Solutions Private Limited',
    keywords: [
      'SK INFO',
      'SK_INFO',
      'S.K. INFO',
      'S.K. INFO SOLUTIONS',
      'SKINFOSOLUTIONS',
      'SK INFO SOLUTIONS',
      'SK INFO SOLUTIONS PVT LTD',
      'SK INFO SOLUTIONS PVT. LTD.',
      'S.K. INFO SOLUTIONS PRIVATE LIMITED',
    ],
    url: 'https://www.skinfo.in/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Sharex Dynamic (India) Private Limited',
    keywords: [
      'SHAREX',
      'SHAREX_DYNAMIC',
      'SHAREX DYNAMIC',
      'SHAREX DYNAMIC INDIA',
      'SHAREX DYNAMIC (INDIA) PRIVATE LIMITED',
      'SHAREX DYNAMIC (INDIA) PVT LTD',
    ],
    url: 'https://www.sharexindia.com/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'MCS Share Transfer Agent Limited',
    keywords: [
      'MCS',
      'MCS_SHARE_TRANSFER',
      'MCS SHARE TRANSFER',
      'MCS SHARE TRANSFER AGENT',
      'MCS SHARE TRANSFER AGENT LIMITED',
      'MCSSRTA',
    ],
    url: 'https://www.mcsregistrars.com/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Niche Technologies Private Limited',
    keywords: [
      'NICHE',
      'NICHE_TECHNOLOGIES',
      'NICHE TECHNOLOGIES',
      'NICHE TECH',
      'NICHE TECHNOLOGIES PRIVATE LIMITED',
      'NICHE TECHNOLOGIES PVT LTD',
      'NICHE TECHNOLOGIES PVT. LTD.',
    ],
    url: 'https://www.nichetechpl.com/',
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

/**
 * Resolves a concise, human-friendly registrar short name suitable for chips, badges, and subtitles.
 */
export function getRegistrarShortName(registrarName?: string | null): string {
  if (!registrarName || !registrarName.trim()) return 'Registrar';
  const cfg = getRegistrarConfig(registrarName);
  const upper = (cfg.name || registrarName).toUpperCase();
  const rawUpper = registrarName.trim().toUpperCase();

  if (upper.includes('LINK') || upper.includes('MUFG') || rawUpper.includes('LINK') || rawUpper.includes('MUFG')) return 'Link Intime';
  if (upper.includes('KFIN') || rawUpper.includes('KFIN') || rawUpper.includes('KARVY')) return 'KFintech';
  if (upper.includes('BIGSHARE') || rawUpper.includes('BIGSHARE')) return 'Bigshare';
  if (upper.includes('CAMEO') || rawUpper.includes('CAMEO')) return 'Cameo';
  if (upper.includes('MAASHITLA') || rawUpper.includes('MAASHITLA')) return 'Maashitla';
  if (upper.includes('SKYLINE') || rawUpper.includes('SKYLINE')) return 'Skyline';
  if (upper.includes('PURVA') || rawUpper.includes('PURVA')) return 'Purva';
  if (upper.includes('INTEGRATED') || rawUpper.includes('INTEGRATED')) return 'Integrated';
  if (upper.includes('MAS SERVICES') || upper.startsWith('MAS') || rawUpper.includes('MAS SERVICES')) return 'MAS Services';
  if (upper.includes('MUDRA') || rawUpper.includes('MUDRA')) return 'Mudra RTA';
  if (upper.includes('ALANKIT') || rawUpper.includes('ALANKIT')) return 'Alankit';
  if (upper.includes('BEETAL') || rawUpper.includes('BEETAL')) return 'Beetal';
  if ((upper.includes('DATAMATICS') || rawUpper.includes('DATAMATICS')) && !upper.includes('MAHESHWARI')) return 'Datamatics';
  if (upper.includes('VCCIPL') || upper.includes('VENTURE CAPITAL') || rawUpper.includes('VCCIPL') || rawUpper.includes('VENTURE CAPITAL')) return 'VCCIPL';
  if (upper.includes('ANKIT') || rawUpper.includes('ANKIT')) return 'Ankit';
  if (upper.includes('SK INFO') || upper.includes('S.K. INFO') || rawUpper.includes('SK INFO')) return 'SK Info';
  if (upper.includes('SHAREX') || rawUpper.includes('SHAREX')) return 'Sharex';
  if (upper.includes('MCS') || rawUpper.includes('MCS')) return 'MCS';
  if (upper.includes('NICHE') || rawUpper.includes('NICHE')) return 'Niche';
  if (upper.includes('MAHESHWARI') || rawUpper.includes('MAHESHWARI') || rawUpper.includes('MDPL')) return 'Maheshwari';
  if (upper.includes('BSE') || rawUpper.includes('BSE')) return 'BSE';
  if (upper.includes('NSE') || rawUpper.includes('NSE')) return 'NSE';

  // Fallback to first 2 words if longer
  const words = registrarName.trim().split(/\s+/);
  return words.length > 2 ? words.slice(0, 2).join(' ') : registrarName.trim();
}

/**
 * Returns a clean host domain for the registrar's website URL (e.g. "linkintime.co.in", "kfintech.com").
 */
export function getRegistrarDomain(url?: string | null): string {
  if (!url) return 'bseindia.com';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    const match = url.match(/https?:\/\/(?:www\.)?([^\/\s]+)/i);
    return match ? match[1] : url;
  }
}

/**
 * Returns the official portal URL for a registrar.
 */
export function getRegistrarWebsite(registrarName?: string | null): string {
  const cfg = getRegistrarConfig(registrarName);
  return cfg.url;
}


