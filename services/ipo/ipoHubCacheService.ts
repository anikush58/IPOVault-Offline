import { SQLiteDatabase } from 'expo-sqlite';
import { BackendIpo } from '../../types/backend-ipo';
import { safeGetAllAsync, isDatabaseOpen, isClosedResourceError } from '../../utils/sqliteDebug';
import { IPORepository } from './ipoRepository';
import { IPOMasterRecord } from './types';

/**
 * Maps a local SQLite `ipo_master` database row to a `BackendIpo` object.
 * Preserves high-fidelity field mappings needed by IPO Hub and child screens.
 */
export function mapSqliteRowToBackendIpo(row: any): BackendIpo {
  if (!row) return row;

  const isSme =
    (row.issue_type || '').toUpperCase().includes('SME') ||
    (row.market_segment || '').toUpperCase().includes('SME');
  const marketSegment: 'MAINBOARD' | 'SME' = isSme ? 'SME' : 'MAINBOARD';
  const companyName = row.company_name || row.ipo_name || row.symbol || 'IPO';

  // Fallback: treat empty, null, and case-insensitive 'Unknown'/'null' lifecycle status as unavailable.
  // Fall back to normalized status, then to established default 'UPCOMING'.
  const rawLifecycle = (row.lifecycle_status || '').trim().toUpperCase();
  const rawStatus = (row.status || '').trim().toUpperCase();
  const isLifecycleValid = rawLifecycle && rawLifecycle !== 'UNKNOWN' && rawLifecycle !== 'NULL';
  const isStatusValid = rawStatus && rawStatus !== 'UNKNOWN' && rawStatus !== 'NULL';
  const status = isLifecycleValid ? rawLifecycle : (isStatusValid ? rawStatus : 'UPCOMING');

  let participants: any[] = [];
  if (row.participants_json) {
    try {
      participants = JSON.parse(row.participants_json);
    } catch {}
  }

  let financials: any[] = [];
  if (row.financials_json) {
    try {
      financials = JSON.parse(row.financials_json);
    } catch {}
  }

  let documents: any[] = [];
  if (row.documents_json) {
    try {
      documents = JSON.parse(row.documents_json);
    } catch {}
  }

  let anchorDetails: any = null;
  if (row.anchor_details_json) {
    try {
      anchorDetails = JSON.parse(row.anchor_details_json);
    } catch {}
  }

  const gmpAmount = row.gmp_amount != null ? Number(row.gmp_amount) : null;
  const gmpPercent = row.gmp_percent != null ? Number(row.gmp_percent) : null;
  const hasGmp = gmpAmount !== null || gmpPercent !== null;

  const currentGmp = hasGmp
    ? {
        gmpAmount: gmpAmount ?? 0,
        gmpPercentage: gmpPercent,
        estProfitPerLot: row.profit_per_lot != null ? Number(row.profit_per_lot) : null,
        observedAt: row.gmp_updated_at || null,
      }
    : null;

  const currentSubscription =
    row.total_sub != null || row.retail_sub != null || row.qib_sub != null || row.nii_sub != null
      ? {
          totalSubscriptionMultiple: row.total_sub != null ? row.total_sub : null,
          categories: [
            ...(row.retail_sub != null ? [{ category: 'Retail', subscriptionMultiple: row.retail_sub }] : []),
            ...(row.qib_sub != null ? [{ category: 'QIB', subscriptionMultiple: row.qib_sub }] : []),
            ...(row.nii_sub != null ? [{ category: 'NII', subscriptionMultiple: row.nii_sub }] : []),
          ],
          observedAt: row.subscription_timestamp || null,
        }
      : null;

  const priceLow = row.price_band_min != null ? Number(row.price_band_min) : null;
  const priceHigh = row.price_band_max != null ? Number(row.price_band_max) : null;
  const issuePrice = priceHigh || priceLow || null;

  return {
    id: String(row.id),
    symbol: row.symbol || '',
    status,
    marketSegment,
    exchange: row.exchange || undefined,
    issuePriceInr: issuePrice,
    priceBandLow: priceLow,
    priceBandHigh: priceHigh,
    lotSize: row.lot_size != null ? Number(row.lot_size) : null,
    issueSize: row.issue_size != null ? Number(row.issue_size) : null,
    freshIssueSize: row.fresh_issue_size != null ? Number(row.fresh_issue_size) : null,
    ofsSize: row.ofs_size != null ? Number(row.ofs_size) : null,
    listingPrice: row.listing_price != null ? Number(row.listing_price) : null,
    listingGainPct: row.listing_gain_percent != null ? Number(row.listing_gain_percent) : null,
    profitAmount: row.profit_per_lot != null ? Number(row.profit_per_lot) : null,
    openDate: row.open_date || null,
    closeDate: row.close_date || null,
    allotmentDate: row.allotment_date || null,
    refundDate: row.refund_date || null,
    listingDate: row.listing_date || null,
    registrar: row.registrar || null,
    logoUrl: row.logo_url || null,
    companyName,
    company: {
      displayName: companyName,
      legalName: row.company_name || companyName,
      logoUrl: row.logo_url || undefined,
      website: row.website || null,
      sector: row.sector || null,
      aboutDescription: row.description || null,
      financials,
    },
    lifecycle: {
      openDate: row.open_date || null,
      closeDate: row.close_date || null,
      listingDate: row.listing_date || null,
      basisOfAllotmentDate: row.allotment_date || null,
      refundInitiationDate: row.refund_date || null,
      dematCreditDate: row.demat_credit_date || null,
    },
    allotment: {
      registrar: row.registrar || null,
      expectedDate: row.allotment_date || null,
      allotmentSourceUrl: row.allotment_link || null,
    },
    currentGmp,
    currentSubscription,
    total_sub: row.total_sub != null ? Number(row.total_sub) : undefined,
    qib_sub: row.qib_sub != null ? Number(row.qib_sub) : undefined,
    issue_type: row.issue_type || undefined,
    participants,
    documents,
    anchorDetails,
    lead_manager: row.lead_manager || undefined,
    sector: row.sector || undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  } as BackendIpo;
}

