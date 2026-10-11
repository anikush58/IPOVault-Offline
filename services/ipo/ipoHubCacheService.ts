import { SQLiteDatabase } from 'expo-sqlite';
import { BackendIpo } from '@/types/backend-ipo';
import { safeGetAllAsync } from '@/utils/sqliteDebug';
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
      open_date DESC,
      created_at DESC
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
 * Persists freshly fetched BackendIpo records into local SQLite `ipo_master`.
 * Enables subsequent launches to render without waiting on network.
 * Note: uses isAuthoritative: false to ensure rich existing records (financials,
 * documents, intelligence, lead managers, etc.) are NOT wiped out by shallow responses.
 */
export async function saveBackendIposToCache(
  db: SQLiteDatabase,
  ipos: BackendIpo[]
): Promise<number> {
  if (!db || !ipos || ipos.length === 0) return 0;
  try {
    const repo = new IPORepository(db);
    const records: Partial<IPOMasterRecord>[] = ipos.map((item) => {
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
        updated_at: item.updatedAt || new Date().toISOString(),
      };
    });

    // isAuthoritative: false ensures non-destructive merge semantics
    return await repo.upsertBatch(records, false);
  } catch (err) {
    if (__DEV__) {
      console.warn('[ipoHubCacheService] Failed to cache BackendIpos to SQLite:', err);
    }
    return 0;
  }
}
