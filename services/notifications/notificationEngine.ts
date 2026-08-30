import { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { IPOMasterRecord } from '@/services/ipo/types';
import { evaluateIPORadarScore } from '@/services/ipo/radarScoringEngine';
import { safeRunAsync, safeGetFirstAsync, safeGetAllAsync } from '@/utils/sqliteDebug';

export type NotificationType =
  | 'NEW_IPO'
  | 'IPO_OPEN'
  | 'IPO_CLOSING_SOON'
  | 'IPO_CLOSING_TODAY'
  | 'ALLOTTED'
  | 'PARTIALLY_ALLOTTED'
  | 'NOT_ALLOTTED'
  | 'GMP_CHANGE'
  | 'RADAR_UPGRADE';

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  ipo_id: string | null;
  application_id: string | null;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  delivered_at: string | null;
  dedupe_key: string;
}

export const GMP_THRESHOLD_CONFIG = {
  MIN_ABS_CHANGE: 10,  // ₹10 change
  MIN_PCT_CHANGE: 15,  // 15% change
};

const RADAR_CATEGORY_RANK: Record<string, number> = {
  AVOID: 0,
  LOW_PRIORITY: 1,
  NEUTRAL: 2,
  MOMENTUM_CANDIDATE: 3,
  WATCH: 4,
  HIGH_CONVICTION: 5,
};

// Safe helper for local notifications
export async function scheduleLocalNotification(title: string, body: string, data?: Record<string, any>) {
  try {
    const Notifications = require('expo-notifications');
    if (Notifications && Notifications.scheduleNotificationAsync) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: 'default',
        },
        trigger: null, // trigger immediately
      });
    }
  } catch {
    // Local notification optional in Expo Go if module not installed
    if (__DEV__) console.log(`[Local Notification] ${title}: ${body}`);
  }
}