/**
 * Loads cached IPO records from local SQLite `ipo_master` table.
 * Returns fast, offline-first records mapped to `BackendIpo[]`.
 * Ensures deterministic ordering with stable tie-breakers.
 */
export async function getCachedBackendIpos(
  db: SQLiteDatabase,
  searchQuery?: string
): Promise<BackendIpo[]> {
  try {
    let sql = `
      SELECT * FROM ipo_master
      WHERE deleted_at IS NULL
    `;
    const params: string[] = [];

    if (searchQuery && searchQuery.trim()) {
      const q = `%${searchQuery.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(company_name) LIKE ? OR LOWER(ipo_name) LIKE ? OR LOWER(symbol) LIKE ?)`;
      params.push(q, q, q);
    }

    sql += ` ORDER BY
      CASE
        WHEN UPPER(COALESCE(NULLIF(lifecycle_status, 'Unknown'), status, '')) IN ('OPEN', 'ACTIVE', 'LIVE', 'CLOSING_TODAY') THEN 1
        WHEN UPPER(COALESCE(NULLIF(lifecycle_status, 'Unknown'), status, '')) = 'UPCOMING' THEN 2
        WHEN UPPER(COALESCE(NULLIF(lifecycle_status, 'Unknown'), status, '')) IN ('CLOSED', 'ALLOTMENT_OUT', 'ALLOTTED') THEN 3
        ELSE 4
      END,
      CASE
        WHEN open_date IS NULL OR open_date = '' OR UPPER(open_date) IN ('TBA', 'N/A') THEN 1
        ELSE 0
      END ASC,
      open_date DESC,
      company_name ASC,
      id ASC
    `;

    const rows = await safeGetAllAsync<any>(db, sql, params, 'ipoHubCacheService.getCachedBackendIpos');
    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map(mapSqliteRowToBackendIpo);
  } catch (err) {
    if (__DEV__) {
      console.warn('[ipoHubCacheService] Failed to read cached IPOs from SQLite:', err);
    }
    return [];
  }
}

/**
 * Maps a `BackendIpo` payload to `Partial<IPOMasterRecord>` for SQLite persistence.
 */
