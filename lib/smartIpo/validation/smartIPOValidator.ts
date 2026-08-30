/**
 * Smart IPO Payload Validator
 * Validates incoming server records before writing to SQLite cache (ipo_master).
 * Enforces data integrity, sanitized price bands, valid dates, and numeric metrics.
 */

import { SmartIPORecord } from '../types/smartIpo';
import { evaluateLifecycle } from '@/services/ipo/statusNormalizer';

export interface ValidationResult {
  validRecords: SmartIPORecord[];
  rejectedCount: number;
  errors: string[];
}

function sanitizeNumber(val: any, fallback: number | null = null): number | null {
  if (val === null || val === undefined || val === '') return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

function sanitizeString(val: any, fallback: string = ''): string {
  if (val === null || val === undefined) return fallback;
  return String(val).trim();
}

function isValidIsoDate(dateStr: string | null | undefined): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const clean = dateStr.trim();
  return /^\d{4}-\d{2}-\d{2}/.test(clean) && !isNaN(Date.parse(clean));
}

export function validateSmartIPOPayload(rawArray: any[]): ValidationResult {
  const validRecords: SmartIPORecord[] = [];
  const errors: string[] = [];
  let rejectedCount = 0;

  if (!Array.isArray(rawArray)) {
    return {
      validRecords: [],
      rejectedCount: 0,
      errors: ['Payload is not a valid array'],
    };
  }

  const nowIso = new Date().toISOString();

  for (let i = 0; i < rawArray.length; i++) {
    const raw = rawArray[i];

    if (!raw || typeof raw !== 'object') {
      rejectedCount++;
      errors.push(`Item #${i}: Invalid non-object item`);
      continue;
    }

    const id = sanitizeString(raw.id || raw.ipo_id || raw.symbol);
    const companyName = sanitizeString(raw.company_name || raw.companyName || raw.name);
    const ipoName = sanitizeString(raw.ipo_name || raw.ipoName || companyName);

    if (!id || !companyName) {
      rejectedCount++;
      errors.push(`Item #${i}: Missing mandatory fields (id or company_name)`);
      continue;
    }

    const priceBandMin = sanitizeNumber(raw.price_band_min ?? raw.minPrice);
    const priceBandMax = sanitizeNumber(raw.price_band_max ?? raw.maxPrice);
    const lotSize = sanitizeNumber(raw.lot_size ?? raw.lotSize);
    const issueSize = sanitizeNumber(raw.issue_size_cr ?? raw.issue_size ?? raw.issueSize);

    const openDate = sanitizeString(raw.open_date || raw.openDate);
    const closeDate = sanitizeString(raw.close_date || raw.closeDate);
    const allotmentDate = sanitizeString(raw.allotment_date || raw.allotmentDate);
    const refundDate = sanitizeString(raw.refund_date || raw.refundDate);
    const dematCreditDate = sanitizeString(raw.demat_credit_date || raw.dematCreditDate);
    const listingDate = sanitizeString(raw.listing_date || raw.listingDate);

    // Dynamic 7-stage lifecycle state evaluation
    const evalRes = evaluateLifecycle({
      status: raw.status,
      open_date: openDate,
      close_date: closeDate,
      allotment_date: allotmentDate,
      listing_date: listingDate,
    });

    const record: SmartIPORecord = {
      id,
      company_name: companyName,
      ipo_name: ipoName,
      symbol: sanitizeString(raw.symbol || raw.ticker),
      exchange: sanitizeString(raw.exchange || raw.board, 'NSE/BSE'),
      issue_type: sanitizeString(raw.issue_type || raw.issueType || raw.category, 'Mainboard'),
      price_band_min: priceBandMin,
      price_band_max: priceBandMax,
      lot_size: lotSize,
      issue_size: issueSize,
      fresh_issue_size: sanitizeNumber(raw.fresh_issue_size),
      ofs_size: sanitizeNumber(raw.ofs_size),
      open_date: isValidIsoDate(openDate) ? openDate : null,
      close_date: isValidIsoDate(closeDate) ? closeDate : null,
      allotment_date: isValidIsoDate(allotmentDate) ? allotmentDate : null,
      refund_date: isValidIsoDate(refundDate) ? refundDate : null,
      demat_credit_date: isValidIsoDate(dematCreditDate) ? dematCreditDate : null,
      listing_date: isValidIsoDate(listingDate) ? listingDate : null,
      registrar: sanitizeString(raw.registrar || raw.registrar_name),
      lead_manager: sanitizeString(raw.lead_manager || raw.leadManager),
      registrar_website: sanitizeString(raw.registrar_website),
      allotment_link: sanitizeString(raw.allotment_link),
      status: sanitizeString(raw.status, 'Upcoming'),
      lifecycle_status: evalRes.lifecycle_status,
      lifecycle_confidence: evalRes.lifecycle_confidence,
      lifecycle_source: evalRes.lifecycle_source,
      lifecycle_last_verified_at: evalRes.lifecycle_last_verified_at,
      gmp_amount: sanitizeNumber(raw.gmp_amount ?? raw.gmp),
      gmp_percent: sanitizeNumber(raw.gmp_percent),
      profit_per_lot: sanitizeNumber(raw.profit_per_lot),
      gmp_updated_at: raw.gmp_updated_at || null,
      retail_sub: sanitizeNumber(raw.retail_sub),
      qib_sub: sanitizeNumber(raw.qib_sub),
      nii_sub: sanitizeNumber(raw.nii_sub),
      employee_sub: sanitizeNumber(raw.employee_sub),
      shareholder_sub: sanitizeNumber(raw.shareholder_sub),
      anchor_sub: sanitizeNumber(raw.anchor_sub),
      total_sub: sanitizeNumber(raw.total_sub),
      subscription_timestamp: raw.subscription_timestamp || null,
      listing_price: sanitizeNumber(raw.listing_price),
      listing_gain_percent: sanitizeNumber(raw.listing_gain_percent),
      current_price: sanitizeNumber(raw.current_price),
      current_price_updated_at: raw.current_price_updated_at || null,
      logo_url: sanitizeString(raw.logo_url || raw.logoUrl),
      sector: sanitizeString(raw.sector),
      description: sanitizeString(raw.description),
      website: sanitizeString(raw.website || raw.company_website),
      prospectus_url: sanitizeString(raw.prospectus_url || raw.rhp_url),
      is_favorite: sanitizeNumber(raw.is_favorite, 0) || 0,
      source_type: 'SERVER',
      sync_version: sanitizeNumber(raw.sync_version, 1) || 1,
      created_at: raw.created_at || nowIso,
      updated_at: raw.updated_at || nowIso,
      deleted_at: raw.deleted_at || null,
    };

    validRecords.push(record);
  }

  return {
    validRecords,
    rejectedCount,
    errors,
  };
}
