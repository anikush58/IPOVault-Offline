import { useCallback, useEffect, useState, useRef } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { safeGetAllAsync } from '@/utils/sqliteDebug';
import type { ManagedAccountAllotmentResult } from '@/components/allotment/AllotmentSuccessModal';

let RNAppState: any;
try {
  RNAppState = require('react-native').AppState;
} catch {}

export interface UnviewedAllotmentResultState {
  ipoId: string;
  backendIpoId?: string | null;
  listingId?: string | null;
  ipoName: string;
  companyName: string;
  results: ManagedAccountAllotmentResult[];
}

import {
  markAllotmentModalAsSeen,
  isAllotmentModalSeen,
  MAX_ALLOTMENT_FRESHNESS_MS,
  isIpoAlreadyListed,
  isAllotmentLatestAndFresh,
} from '@/utils/allotmentModalUtils';

export {
  markAllotmentModalAsSeen,
  isAllotmentModalSeen,
  MAX_ALLOTMENT_FRESHNESS_MS,
  isIpoAlreadyListed,
  isAllotmentLatestAndFresh,
};

export function useAllotmentResultModal() {
  const db = useSQLiteContext();
  const [modalState, setModalState] = useState<UnviewedAllotmentResultState | null>(null);
  const [visible, setVisible] = useState(false);
  const inFlightRef = useRef(false);
  const hasShownThisSessionRef = useRef(false);

  const checkUnviewedAllotmentResults = useCallback(async () => {
    if (visible || modalState || hasShownThisSessionRef.current || inFlightRef.current || !db) {
      return;
    }
    inFlightRef.current = true;
    try {
      // 1. Fetch distinct IPOs that have applications and completed allotment results
      // Strictly exclude already listed IPOs, and sort by actual allotment recency
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
        category: string | null;
        allotment_status: string | null;
        allotted_shares: number | null;
        allotted_lots: number | null;
        checked_at: string | null;
        ipo_status: string | null;
        lifecycle_status: string | null;
        listing_date: string | null;
        allotment_date: string | null;
      }>(
        db,
        `SELECT
           a.id as application_id,
           a.user_id,
           u.name as user_name,
           a.ipo_id,
           a.category,
           l.backend_ipo_id,
           l.id as listing_id,
           COALESCE(m.ipo_name, l.ipo_name, a.ipo_id) as ipo_name,
           COALESCE(m.company_name, l.company_name, l.ipo_name, 'IPO') as company_name,
           a.status as application_status,
           a.shares_count as applied_quantity,
           alt.allotment_status,
           alt.allotted_shares,
           alt.allotted_lots,
           alt.checked_at,
           COALESCE(m.status, '') as ipo_status,
           COALESCE(m.lifecycle_status, '') as lifecycle_status,
           COALESCE(m.listing_date, l.listing_date, '') as listing_date,
           COALESCE(m.allotment_date, l.allotment_date, '') as allotment_date
         FROM ipo_applications a
         JOIN users_table u ON a.user_id = u.id
         LEFT JOIN ipo_listings l ON a.ipo_id = l.id
         LEFT JOIN ipo_master m ON (l.backend_ipo_id = m.id OR a.ipo_id = m.id)
         LEFT JOIN ipo_allotments alt ON a.id = alt.application_id
         WHERE (
           alt.allotment_status IS NOT NULL
           OR LOWER(a.status) IN ('allotted', 'partially allotted')
         )
         AND LOWER(COALESCE(m.status, '')) NOT IN ('listed', 'closed', 'archived')
         AND LOWER(COALESCE(m.lifecycle_status, '')) NOT IN ('listed', 'closed', 'archived')
         AND a.deleted_at IS NULL
         ORDER BY COALESCE(alt.checked_at, alt.created_at, m.allotment_date, l.allotment_date) DESC`,
        [],
        'useAllotmentResultModal.checkUnviewed'
      );

      if (!rows || rows.length === 0) {
        return;
      }

      // Group rows by canonical IPO ID preserving recency order
      const ipoMap = new Map<string, {
        ipoId: string;
        backendIpoId?: string | null;
        listingId?: string | null;
        ipoName: string;
        companyName: string;
        ipoStatus?: string | null;
        lifecycleStatus?: string | null;
        listingDate?: string | null;
        allotmentDate?: string | null;
        latestCheckedAt?: string | null;
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
            ipoStatus: row.ipo_status,
            lifecycleStatus: row.lifecycle_status,
            listingDate: row.listing_date,
            allotmentDate: row.allotment_date,
            latestCheckedAt: row.checked_at,
            results: [],
          });
        } else {
          const cur = ipoMap.get(canonicalKey)!;
          if (row.checked_at && (!cur.latestCheckedAt || new Date(row.checked_at) > new Date(cur.latestCheckedAt))) {
            cur.latestCheckedAt = row.checked_at;
          }
          if (row.ipo_status && !cur.ipoStatus) cur.ipoStatus = row.ipo_status;
          if (row.lifecycle_status && !cur.lifecycleStatus) cur.lifecycleStatus = row.lifecycle_status;
          if (row.listing_date && !cur.listingDate) cur.listingDate = row.listing_date;
          if (row.allotment_date && !cur.allotmentDate) cur.allotmentDate = row.allotment_date;
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

        const existingResult = ipoMap.get(canonicalKey)!.results.find(
          (r) =>
            r.userId === row.user_id ||
            (r.userName && row.user_name && r.userName.toLowerCase().trim() === row.user_name.toLowerCase().trim())
        );

        const rowCategory = (row.category || 'RETAIL').toUpperCase();

        if (!existingResult) {
          ipoMap.get(canonicalKey)!.results.push({
            applicationId: row.application_id,
            userId: row.user_id,
            userName: row.user_name || 'Applicant',
            status: normalizedStatus,
            sharesAllotted: row.allotted_shares || 0,
            allottedLots: row.allotted_lots || (normalizedStatus === 'ALLOTTED' ? 1 : 0),
            appliedQuantity: row.applied_quantity || 0,
            category: rowCategory,
            categories: [
              {
                category: rowCategory,
                status: normalizedStatus,
                sharesAllotted: row.allotted_shares || 0,
                allottedLots: row.allotted_lots || (normalizedStatus === 'ALLOTTED' ? 1 : 0),
              },
            ],
          });
        } else {
          // Merge category results without overwriting or double counting
          existingResult.categories = existingResult.categories || [];
          if (existingResult.category && existingResult.categories.length === 0) {
            existingResult.categories.push({
              category: existingResult.category,
              status: existingResult.status,
              sharesAllotted: existingResult.sharesAllotted,
              allottedLots: existingResult.allottedLots,
            });
          }

          const existingCatIdx = existingResult.categories.findIndex(
            (c) => c.category.toUpperCase() === rowCategory,
          );
          const newCatItem = {
            category: rowCategory,
            status: normalizedStatus,
            sharesAllotted: row.allotted_shares || 0,
            allottedLots: row.allotted_lots || (normalizedStatus === 'ALLOTTED' ? 1 : 0),
          };

          if (existingCatIdx >= 0) {
            existingResult.categories[existingCatIdx] = newCatItem;
          } else {
            existingResult.categories.push(newCatItem);
          }

          // If ANY category confirmed allotted => overall ALLOTTED
          const hasAllotted = existingResult.categories.some(
            (c) => c.status === 'ALLOTTED' || c.status === 'PARTIALLY_ALLOTTED',
          );
          const allNotAllotted = existingResult.categories.every(
            (c) => c.status === 'NOT_ALLOTTED',
          );

          if (hasAllotted) {
            existingResult.status = 'ALLOTTED';
          } else if (allNotAllotted) {
            existingResult.status = 'NOT_ALLOTTED';
          }

          // Total shares and lots sum across all categories
          existingResult.sharesAllotted = existingResult.categories.reduce(
            (sum, c) => sum + (c.sharesAllotted || 0),
            0,
          );
          existingResult.allottedLots = existingResult.categories.reduce(
            (sum, c) => sum + (c.allottedLots || 0),
            0,
          );
        }
      }

      // Check each IPO in recency order:
      // 1. MUST NOT be already listed
      // 2. MUST be a latest/fresh allotment (within last 5 days)
      // 3. MUST have at least one allotted account
      // 4. MUST not have been seen by the user
      for (const [canonicalKey, ipoData] of ipoMap.entries()) {
        const identifiers = [
          canonicalKey,
          ipoData.ipoId,
          ipoData.backendIpoId,
          ipoData.listingId,
          ipoData.ipoName,
          ipoData.companyName,
        ];

        // Filter 1: Strictly exclude already listed IPOs
        if (
          isIpoAlreadyListed({
            ipoStatus: ipoData.ipoStatus,
            lifecycleStatus: ipoData.lifecycleStatus,
            listingDate: ipoData.listingDate,
          })
        ) {
          void markAllotmentModalAsSeen(identifiers);
          continue;
        }

        // Filter 2: Strictly exclude stale historical allotments (> 5 days)
        if (
          !isAllotmentLatestAndFresh({
            allotmentDate: ipoData.allotmentDate,
            latestCheckedAt: ipoData.latestCheckedAt,
          })
        ) {
          void markAllotmentModalAsSeen(identifiers);
          continue;
        }

        // Filter 3: Must have at least one successfully allotted account
        const hasAllottedAccount = ipoData.results.some(
          (r) => r.status === 'ALLOTTED' || r.status === 'PARTIALLY_ALLOTTED'
        );

        if (!hasAllottedAccount) {
          continue;
        }

        const isAlreadySeen = await isAllotmentModalSeen(identifiers);

        if (!isAlreadySeen) {
          // Found newest unviewed IPO with successful allotment
          hasShownThisSessionRef.current = true;
          setModalState(ipoData);
          setVisible(true);

          // IMMEDIATELY mark as seen in persistent storage so it will NEVER trigger again
          await markAllotmentModalAsSeen(identifiers);

          // Also mark any older historical IPOs as seen to prevent back-to-back modal cascade
          for (const [otherKey, otherData] of ipoMap.entries()) {
            if (otherKey !== canonicalKey) {
              void markAllotmentModalAsSeen([
                otherKey,
                otherData.ipoId,
                otherData.backendIpoId,
                otherData.listingId,
                otherData.ipoName,
                otherData.companyName,
              ]);
            }
          }
          return;
        }
      }
    } catch (err: any) {
      const msg = (err?.message || String(err)).toLowerCase();
      if (msg.includes('closed resource') || msg.includes('access to closed resource')) {
        return;
      }
      if (__DEV__) console.warn('[useAllotmentResultModal] Error checking unviewed results:', err);
    } finally {
      inFlightRef.current = false;
    }
  }, [db, visible, modalState]);

  useEffect(() => {
    // 1. Initial check when user opens the app cold
    checkUnviewedAllotmentResults();

    // 2. Check when app transitions from background to foreground (user opens app after allotment comes)
    if (!RNAppState?.addEventListener) return;
    let currentAppState = RNAppState.currentState;
    const subscription = RNAppState.addEventListener('change', (nextAppState: any) => {
      if (currentAppState && currentAppState.match(/inactive|background/) && nextAppState === 'active') {
        checkUnviewedAllotmentResults();
      }
      currentAppState = nextAppState;
    });

    return () => {
      subscription?.remove?.();
    };
  }, [checkUnviewedAllotmentResults]);

  const dismissModal = useCallback(async () => {
    if (modalState) {
      await markAllotmentModalAsSeen([
        modalState.ipoId,
        modalState.backendIpoId,
        modalState.listingId,
        modalState.ipoName,
        modalState.companyName,
      ]);
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