export function mapBackendIpoToRecord(item: BackendIpo): Partial<IPOMasterRecord> {
  const gmpAmt = item.currentGmp?.gmpAmount != null ? Number(item.currentGmp.gmpAmount) : null;
  const gmpPct = item.currentGmp?.gmpPercentage != null ? Number(item.currentGmp.gmpPercentage) : null;
  const profitLot = item.currentGmp?.estProfitPerLot != null
    ? Number(item.currentGmp.estProfitPerLot)
    : (item.profitAmount != null ? Number(item.profitAmount) : null);

  const financialsJson = (item as any).financials_json || (item.company?.financials ? JSON.stringify(item.company.financials) : null);
  const participantsJson = (item as any).participants_json || (item.participants ? JSON.stringify(item.participants) : null);
  const documentsJson = (item as any).documents_json || (item.documents ? JSON.stringify(item.documents) : null);
  const anchorDetailsJson = (item as any).anchor_details_json || (item.anchorDetails ? JSON.stringify(item.anchorDetails) : null);

  return {
    id: item.id,
    company_name: item.company?.displayName || item.companyName || item.symbol || '',
    ipo_name: item.company?.displayName || item.companyName || item.symbol || '',
    symbol: item.symbol || '',
    exchange: item.exchange || 'BSE / NSE',
    issue_type: item.marketSegment === 'SME' ? 'SME' : ((item as any).issue_type || 'Mainboard'),
    price_band_min: item.priceBandLow ?? null,
    price_band_max: item.priceBandHigh ?? item.issuePriceInr ?? null,
    lot_size: item.lotSize ?? null,
    issue_size: item.issueSize != null ? Number(item.issueSize) : null,
    listing_date: item.listingDate || item.lifecycle?.listingDate || null,
    open_date: item.openDate || item.lifecycle?.openDate || null,
    close_date: item.closeDate || item.lifecycle?.closeDate || null,
    allotment_date: item.allotmentDate || item.lifecycle?.basisOfAllotmentDate || null,
    refund_date: item.refundDate || item.lifecycle?.refundInitiationDate || null,
    demat_credit_date: item.lifecycle?.dematCreditDate || null,
    registrar: item.registrar || item.allotment?.registrar || '',
    lead_manager: (item as any).lead_manager || (item as any).leadManager || '',
    status: item.status || 'UPCOMING',
    lifecycle_status: item.status || 'UPCOMING',
    logo_url: item.company?.logoUrl || item.logoUrl || '',
    sector: item.company?.sector || '',
    description: item.company?.aboutDescription || '',
    website: item.company?.website || '',
    gmp_amount: gmpAmt,
    gmp_percent: gmpPct,
    profit_per_lot: profitLot,
    gmp_updated_at: item.currentGmp?.observedAt || null,
    total_sub: (item as any).total_sub ?? (item.currentSubscription?.totalSubscriptionMultiple != null ? Number(item.currentSubscription.totalSubscriptionMultiple) : null),
    listing_price: item.listingPrice ?? null,
    listing_gain_percent: item.listingGainPct ?? null,
    financials_json: financialsJson,
    participants_json: participantsJson,
    documents_json: documentsJson,
    anchor_details_json: anchorDetailsJson,
    source_type: 'SERVER',
    created_at: (item as any).createdAt || (item as any).created_at || undefined,
    updated_at: item.updatedAt || undefined,
  };
}

/**
 * Checks whether an incoming record differs meaningfully from an existing SQLite record.
 * Avoids rewriting unchanged rows or altering timestamps unnecessarily.
 */
