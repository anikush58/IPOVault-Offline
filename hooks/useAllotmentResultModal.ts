import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { safeGetAllAsync } from '@/utils/sqliteDebug';
import { ManagedAccountAllotmentResult } from '@/components/allotment/AllotmentSuccessModal';

export interface UnviewedAllotmentResultState {
  ipoId: string;
  backendIpoId?: string | null;
  listingId?: string | null;
  ipoName: string;
  companyName: string;
  results: ManagedAccountAllotmentResult[];
}

export function useAllotmentResultModal() {
  const db = useSQLiteContext();
  const [modalState, setModalState] = useState<UnviewedAllotmentResultState | null>(null);
  const [visible, setVisible] = useState(false);

  const checkUnviewedAllotmentResults = useCallback(async () => {
    try {
      // 1. Fetch all distinct IPOs that have applications and completed allotment results
      const rows = await safeGetAllAsync<{
        application_id: string;
        user_id: string;
        user_name: string;
        ipo_id: string;
        backend_ipo_id: string | null;
        listing_id: string | null;
        ipo_name: string;
        company_name: string;
        application_status: string;
        applied_quantity: number;
        allotment_status: string | null;
        allotted_shares: number | null;
        allotted_lots: number | null;
      }>(
        db,
        `SELECT
           a.id as application_id,
           a.user_id,
           u.name as user_name,
           a.ipo_id,
           l.backend_ipo_id,
           l.id as listing_id,
           COALESCE(m.ipo_name, l.ipo_name, a.ipo_id) as ipo_name,
           COALESCE(m.company_name, l.company_name, l.ipo_name, 'IPO') as company_name,
           a.status as application_status,
           a.shares_count as applied_quantity,
           alt.allotment_status,
           alt.allotted_shares,
           alt.allotted_lots
         FROM ipo_applications a
         JOIN users_table u ON a.user_id = u.id
         LEFT JOIN ipo_listings l ON a.ipo_id = l.id
         LEFT JOIN ipo_master m ON (l.backend_ipo_id = m.id OR a.ipo_id = m.id)
         LEFT JOIN ipo_allotments alt ON a.id = alt.application_id
         WHERE (
           alt.allotment_status IS NOT NULL
           OR LOWER(a.status) IN ('allotted', 'partially allotted', 'not allotted')
           OR LOWER(COALESCE(m.status, '')) IN ('allotment_completed', 'allotment out', 'listed')
           OR LOWER(COALESCE(m.lifecycle_status, '')) IN ('allotment_completed', 'allotment out', 'listed')
         )
         ORDER BY a.created_at DESC`,
        [],
        'useAllotmentResultModal.checkUnviewed'
      );

      if (!rows || rows.length === 0) {
        return;
      }

      // Group rows by canonical IPO ID
      const ipoMap = new Map<string, {
        ipoId: string;
        backendIpoId?: string | null;
        listingId?: string | null;
        ipoName: string;
        companyName: string;
        results: ManagedAccountAllotmentResult[];
      }>();

      for (const row of rows) {
        const canonicalKey = row.backend_ipo_id || row.ipo_id;
        if (!ipoMap.has(canonicalKey)) {
          ipoMap.set(canonicalKey, {
            ipoId: row.ipo_id,
            backendIpoId: row.backend_ipo_id,
            listingId: row.listing_id,
            ipoName: row.ipo_name,
            companyName: row.company_name,
            results: [],
          });
        }

        const rawStatus = (row.allotment_status || row.application_status || 'PENDING').toUpperCase();
        let normalizedStatus: 'ALLOTTED' | 'PARTIALLY_ALLOTTED' | 'NOT_ALLOTTED' | 'NO_RECORD' | 'PENDING' = 'PENDING';

        if (rawStatus.includes('PARTIAL')) {
          normalizedStatus = 'PARTIALLY_ALLOTTED';
        } else if (rawStatus.includes('ALLOTTED') && !rawStatus.includes('NOT')) {
          normalizedStatus = 'ALLOTTED';
        } else if (rawStatus.includes('NOT') || rawStatus.includes('REJECTED')) {
          normalizedStatus = 'NOT_ALLOTTED';
        } else if (rawStatus.includes('NO_RECORD')) {
          normalizedStatus = 'NO_RECORD';
        }

        ipoMap.get(canonicalKey)!.results.push({
          applicationId: row.application_id,
          userId: row.user_id,
          userName: row.user_name || 'Applicant',
          status: normalizedStatus,
          sharesAllotted: row.allotted_shares || 0,
          allottedLots: row.allotted_lots || (normalizedStatus === 'ALLOTTED' ? 1 : 0),
          appliedQuantity: row.applied_quantity || 0,
        });
      }

      // Check each IPO: only show if at least ONE managed account received allotment
      // and user has not already dismissed that IPO modal
      for (const [canonicalKey, ipoData] of ipoMap.entries()) {
        const hasAllottedAccount = ipoData.results.some(
          (r) => r.status === 'ALLOTTED' || r.status === 'PARTIALLY_ALLOTTED'
        );

        if (!hasAllottedAccount) {
          // Rule 5: If no managed account received allotment, do not show success modal
          continue;
        }

        const keysToCheck = [
          `seen_allotment_modal_${canonicalKey}`,
          `seen_allotment_modal_${ipoData.ipoId}`,
          ipoData.backendIpoId ? `seen_allotment_modal_${ipoData.backendIpoId}` : null,
          ipoData.listingId ? `seen_allotment_modal_${ipoData.listingId}` : null,
        ].filter((k): k is string => Boolean(k));

        const seenValues = await Promise.all(
          keysToCheck.map((k) => safeAsyncStorage.getItem(k))
        );

        const isAlreadySeen = seenValues.some((v) => v === 'true');

        if (!isAlreadySeen) {
          // First unviewed IPO with successful allotment found -> trigger modal
          setModalState(ipoData);
          setVisible(true);
          return;
        }
      }
    } catch (err: any) {
      const msg = (err?.message || String(err)).toLowerCase();
      if (msg.includes('closed resource') || msg.includes('access to closed resource')) {
        return;
      }
      if (__DEV__) console.warn('[useAllotmentResultModal] Error checking unviewed results:', err);
    }
  }, [db]);

  useEffect(() => {
    checkUnviewedAllotmentResults();
  }, [checkUnviewedAllotmentResults]);

  const dismissModal = useCallback(async () => {
    if (modalState) {
      const keysToMark = [
        modalState.ipoId,
        modalState.backendIpoId,
        modalState.listingId,
      ].filter((k): k is string => Boolean(k));

      for (const key of keysToMark) {
        await safeAsyncStorage.setItem(`seen_allotment_modal_${key}`, 'true');
      }
    }
    setVisible(false);
    setModalState(null);
  }, [modalState]);

  return {
    visible,
    modalState,
    dismissModal,
    recheckUnviewed: checkUnviewedAllotmentResults,
  };
}
