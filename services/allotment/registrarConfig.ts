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
    keywords: ['BIGSHARE'],
    url: 'https://www.bigshareonline.com/ipo_allotment.html',
    supportLevel: 'HYBRID',
  },
  {
    name: 'Cameo Corporate Services Limited',
    keywords: ['CAMEO'],
    url: 'https://ipo.cameoindia.com/',
    supportLevel: 'MANUAL_ONLY',
  },
  {
    name: 'Skyline Financial Services Private Ltd',
    keywords: ['SKYLINE'],
    url: 'https://www.skylinerta.com/ipo.php',
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
  const found = REGISTRAR_CONFIGS.find((cfg) =>
    cfg.keywords.some((kw) => upper.includes(kw))
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
  return (
    upper.includes('KFIN') ||
    upper.includes('MUFG') ||
    upper.includes('LINK') ||
    upper.includes('INTIME') ||
    upper.includes('ESDS')
  );
}