export function isRecordDifferent(existing: any, incoming: Partial<IPOMasterRecord>): boolean {
  if (!existing) return true;

  const numDiff = (a: any, b: any) => {
    const na = a != null && a !== '' ? Number(a) : null;
    const nb = b != null && b !== '' ? Number(b) : null;
    if (na === null && nb === null) return false;
    if (na === null || nb === null) return true;
    return Math.abs(na - nb) > 0.0001;
  };

  const strDiff = (a: any, b: any) => {
    const sa = (a != null ? String(a) : '').trim();
    const sb = (b != null ? String(b) : '').trim();
    return sa !== sb;
  };

  const dateDiff = (a: any, b: any) => {
    const sa = (a != null ? String(a) : '').trim();
    const sb = (b != null ? String(b) : '').trim();
    if (sa === sb) return false;
    if (!sa && !sb) return false;
    if (!sa || !sb) return true;
    const tA = new Date(sa).getTime();
    const tB = new Date(sb).getTime();
    if (!isNaN(tA) && !isNaN(tB)) {
      return Math.abs(tA - tB) > 1000;
    }
    return sa !== sb;
  };

  const jsonDiff = (a: any, b: any) => {
    const sa = (a != null ? String(a) : '').trim();
    const sb = (b != null ? String(b) : '').trim();
    if (sa === sb) return false;
    const isEmptyA = !sa || sa === '[]' || sa === '{}' || sa === 'null';
    const isEmptyB = !sb || sb === '[]' || sb === '{}' || sb === 'null';
    if (isEmptyA && isEmptyB) return false;
    if (isEmptyA !== isEmptyB) return true;
    try {
      const objA = JSON.parse(sa);
      const objB = JSON.parse(sb);
      return JSON.stringify(objA) !== JSON.stringify(objB);
    } catch {
      return sa !== sb;
    }
  };

  const statusDiff = (a: any, b: any) => {
    const sa = (a != null ? String(a) : '').trim().toUpperCase();
    const sb = (b != null ? String(b) : '').trim().toUpperCase();
    return sa !== sb;
  };

  // Status & Lifecycle Status (compare against existing effective status matching mapSqliteRowToBackendIpo)
  const existingEffectiveStatus = (existing.lifecycle_status && existing.lifecycle_status !== 'Unknown' && existing.lifecycle_status !== 'NULL')
    ? existing.lifecycle_status
    : existing.status;
  if (incoming.status && statusDiff(existingEffectiveStatus, incoming.status)) return true;

  // Dates (only if incoming has non-empty date)
  if (incoming.open_date && dateDiff(existing.open_date, incoming.open_date)) return true;
  if (incoming.close_date && dateDiff(existing.close_date, incoming.close_date)) return true;
  if (incoming.allotment_date && dateDiff(existing.allotment_date, incoming.allotment_date)) return true;
  if (incoming.listing_date && dateDiff(existing.listing_date, incoming.listing_date)) return true;
  if (incoming.refund_date && dateDiff(existing.refund_date, incoming.refund_date)) return true;
  if (incoming.demat_credit_date && dateDiff(existing.demat_credit_date, incoming.demat_credit_date)) return true;

  // Price & Lots
  if (incoming.price_band_min != null && numDiff(existing.price_band_min, incoming.price_band_min)) return true;
  if (incoming.price_band_max != null && numDiff(existing.price_band_max, incoming.price_band_max)) return true;
  if (incoming.lot_size != null && numDiff(existing.lot_size, incoming.lot_size)) return true;
  if (incoming.issue_size != null && numDiff(existing.issue_size, incoming.issue_size)) return true;

  // GMP
  if (incoming.gmp_amount != null && numDiff(existing.gmp_amount, incoming.gmp_amount)) return true;
  if (incoming.gmp_percent != null && numDiff(existing.gmp_percent, incoming.gmp_percent)) return true;
  if (incoming.profit_per_lot != null && numDiff(existing.profit_per_lot, incoming.profit_per_lot)) return true;
  if (incoming.gmp_updated_at && dateDiff(existing.gmp_updated_at, incoming.gmp_updated_at)) return true;

  // Subscription
  if (incoming.total_sub != null && numDiff(existing.total_sub, incoming.total_sub)) return true;

  // Listing performance
  if (incoming.listing_price != null && numDiff(existing.listing_price, incoming.listing_price)) return true;
  if (incoming.listing_gain_percent != null && numDiff(existing.listing_gain_percent, incoming.listing_gain_percent)) return true;

  // Identity / Text fields (only if incoming provides a non-empty string)
  if (incoming.company_name && strDiff(existing.company_name, incoming.company_name)) return true;
  if (incoming.symbol && strDiff(existing.symbol, incoming.symbol)) return true;
  if (incoming.registrar && strDiff(existing.registrar, incoming.registrar)) return true;
  if (incoming.lead_manager && strDiff(existing.lead_manager, incoming.lead_manager)) return true;
  if (incoming.logo_url) {
    const normA = (existing.logo_url || '').replace(/\/image\/upload\/(e_trim\/)?/, '/image/upload/');
    const normB = (incoming.logo_url || '').replace(/\/image\/upload\/(e_trim\/)?/, '/image/upload/');
    if (strDiff(normA, normB)) return true;
  }

  // Structured JSON fields (only if incoming provides non-empty JSON that differs)
  if (incoming.financials_json && jsonDiff(existing.financials_json, incoming.financials_json)) return true;
  if (incoming.documents_json && jsonDiff(existing.documents_json, incoming.documents_json)) return true;
  if (incoming.participants_json && jsonDiff(existing.participants_json, incoming.participants_json)) return true;
  if (incoming.anchor_details_json && jsonDiff(existing.anchor_details_json, incoming.anchor_details_json)) return true;

  return false;
}