// Generate deduplicated notification in SQLite
export async function createDeduplicatedNotification(
  db: SQLiteDatabase,
  params: {
    type: NotificationType;
    ipo_id?: string | null;
    application_id?: string | null;
    title: string;
    body: string;
    dedupe_key: string;
  }
): Promise<NotificationRecord | null> {
  const existing = await safeGetFirstAsync<NotificationRecord>(
    db,
    'SELECT * FROM notifications WHERE dedupe_key = ?',
    [params.dedupe_key],
    'createDeduplicatedNotification.check'
  );

  if (existing) {
    return null; // Already generated! Prevents duplicates from repeated syncs
  }

  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await safeRunAsync(
    db,
    `INSERT INTO notifications (id, type, ipo_id, application_id, title, body, created_at, read_at, delivered_at, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      id,
      params.type,
      params.ipo_id || null,
      params.application_id || null,
      params.title,
      params.body,
      now,
      now, // delivered timestamp
      params.dedupe_key,
    ],
    'createDeduplicatedNotification.insert'
  );

  // Trigger local device alert
  await scheduleLocalNotification(params.title, params.body, { ipoId: params.ipo_id, type: params.type });

  return {
    id,
    type: params.type,
    ipo_id: params.ipo_id || null,
    application_id: params.application_id || null,
    title: params.title,
    body: params.body,
    created_at: now,
    read_at: null,
    delivered_at: now,
    dedupe_key: params.dedupe_key,
  };
}

// Main Notification Engine Runner (Called after Automatic Background Sync)
export async function runNotificationEngine(
  db: SQLiteDatabase,
  syncedIPOs: IPOMasterRecord[]
): Promise<number> {
  if (!syncedIPOs || syncedIPOs.length === 0) return 0;

  let generatedCount = 0;
  const todayStr = new Date().toISOString().split('T')[0];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  for (const ipo of syncedIPOs) {
    if (!ipo || !ipo.id) continue;
    const ipoName = ipo.company_name || ipo.ipo_name || 'IPO';

    // 1. EVENT: NEW IPO PUBLISHED
    const newIpoDedupe = `new_ipo_${ipo.id}`;
    const notifNew = await createDeduplicatedNotification(db, {
      type: 'NEW_IPO',
      ipo_id: ipo.id,
      title: 'New IPO Available',
      body: `${ipoName} is now available for bidding on IPOVault.`,
      dedupe_key: newIpoDedupe,
    });
    if (notifNew) generatedCount++;

    // 2. EVENT: IPO OPENING
    if (ipo.open_date === todayStr) {
      const openDedupe = `ipo_open_${ipo.id}_${todayStr}`;
      const notifOpen = await createDeduplicatedNotification(db, {
        type: 'IPO_OPEN',
        ipo_id: ipo.id,
        title: 'IPO Open for Bidding',
        body: `${ipoName} is now open for subscription.`,
        dedupe_key: openDedupe,
      });
      if (notifOpen) generatedCount++;
    }

    // 3. EVENT: IPO CLOSING SOON (1 Day Before)
    if (ipo.close_date === tomorrowStr) {
      const closeSoonDedupe = `ipo_closing_soon_${ipo.id}_${tomorrowStr}`;
      const notifCloseSoon = await createDeduplicatedNotification(db, {
        type: 'IPO_CLOSING_SOON',
        ipo_id: ipo.id,
        title: 'IPO Closing Soon',
        body: `${ipoName} closes tomorrow. Make sure to place your bids.`,
        dedupe_key: closeSoonDedupe,
      });
      if (notifCloseSoon) generatedCount++;
    }

    // 4. EVENT: IPO CLOSING TODAY
    if (ipo.close_date === todayStr) {
      const closeTodayDedupe = `ipo_closing_today_${ipo.id}_${todayStr}`;
      const notifCloseToday = await createDeduplicatedNotification(db, {
        type: 'IPO_CLOSING_TODAY',
        ipo_id: ipo.id,
        title: 'Final Day to Apply',
        body: `${ipoName} closes today for subscription.`,
        dedupe_key: closeTodayDedupe,
      });
      if (notifCloseToday) generatedCount++;
    }

    // Tracker query for GMP & Radar comparison
    const trackerRow = await safeGetFirstAsync<{
      last_notified_gmp: number | null;
      last_notified_radar_category: string | null;
    }>(
      db,
      'SELECT last_notified_gmp, last_notified_radar_category FROM notification_tracker WHERE ipo_id = ?',
      [ipo.id],
      'runNotificationEngine.getTracker'
    );

    const prevGmp = trackerRow?.last_notified_gmp ?? null;
    const prevRadarCat = trackerRow?.last_notified_radar_category ?? null;

    // 5. EVENT: SIGNIFICANT GMP CHANGE
    const currentGmp = ipo.gmp_amount;
    if (currentGmp != null && !isNaN(currentGmp)) {
      let shouldNotifyGmp = false;
      let gmpTitle = 'Significant GMP Change';
      let gmpBody = '';

      if (prevGmp === null) {
        // Initial GMP available
        shouldNotifyGmp = true;
        gmpTitle = 'GMP Data Available';
        gmpBody = `${ipoName} GMP is estimated at +₹${currentGmp}${ipo.gmp_percent != null ? ` (+${ipo.gmp_percent.toFixed(1)}%)` : ''}.`;
      } else {
        const absDiff = Math.abs(currentGmp - prevGmp);
        const pctDiff = prevGmp !== 0 ? (absDiff / Math.abs(prevGmp)) * 100 : 100;

        if (absDiff >= GMP_THRESHOLD_CONFIG.MIN_ABS_CHANGE || pctDiff >= GMP_THRESHOLD_CONFIG.MIN_PCT_CHANGE) {
          shouldNotifyGmp = true;
          const direction = currentGmp > prevGmp ? 'increased' : 'decreased';
          gmpTitle = `GMP ${direction.toUpperCase()}`;
          gmpBody = `${ipoName} GMP ${direction} from ₹${prevGmp} to ₹${currentGmp}.`;
        }
      }

      if (shouldNotifyGmp) {
        const gmpDedupe = `gmp_change_${ipo.id}_${currentGmp}`;
        const notifGmp = await createDeduplicatedNotification(db, {
          type: 'GMP_CHANGE',
          ipo_id: ipo.id,
          title: gmpTitle,
          body: gmpBody,
          dedupe_key: gmpDedupe,
        });

        if (notifGmp) {
          generatedCount++;
          const nowIso = new Date().toISOString();
          await safeRunAsync(
            db,
            `INSERT INTO notification_tracker (ipo_id, last_notified_gmp, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(ipo_id) DO UPDATE SET last_notified_gmp=excluded.last_notified_gmp, updated_at=excluded.updated_at`,
            [ipo.id, currentGmp, nowIso],
            'runNotificationEngine.updateGmpTracker'
          );
        }
      }
    }

    // 6. EVENT: RADAR CATEGORY UPGRADE & DOWNGRADE TRANSITIONS
    const radarScore = evaluateIPORadarScore(ipo);
    const currentCategory = radarScore.category;
    const currentRank = RADAR_CATEGORY_RANK[currentCategory] ?? 1;
    const prevRank = prevRadarCat ? (RADAR_CATEGORY_RANK[prevRadarCat] ?? 1) : 0;

    if (prevRadarCat && currentRank > prevRank && currentRank >= 3) {
      const radarDedupe = `radar_upgrade_${ipo.id}_${currentCategory}`;
      const notifRadar = await createDeduplicatedNotification(db, {
        type: 'RADAR_UPGRADE',
        ipo_id: ipo.id,
        title: `${radarScore.categoryLabel} Opportunity`,
        body: `${ipoName} upgraded to ${radarScore.categoryLabel} Radar (Score: ${radarScore.score}/100).`,
        dedupe_key: radarDedupe,
      });

      if (notifRadar) {
        generatedCount++;
        const nowIso = new Date().toISOString();
        await safeRunAsync(
          db,
          `INSERT INTO notification_tracker (ipo_id, last_notified_radar_category, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(ipo_id) DO UPDATE SET last_notified_radar_category=excluded.last_notified_radar_category, updated_at=excluded.updated_at`,
          [ipo.id, currentCategory, nowIso],
          'runNotificationEngine.updateRadarTracker'
        );
      }
    } else if (prevRadarCat && currentRank < prevRank) {
      const isAvoidDrop = currentCategory === 'AVOID';
      const dedupeKey = isAvoidDrop ? `radar_avoid_${ipo.id}_${currentCategory}` : `radar_downgrade_${ipo.id}_${currentCategory}`;
      const title = isAvoidDrop ? `🔴 ${ipoName} Moved to AVOID` : `📉 Conviction Weakened: ${ipoName}`;
      const body = isAvoidDrop
        ? `${ipoName} moved to AVOID due to negative market drag or undersubscription.`
        : `${ipoName} conviction score weakened from ${prevRadarCat} to ${radarScore.categoryLabel}.`;

      const notifDowngrade = await createDeduplicatedNotification(db, {
        type: 'RADAR_UPGRADE',
        ipo_id: ipo.id,
        title,
        body,
        dedupe_key: dedupeKey,
      });

      if (notifDowngrade) {
        generatedCount++;
        const nowIso = new Date().toISOString();
        await safeRunAsync(
          db,
          `INSERT INTO notification_tracker (ipo_id, last_notified_radar_category, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(ipo_id) DO UPDATE SET last_notified_radar_category=excluded.last_notified_radar_category, updated_at=excluded.updated_at`,
          [ipo.id, currentCategory, nowIso],
          'runNotificationEngine.updateRadarTrackerDowngrade'
        );
      }
    }
  }

  return generatedCount;
}

// Allotment Result Notification Trigger (Called by Allotment Checker)
export async function triggerAllotmentNotification(
  db: SQLiteDatabase,
  params: {
    applicationId: string;
    ipoId: string;
    ipoName: string;
    userName: string;
    allotmentStatus: string;
    allottedShares?: number;
  }
): Promise<NotificationRecord | null> {
  const statusUpper = params.allotmentStatus.toUpperCase();

  // Safety check: Never generate notification on technical errors!
  if (!['ALLOTTED', 'PARTIALLY_ALLOTTED', 'NOT_ALLOTTED'].includes(statusUpper)) {
    return null;
  }

  let type: NotificationType = 'NOT_ALLOTTED';
  let title = 'Allotment Result';
  let body = '';

  if (statusUpper === 'ALLOTTED') {
    type = 'ALLOTTED';
    title = '🎉 Allotment Confirmed!';
    body = `Congratulations! ${params.userName} was allotted ${params.allottedShares || 'their'} shares for ${params.ipoName}.`;
  } else if (statusUpper === 'PARTIALLY_ALLOTTED') {
    type = 'PARTIALLY_ALLOTTED';
    title = 'Partially Allotted';
    body = `${params.userName} was partially allotted ${params.allottedShares || 'some'} shares for ${params.ipoName}.`;
  } else {
    type = 'NOT_ALLOTTED';
    title = 'No Allotment';
    body = `${params.ipoName} — No allotment received for ${params.userName}.`;
  }

  const dedupeKey = `allotment_${params.applicationId}_${statusUpper}`;

  return await createDeduplicatedNotification(db, {
    type,
    ipo_id: params.ipoId,
    application_id: params.applicationId,
    title,
    body,
    dedupe_key: dedupeKey,
  });
}
