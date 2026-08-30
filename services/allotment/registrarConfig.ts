export interface RegistrarConfig {
  name: string;
  keywords: string[];
  url: string;
  supportLevel: 'AUTOMATED' | 'MANUAL_ONLY' | 'HYBRID';
}

export const REGISTRAR_CONFIGS: RegistrarConfig[] = [
  {
    name: 'Link Intime India Private Ltd',
    keywords: ['LINK INTIME', 'LINKINTIME', 'LINK'],
    url: 'https://linkintime.co.in/initial_offer/public-issues.html',
    supportLevel: 'HYBRID',
  },
  {
    name: 'KFin Technologies Limited',
    keywords: ['KFIN', 'KFINTECH', 'KARVY'],
    url: 'https://ris.kfintech.com/ipostatus/',
    supportLevel: 'HYBRID',
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