export interface CacheReconciliationResult {
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  hasChanges: boolean;
}

/**
 * Reconciles incoming BackendIpo items against local SQLite data.
 * Persists ONLY genuine new inserts and changed rows.
 * If backend data is unchanged, does not rewrite rows or update timestamps.
 */
export async function reconcileBackendIposWithCache(
  db: SQLiteDatabase,
  ipos: BackendIpo[]
): Promise<CacheReconciliationResult> {
  if (!db || !isDatabaseOpen(db) || !ipos || ipos.length === 0) {
    return { insertedCount: 0, updatedCount: 0, unchangedCount: 0, hasChanges: false };
  }

  try {
    const existingRows = await safeGetAllAsync<any>(
      db,
      'SELECT * FROM ipo_master WHERE deleted_at IS NULL',
      [],
      'ipoHubCacheService.reconcileBackendIposWithCache.getExisting'
    );
    const existingMap = new Map<string, any>();
    for (const row of existingRows || []) {
      if (row.id) existingMap.set(row.id, row);
    }

    const recordsToInsert: Partial<IPOMasterRecord>[] = [];
    const recordsToUpdate: Partial<IPOMasterRecord>[] = [];
    let unchangedCount = 0;

    for (const item of ipos) {
      if (!item || !item.id) continue;
      const existing = existingMap.get(item.id);
      const mapped = mapBackendIpoToRecord(item);

      if (!existing) {
        // Genuine new record
        mapped.updated_at = mapped.updated_at || new Date().toISOString();
        recordsToInsert.push(mapped);
      } else {
        if (isRecordDifferent(existing, mapped)) {
          // Genuinely changed record
          mapped.updated_at = mapped.updated_at || new Date().toISOString();
          recordsToUpdate.push(mapped);
        } else {
          unchangedCount++;
        }
      }
    }

    const hasChanges = recordsToInsert.length > 0 || recordsToUpdate.length > 0;
    if (!hasChanges) {
      return {
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount,
        hasChanges: false,
      };
    }

    const repo = new IPORepository(db);
    const recordsToPersist = [...recordsToInsert, ...recordsToUpdate];
    await repo.upsertBatch(recordsToPersist, false);

    return {
      insertedCount: recordsToInsert.length,
      updatedCount: recordsToUpdate.length,
      unchangedCount,
      hasChanges: true,
    };
  } catch (err: any) {
    if (isClosedResourceError(err)) {
      return { insertedCount: 0, updatedCount: 0, unchangedCount: 0, hasChanges: false };
    }
    if (__DEV__) {
      console.warn('[ipoHubCacheService] Failed to reconcile BackendIpos to SQLite:', err);
    }
    return { insertedCount: 0, updatedCount: 0, unchangedCount: 0, hasChanges: false };
  }
}

/**
 * Persists freshly fetched BackendIpo records into local SQLite `ipo_master`.
 * Enables subsequent launches to render without waiting on network.
 * Note: uses isAuthoritative: false to ensure rich existing records (financials,
 * documents, intelligence, lead managers, etc.) are NOT wiped out by shallow responses.
 * Reconciles before writing to skip unchanged records and prevent needless timestamp updates.
 */
export async function saveBackendIposToCache(
  db: SQLiteDatabase,
  ipos: BackendIpo[]
): Promise<number> {
  const result = await reconcileBackendIposWithCache(db, ipos);
  return result.insertedCount + result.updatedCount;
}
