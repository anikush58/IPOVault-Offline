import { CanonicalIPORecord, IPOSourceAdapter, SourceConfidence } from './types';

function normalizeCompanyName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/limited|ltd|private|pvt|ipo|details|india/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDateStr(str?: string | null): string {
  if (!str) return '';
  const clean = str.replace(/<[^>]+>/g, '').replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*/i, '').trim();
  const parsed = Date.parse(clean);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
}

function parseNumber(val: any): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const clean = String(val).replace(/<[^>]+>/g, '').replace(/,/g, '').replace(/₹/g, '').trim();
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? null : parsed;
}

function inferRegistrarAndWebsite(companyName: string): { registrar: string; registrar_website: string } {
  const norm = companyName.toLowerCase();
  if (norm.includes('link intime') || norm.includes('linkintime')) {
    return { registrar: 'Link Intime India Private Limited', registrar_website: 'https://linkintime.co.in/initial_offer/public-issues.html' };
  }
  if (norm.includes('kfin') || norm.includes('karvy')) {
    return { registrar: 'KFin Technologies Limited', registrar_website: 'https://ris.kfintech.com/ipostatus/' };
  }
  if (norm.includes('bigshare')) {
    return { registrar: 'Bigshare Services Private Limited', registrar_website: 'https://www.bigshareonline.com/ipo_status.html' };
  }
  if (norm.includes('skyline')) {
    return { registrar: 'Skyline Financial Services Private Limited', registrar_website: 'https://www.skylinefta.com/ipo_status.aspx' };
  }
  if (norm.includes('maashitla')) {
    return { registrar: 'Maashitla Securities Private Limited', registrar_website: 'https://maashitla.com/status/ipo-status' };
  }
  if (norm.includes('cameo')) {
    return { registrar: 'Cameo Corporate Services Limited', registrar_website: 'https://ipo.cameoindia.com/' };
  }
  return { registrar: 'Link Intime India Private Limited', registrar_website: 'https://linkintime.co.in/initial_offer/public-issues.html' };
}

export class NSEAdapter implements IPOSourceAdapter {
  sourceName = 'NSE';

  async fetchIPOCandidates(): Promise<CanonicalIPORecord[]> {
    return [];
  }
}

export class BSEAdapter implements IPOSourceAdapter {
  sourceName = 'BSE';

  async fetchIPOCandidates(): Promise<CanonicalIPORecord[]> {
    return [];
  }
}
