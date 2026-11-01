import type { SQLiteDatabase } from 'expo-sqlite';
import { IPOMasterRecord } from '@/services/ipo/types';
import { evaluateIPORadarScore } from '@/services/ipo/radarScoringEngine';
import { safeRunAsync, safeGetFirstAsync, safeGetAllAsync } from '@/utils/sqliteDebug';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { concurrencyTelemetry } from '@/utils/concurrencyTelemetry';
import { ApiClient } from '@/services/api/ApiClient';
import { ENDPOINTS } from '@/services/api/Endpoints';
import { getAuthHeaders } from '@/services/api/authHeaders';

function generateUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Crypto = require('expo-crypto');
    return Crypto.randomUUID();
  } catch {
    return 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  }
}

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

// ── Native Module Accessor & Test Mock Injection ─────────────────────────────
let mockNotificationsModule: any = null;

export function __setMockNotificationsModule(mock: any) {
  mockNotificationsModule = mock;
  channelsConfigured = false;
}

export function getNotificationsModule(): any {
  if (mockNotificationsModule) return mockNotificationsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications');
  } catch {
    return null;
  }
}

let mockPlatform: string | null = null;
export function __setPlatformForTest(platform: string | null) {
  mockPlatform = platform;
}

function getPlatform(): string {
  if (mockPlatform) return mockPlatform;
  return 'android';
}

// ── Notification Channel Configuration (Android 8.0+ / API 26+) ───────────────
export const DEFAULT_NOTIFICATION_CHANNEL_ID = 'ipovault-alerts';

let channelsConfigured = false;

export function __resetChannelsConfiguredForTest(): void {
  channelsConfigured = false;
}

export async function setupNotificationChannels(): Promise<boolean> {
  const rnPlatform = getPlatform();
  if (rnPlatform !== 'android') return true;
  if (channelsConfigured) return true;

  try {
    const Notifications = getNotificationsModule();
    if (Notifications && typeof Notifications.setNotificationChannelAsync === 'function') {
      await Notifications.setNotificationChannelAsync(DEFAULT_NOTIFICATION_CHANNEL_ID, {
        name: 'IPOVault Alerts',
        description: 'Alerts for new IPOs, opening/closing dates, allotment results, and GMP updates.',
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });
      channelsConfigured = true;
      return true;
    }
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] Channel setup error:', err);
  }
  return false;
}

// ── Permission Management (Android 13+ / iOS) ─────────────────────────────────
export const NOTIFICATION_PROMPTED_STORAGE_KEY = '@ipovault_has_prompted_notification_permission';

export async function getNotificationPermissionStatus(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}> {
  try {
    const Notifications = getNotificationsModule();
    if (Notifications && typeof Notifications.getPermissionsAsync === 'function') {
      const perms = await Notifications.getPermissionsAsync();
      const isGranted = !!(perms.granted || perms.status === 'granted');
      return {
        granted: isGranted,
        canAskAgain: perms.canAskAgain ?? true,
        status: perms.status ?? (isGranted ? 'granted' : 'denied'),
      };
    }
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] getPermissionsAsync error:', err);
  }
  return { granted: false, canAskAgain: true, status: 'undetermined' };
}

export async function requestNotificationPermission(userInitiated = false): Promise<boolean> {
  try {
    const Notifications = getNotificationsModule();
    if (!Notifications || typeof Notifications.requestPermissionsAsync !== 'function') {
      return false;
    }

    // Check existing permissions first
    const current = await getNotificationPermissionStatus();
    if (current.granted) {
      await setupNotificationChannels();
      return true;
    }

    // Avoid repeatedly prompting users unless explicitly triggered by a user action
    if (!userInitiated) {
      const alreadyPrompted = await safeAsyncStorage.getItem(NOTIFICATION_PROMPTED_STORAGE_KEY);
      if (alreadyPrompted === 'true') {
        return false;
      }
    }

    await safeAsyncStorage.setItem(NOTIFICATION_PROMPTED_STORAGE_KEY, 'true');

    const requested = await Notifications.requestPermissionsAsync();
    const isGranted = !!(requested.granted || requested.status === 'granted');
    if (isGranted) {
      await setupNotificationChannels();
      registerDevicePushTokenAsync().catch(() => {});
    }
    return isGranted;
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] requestPermissionsAsync error:', err);
    return false;
  }
}

// ── Notification Preferences Storage Keys ────────────────────────────────────
export const NOTIFICATION_PREF_KEYS = {
  IPO_UPDATES: '@ipovault_notif_ipo_updates',
  ALLOTMENT_RESULTS: '@ipovault_notif_allotment_results',
  PRICE_ALERTS: '@ipovault_notif_price_alerts',
  APP_UPDATES: '@ipovault_notif_app_updates',
  SOUND: '@ipovault_notif_sound',
} as const;

export interface NotificationPreferences {
  ipoUpdates: boolean;
  allotmentResults: boolean;
  priceAlerts: boolean;
  appUpdates: boolean;
  sound: boolean;
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const [ipo, allotment, price, app, sound] = await Promise.all([
      safeAsyncStorage.getItem(NOTIFICATION_PREF_KEYS.IPO_UPDATES),
      safeAsyncStorage.getItem(NOTIFICATION_PREF_KEYS.ALLOTMENT_RESULTS),
      safeAsyncStorage.getItem(NOTIFICATION_PREF_KEYS.PRICE_ALERTS),
      safeAsyncStorage.getItem(NOTIFICATION_PREF_KEYS.APP_UPDATES),
      safeAsyncStorage.getItem(NOTIFICATION_PREF_KEYS.SOUND),
    ]);
    return {
      ipoUpdates: ipo !== 'false',
      allotmentResults: allotment !== 'false',
      priceAlerts: price !== 'false',
      appUpdates: app !== 'false',
      sound: sound !== 'false',
    };
  } catch {
    return {
      ipoUpdates: true,
      allotmentResults: true,
      priceAlerts: true,
      appUpdates: true,
      sound: true,
    };
  }
}

export async function setNotificationPreference(
  key: keyof typeof NOTIFICATION_PREF_KEYS,
  value: boolean
): Promise<void> {
  try {
    await safeAsyncStorage.setItem(NOTIFICATION_PREF_KEYS[key], value ? 'true' : 'false');
    if (value) {
      // User explicitly turned on an alert type; request notification permissions if not yet granted
      await requestNotificationPermission(true);
    }
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] setNotificationPreference error:', err);
  }
}

// ── Local Notification Scheduling ─────────────────────────────────────────────
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
  trigger?: Date | number | null,
  identifier?: string
): Promise<string | null> {
  try {
    // 1. Check user notification category preferences
    if (data?.type) {
      const type = data.type as NotificationType;
      if (
        type === 'NEW_IPO' ||
        type === 'IPO_OPEN' ||
        type === 'IPO_CLOSING_SOON' ||
        type === 'IPO_CLOSING_TODAY'
      ) {
        const pref = await safeAsyncStorage.getItem(NOTIFICATION_PREF_KEYS.IPO_UPDATES);
        if (pref === 'false') return null;
      } else if (
        type === 'ALLOTTED' ||
        type === 'PARTIALLY_ALLOTTED' ||
        type === 'NOT_ALLOTTED'
      ) {
        const pref = await safeAsyncStorage.getItem(NOTIFICATION_PREF_KEYS.ALLOTMENT_RESULTS);
        if (pref === 'false') return null;
      } else if (type === 'GMP_CHANGE') {
        const pref = await safeAsyncStorage.getItem(NOTIFICATION_PREF_KEYS.PRICE_ALERTS);
        if (pref === 'false') return null;
      }
    }

    // 2. Check permission status
    const permStatus = await getNotificationPermissionStatus();
    if (!permStatus.granted) {
      if (__DEV__) console.log(`[Notifications] Skipped native notification "${title}" (permission not granted)`);
      return null;
    }

    const Notifications = getNotificationsModule();
    if (Notifications && typeof Notifications.scheduleNotificationAsync === 'function') {
      await setupNotificationChannels();

      const soundPref = await safeAsyncStorage.getItem(NOTIFICATION_PREF_KEYS.SOUND);
      const playSound = soundPref !== 'false';
      const rnPlatform = getPlatform();

      let triggerConfig: any = null;
      if (trigger) {
        const targetMs = trigger instanceof Date ? trigger.getTime() : typeof trigger === 'number' ? trigger : 0;
        if (targetMs > Date.now()) {
          triggerConfig = {
            type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
            date: targetMs,
            ...(rnPlatform === 'android' ? { channelId: DEFAULT_NOTIFICATION_CHANNEL_ID } : {}),
          };
        } else {
          // Trigger time has already elapsed; skip scheduling past notification
          return null;
        }
      }

      const requestPayload: any = {
        content: {
          title,
          body,
          data: data || {},
          sound: playSound ? 'default' : undefined,
          ...(rnPlatform === 'android' ? { channelId: DEFAULT_NOTIFICATION_CHANNEL_ID } : {}),
        },
        trigger: triggerConfig,
      };

      if (identifier) {
        requestPayload.identifier = identifier;
      }

      const notificationId = await Notifications.scheduleNotificationAsync(requestPayload);

      return notificationId;
    }
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] scheduleLocalNotification error:', err);
  }
  return null;
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
    trigger?: Date | number | null;
    skipNativeAlert?: boolean;
    identifier?: string;
  },
  existingDedupeKeys?: Set<string>
): Promise<NotificationRecord | null> {
  if (existingDedupeKeys) {
    if (existingDedupeKeys.has(params.dedupe_key)) {
      return null; // Already generated! Instant $O(1)$ memory check
    }
  } else {
    const existing = await safeGetFirstAsync<NotificationRecord>(
      db,
      'SELECT * FROM notifications WHERE dedupe_key = ?',
      [params.dedupe_key],
      'createDeduplicatedNotification.check'
    );

    if (existing) {
      return null; // Already generated! Prevents duplicates from repeated syncs
    }
  }

  const id = generateUUID();
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

  if (existingDedupeKeys) {
    existingDedupeKeys.add(params.dedupe_key);
  }

  // Trigger local device alert unless explicitly skipped (e.g. pre-scheduled native alarm)
  if (!params.skipNativeAlert) {
    await scheduleLocalNotification(
      params.title,
      params.body,
      { ipoId: params.ipo_id, type: params.type },
      params.trigger,
      params.identifier
    );
  }

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

/**
 * Automatically purges legacy or stale NEW_IPO notifications for IPOs that are already closed or listed.
 */
export async function purgeStaleNotifications(db: SQLiteDatabase): Promise<number> {
  if (!db) return 0;
  try {
    const res = await safeRunAsync(
      db,
      `DELETE FROM notifications
       WHERE type = 'NEW_IPO'
         AND ipo_id IN (
           SELECT id FROM ipo_master
           WHERE UPPER(COALESCE(lifecycle_status, status, '')) IN ('CLOSED', 'LISTED', 'ALLOTTED', 'ALLOTMENT_OUT', 'ALLOTMENT_COMPLETED')
              OR (close_date IS NOT NULL AND close_date < date('now', '-3 days'))
              OR (listing_date IS NOT NULL AND listing_date <= date('now'))
         )`,
      [],
      'purgeStaleNotifications'
    );
    return res?.changes || 0;
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] purgeStaleNotifications error:', err);
    return 0;
  }
}

/**
 * Schedules upcoming lifecycle milestone notifications in advance with the native OS.
 * Deterministically schedules:
 * - IPO Open (10:00 AM IST on open_date)
 * - IPO Closing Soon (10:00 AM IST 1 day before close_date)
 * - IPO Closing Today (09:30 AM IST on close_date)
 * - Allotment Expected (11:00 AM IST on allotment_date)
 * - Listing Today (09:45 AM IST on listing_date)
 */
export async function scheduleAdvanceIPONotifications(
  db: SQLiteDatabase,
  ipos: Array<{
    id?: string;
    ipo_name?: string;
    company_name?: string;
    open_date?: string | null;
    close_date?: string | null;
    allotment_date?: string | null;
    listing_date?: string | null;
  }>,
  existingDedupeKeys?: Set<string>
): Promise<number> {
  if (!ipos || ipos.length === 0) return 0;

  const permStatus = await getNotificationPermissionStatus();
  if (!permStatus.granted) {
    return 0;
  }

  let keysSet = existingDedupeKeys;
  let storedScheduledKeys: string[] = [];
  if (!keysSet) {
    try {
      const raw = await safeAsyncStorage.getItem(SCHEDULED_KEYS_STORAGE_KEY);
      if (raw) storedScheduledKeys = JSON.parse(raw);
    } catch {}
    keysSet = new Set(storedScheduledKeys);
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const newlyScheduledKeys: string[] = [];
  let scheduledCount = 0;

  for (const ipo of ipos) {
    if (!ipo || !ipo.id) continue;
    const ipoName = ipo.company_name || ipo.ipo_name || 'IPO';

    // 1. Advance schedule for IPO OPEN (10:00 AM IST on open_date)
    if (ipo.open_date && ipo.open_date > todayStr) {
      const openSchedDedupe = `sched_open_${ipo.id}_${ipo.open_date}`;
      if (!keysSet.has(openSchedDedupe)) {
        const targetOpenDate = new Date(`${ipo.open_date}T10:00:00+05:30`);
        if (targetOpenDate.getTime() > Date.now()) {
          const schedId = await scheduleLocalNotification(
            'IPO Open for Bidding',
            `${ipoName} is now open for subscription.`,
            { ipoId: ipo.id, type: 'IPO_OPEN' },
            targetOpenDate,
            openSchedDedupe
          );
          if (schedId) {
            keysSet.add(openSchedDedupe);
            newlyScheduledKeys.push(openSchedDedupe);
            scheduledCount++;
          }
        }
      }
    }

    // 2. Advance schedule for IPO CLOSING SOON (10:00 AM IST on day before close_date)
    if (ipo.close_date && ipo.close_date > tomorrowStr) {
      const closeSoonSchedDedupe = `sched_close_soon_${ipo.id}_${ipo.close_date}`;
      if (!keysSet.has(closeSoonSchedDedupe)) {
        const closeDateObj = new Date(`${ipo.close_date}T10:00:00+05:30`);
        const oneDayBefore = new Date(closeDateObj.getTime() - 24 * 60 * 60 * 1000);
        if (oneDayBefore.getTime() > Date.now()) {
          const schedId = await scheduleLocalNotification(
            'IPO Closing Soon',
            `${ipoName} closes tomorrow. Make sure to place your bids.`,
            { ipoId: ipo.id, type: 'IPO_CLOSING_SOON' },
            oneDayBefore,
            closeSoonSchedDedupe
          );
          if (schedId) {
            keysSet.add(closeSoonSchedDedupe);
            newlyScheduledKeys.push(closeSoonSchedDedupe);
            scheduledCount++;
          }
        }
      }
    }

    // 3. Advance schedule for IPO CLOSING TODAY (09:30 AM IST on close_date)
    if (ipo.close_date && ipo.close_date > todayStr) {
      const closeTodaySchedDedupe = `sched_close_today_${ipo.id}_${ipo.close_date}`;
      if (!keysSet.has(closeTodaySchedDedupe)) {
        const targetCloseDate = new Date(`${ipo.close_date}T09:30:00+05:30`);
        if (targetCloseDate.getTime() > Date.now()) {
          const schedId = await scheduleLocalNotification(
            'Final Day to Apply',
            `${ipoName} closes today for subscription.`,
            { ipoId: ipo.id, type: 'IPO_CLOSING_TODAY' },
            targetCloseDate,
            closeTodaySchedDedupe
          );
          if (schedId) {
            keysSet.add(closeTodaySchedDedupe);
            newlyScheduledKeys.push(closeTodaySchedDedupe);
            scheduledCount++;
          }
        }
      }
    }

    // 4. Advance schedule for ALLOTMENT EXPECTED (11:00 AM IST on allotment_date)
    if (ipo.allotment_date && ipo.allotment_date > todayStr) {
      const allotmentSchedDedupe = `sched_allotment_${ipo.id}_${ipo.allotment_date}`;
      if (!keysSet.has(allotmentSchedDedupe)) {
        const targetAllotmentDate = new Date(`${ipo.allotment_date}T11:00:00+05:30`);
        if (targetAllotmentDate.getTime() > Date.now()) {
          const schedId = await scheduleLocalNotification(
            'IPO Allotment Expected',
            `${ipoName} allotment status is expected today.`,
            { ipoId: ipo.id, type: 'ALLOTTED' },
            targetAllotmentDate,
            allotmentSchedDedupe
          );
          if (schedId) {
            keysSet.add(allotmentSchedDedupe);
            newlyScheduledKeys.push(allotmentSchedDedupe);
            scheduledCount++;
          }
        }
      }
    }

    // 5. Advance schedule for LISTING DATE (09:45 AM IST on listing_date)
    if (ipo.listing_date && ipo.listing_date > todayStr) {
      const listingSchedDedupe = `sched_listing_${ipo.id}_${ipo.listing_date}`;
      if (!keysSet.has(listingSchedDedupe)) {
        const targetListingDate = new Date(`${ipo.listing_date}T09:45:00+05:30`);
        if (targetListingDate.getTime() > Date.now()) {
          const schedId = await scheduleLocalNotification(
            'IPO Listing Today',
            `${ipoName} lists on exchanges today. Check opening performance.`,
            { ipoId: ipo.id, type: 'NEW_IPO' },
            targetListingDate,
            listingSchedDedupe
          );
          if (schedId) {
            keysSet.add(listingSchedDedupe);
            newlyScheduledKeys.push(listingSchedDedupe);
            scheduledCount++;
          }
        }
      }
    }
  }

  if (newlyScheduledKeys.length > 0) {
    try {
      const updatedKeys = Array.from(new Set([...storedScheduledKeys, ...newlyScheduledKeys]))
        .filter((k) => {
          const m = k.match(/(\d{4}-\d{2}-\d{2})$/);
          return m ? m[1] >= todayStr : true;
        })
        .slice(-300);
      await safeAsyncStorage.setItem(SCHEDULED_KEYS_STORAGE_KEY, JSON.stringify(updatedKeys));
    } catch {}
  }

  return scheduledCount;
}

/**
 * Cancels all scheduled OS notifications associated with a specific IPO (e.g. on deletion or date extension).
 */
export async function cancelIPONotifications(ipoId: string): Promise<void> {
  if (!ipoId) return;
  try {
    const Notifications = getNotificationsModule();
    if (Notifications) {
      if (typeof Notifications.getAllScheduledNotificationsAsync === 'function' &&
          typeof Notifications.cancelScheduledNotificationAsync === 'function') {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        for (const item of scheduled || []) {
          const id = item.identifier;
          const dataIpoId = (item as any)?.content?.data?.ipoId;
          const dedupeKey = (item as any)?.content?.data?.dedupeKey;
          const matches =
            (id && id.includes(`_${ipoId}_`)) ||
            dataIpoId === ipoId ||
            (typeof dedupeKey === 'string' && dedupeKey.includes(`_${ipoId}_`));
          if (matches && id) {
            await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
          }
        }
      }
    }

    const raw = await safeAsyncStorage.getItem(SCHEDULED_KEYS_STORAGE_KEY);
    if (raw) {
      const keys: string[] = JSON.parse(raw);
      const filtered = keys.filter((k) => !k.includes(`_${ipoId}_`));
      await safeAsyncStorage.setItem(SCHEDULED_KEYS_STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] cancelIPONotifications error:', err);
  }
}

/**
 * Reconciles the OS scheduled notification queue against current SQLite database state.
 * Reschedules missing future notifications after device restart, app update, or permission grant.
 */
export async function reconcileScheduledNotifications(db: SQLiteDatabase): Promise<number> {
  if (!db) return 0;
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const [upcomingListings, upcomingMaster] = await Promise.all([
      safeGetAllAsync<{
        id: string;
        ipo_name: string;
        company_name?: string;
        open_date: string;
        close_date: string;
        allotment_date?: string;
        listing_date?: string;
      }>(
        db,
        `SELECT id, ipo_name, company_name, open_date, close_date, allotment_date, listing_date
         FROM ipo_listings
         WHERE deleted_at IS NULL AND archived = 0
           AND (close_date >= ? OR open_date >= ? OR listing_date >= ?)`,
        [todayStr, todayStr, todayStr],
        'reconcileScheduledNotifications.listings'
      ),
      safeGetAllAsync<{
        id: string;
        ipo_name: string;
        company_name?: string;
        open_date: string;
        close_date: string;
        allotment_date?: string;
        listing_date?: string;
      }>(
        db,
        `SELECT id, ipo_name, company_name, open_date, close_date, allotment_date, listing_date
         FROM ipo_master
         WHERE deleted_at IS NULL
           AND (close_date >= ? OR open_date >= ? OR listing_date >= ?)`,
        [todayStr, todayStr, todayStr],
        'reconcileScheduledNotifications.master'
      ),
    ]);

    const mergedMap = new Map<string, any>();
    for (const item of upcomingMaster || []) {
      if (item && item.id) mergedMap.set(item.id, item);
    }
    for (const item of upcomingListings || []) {
      if (item && item.id) mergedMap.set(item.id, item);
    }

    const mergedList = Array.from(mergedMap.values());
    if (mergedList.length === 0) return 0;

    const Notifications = getNotificationsModule();
    if (Notifications && typeof Notifications.getAllScheduledNotificationsAsync === 'function') {
      try {
        const osScheduled = await Notifications.getAllScheduledNotificationsAsync();
        const activeIdentifiers = new Set(
          (osScheduled || []).map((s: any) => s.identifier).filter(Boolean)
        );
        let storedScheduledKeys: string[] = [];
        const raw = await safeAsyncStorage.getItem(SCHEDULED_KEYS_STORAGE_KEY);
        if (raw) storedScheduledKeys = JSON.parse(raw);

        const reconciledKeys = storedScheduledKeys.filter((k) => activeIdentifiers.has(k));
        await safeAsyncStorage.setItem(SCHEDULED_KEYS_STORAGE_KEY, JSON.stringify(reconciledKeys));
      } catch {}
    }

    return await scheduleAdvanceIPONotifications(db, mergedList);
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] reconcileScheduledNotifications error:', err);
    return 0;
  }
}

// Main Notification Engine Runner (Called after Automatic Background Sync)
export async function runNotificationEngine(
  db: SQLiteDatabase,
  syncedIPOs: IPOMasterRecord[]
): Promise<number> {
  if (!syncedIPOs || syncedIPOs.length === 0) return 0;

  const probe = concurrencyTelemetry.startExecuting('NOTIFICATION_RUN', 'notificationEngine.run');
  try {
    // Auto-purge stale notifications for IPOs already listed or closed in the past
    await purgeStaleNotifications(db);

  // Pre-load all existing notification dedupe keys in ONE single query (avoids 100+ separate checks)
  const existingNotifRows = await safeGetAllAsync<{ dedupe_key: string }>(
    db,
    'SELECT dedupe_key FROM notifications',
    [],
    'runNotificationEngine.preloadDedupeKeys'
  );
  const existingDedupeKeys = new Set((existingNotifRows || []).map((r) => r.dedupe_key));

  // Load persisted scheduled notification dedupe keys
  let storedScheduledKeys: string[] = [];
  try {
    const raw = await safeAsyncStorage.getItem(SCHEDULED_KEYS_STORAGE_KEY);
    if (raw) storedScheduledKeys = JSON.parse(raw);
  } catch {}
  for (const k of storedScheduledKeys) {
    existingDedupeKeys.add(k);
  }
  const newlyScheduledKeys: string[] = [];

  // Pre-load all existing tracker records in ONE single query (avoids 80+ separate queries in the loop)
  const trackerRows = await safeGetAllAsync<{
    ipo_id: string;
    last_notified_gmp: number | null;
    last_notified_radar_category: string | null;
  }>(
    db,
    'SELECT ipo_id, last_notified_gmp, last_notified_radar_category FROM notification_tracker',
    [],
    'runNotificationEngine.preloadTrackers'
  );
  const trackerMap = new Map<string, {
    ipo_id: string;
    last_notified_gmp: number | null;
    last_notified_radar_category: string | null;
  }>();
  for (const tr of trackerRows || []) {
    trackerMap.set(tr.ipo_id, tr);
  }

  let generatedCount = 0;
  const todayStr = new Date().toISOString().split('T')[0];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Check notification permission once before evaluating 80+ IPOs
  const permStatus = await getNotificationPermissionStatus();
  const hasPermission = permStatus.granted;

  for (let i = 0; i < syncedIPOs.length; i++) {
    const ipo = syncedIPOs[i];
    if (!ipo || !ipo.id) continue;

    // Cooperative yield every 10 items to prevent starving user interaction / UI threads
    if (i > 0 && i % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const ipoName = ipo.company_name || ipo.ipo_name || 'IPO';

    // 1. EVENT: NEW IPO PUBLISHED
    // Strictly verify eligibility: Must be ACTIVE/UPCOMING and NOT listed/closed months ago!
    const rawStatus = (ipo.lifecycle_status || ipo.status || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    const isPastStatus = [
      'CLOSED',
      'ALLOTTED',
      'ALLOTMENT_OUT',
      'ALLOTMENT_COMPLETED',
      'ALLOTMENT_PENDING',
      'ALLOTTED_PENDING',
      'ALLOTTED_AVAILABLE',
      'LISTED',
      'EXPIRED',
      'WITHDRAWN',
      'CANCELLED',
      'ARCHIVED',
      'DRAFT',
    ].includes(rawStatus);

    const isListingPast = ipo.listing_date ? ipo.listing_date <= todayStr : false;
    const isClosePast = ipo.close_date ? ipo.close_date < todayStr : false;

    // Verify it didn't open months ago
    let isRecentlyOpenedOrUpcoming = true;
    if (ipo.open_date) {
      const openDateMs = new Date(ipo.open_date).getTime();
      const todayMs = new Date(todayStr).getTime();
      const diffDays = (todayMs - openDateMs) / (1000 * 60 * 60 * 24);
      if (diffDays > 5) {
        isRecentlyOpenedOrUpcoming = false;
      }
    }

    const isEligibleNewIpo = !isPastStatus && !isListingPast && !isClosePast && isRecentlyOpenedOrUpcoming;

    if (isEligibleNewIpo) {
      const newIpoDedupe = `new_ipo_${ipo.id}`;
      const notifNew = await createDeduplicatedNotification(db, {
        type: 'NEW_IPO',
        ipo_id: ipo.id,
        title: 'New IPO Available',
        body: `${ipoName} is now available for bidding on IPOVault.`,
        dedupe_key: newIpoDedupe,
      }, existingDedupeKeys);
      if (notifNew) generatedCount++;
    }

    // 2. EVENT: IPO OPENING
    if (ipo.open_date === todayStr) {
      const openSchedDedupe = `sched_open_${ipo.id}_${todayStr}`;
      const openDedupe = `ipo_open_${ipo.id}_${todayStr}`;
      const wasPreScheduled = existingDedupeKeys.has(openSchedDedupe);

      const notifOpen = await createDeduplicatedNotification(
        db,
        {
          type: 'IPO_OPEN',
          ipo_id: ipo.id,
          title: 'IPO Open for Bidding',
          body: `${ipoName} is now open for subscription.`,
          dedupe_key: openDedupe,
          skipNativeAlert: wasPreScheduled,
        },
        existingDedupeKeys
      );
      if (notifOpen) generatedCount++;
    } else if (hasPermission && ipo.open_date && ipo.open_date > todayStr) {
      // Advance native OS schedule for 10:00 AM IST on open_date (deduplicated)
      const openSchedDedupe = `sched_open_${ipo.id}_${ipo.open_date}`;
      if (!existingDedupeKeys.has(openSchedDedupe)) {
        const targetOpenDate = new Date(`${ipo.open_date}T10:00:00+05:30`);
        if (targetOpenDate.getTime() > Date.now()) {
          const schedId = await scheduleLocalNotification(
            'IPO Open for Bidding',
            `${ipoName} is now open for subscription.`,
            { ipoId: ipo.id, type: 'IPO_OPEN' },
            targetOpenDate,
            openSchedDedupe
          );
          if (schedId) {
            existingDedupeKeys.add(openSchedDedupe);
            newlyScheduledKeys.push(openSchedDedupe);
          }
        }
      }
    }

    // 3. EVENT: IPO CLOSING SOON (1 Day Before)
    if (ipo.close_date === tomorrowStr) {
      const closeSoonSchedDedupe = `sched_close_soon_${ipo.id}_${ipo.close_date}`;
      const closeSoonDedupe = `ipo_closing_soon_${ipo.id}_${tomorrowStr}`;
      const wasPreScheduled = existingDedupeKeys.has(closeSoonSchedDedupe);

      const notifCloseSoon = await createDeduplicatedNotification(
        db,
        {
          type: 'IPO_CLOSING_SOON',
          ipo_id: ipo.id,
          title: 'IPO Closing Soon',
          body: `${ipoName} closes tomorrow. Make sure to place your bids.`,
          dedupe_key: closeSoonDedupe,
          skipNativeAlert: wasPreScheduled,
        },
        existingDedupeKeys
      );
      if (notifCloseSoon) generatedCount++;
    } else if (hasPermission && ipo.close_date && ipo.close_date > tomorrowStr) {
      // Advance native OS schedule for 10:00 AM IST on day before close_date (deduplicated)
      const closeSoonSchedDedupe = `sched_close_soon_${ipo.id}_${ipo.close_date}`;
      if (!existingDedupeKeys.has(closeSoonSchedDedupe)) {
        const closeDateObj = new Date(`${ipo.close_date}T10:00:00+05:30`);
        const oneDayBefore = new Date(closeDateObj.getTime() - 24 * 60 * 60 * 1000);
        if (oneDayBefore.getTime() > Date.now()) {
          const schedId = await scheduleLocalNotification(
            'IPO Closing Soon',
            `${ipoName} closes tomorrow. Make sure to place your bids.`,
            { ipoId: ipo.id, type: 'IPO_CLOSING_SOON' },
            oneDayBefore,
            closeSoonSchedDedupe
          );
          if (schedId) {
            existingDedupeKeys.add(closeSoonSchedDedupe);
            newlyScheduledKeys.push(closeSoonSchedDedupe);
          }
        }
      }
    }

    // 4. EVENT: IPO CLOSING TODAY
    if (ipo.close_date === todayStr) {
      const closeTodaySchedDedupe = `sched_close_today_${ipo.id}_${ipo.close_date}`;
      const closeTodayDedupe = `ipo_closing_today_${ipo.id}_${todayStr}`;
      const wasPreScheduled = existingDedupeKeys.has(closeTodaySchedDedupe);

      const notifCloseToday = await createDeduplicatedNotification(
        db,
        {
          type: 'IPO_CLOSING_TODAY',
          ipo_id: ipo.id,
          title: 'Final Day to Apply',
          body: `${ipoName} closes today for subscription.`,
          dedupe_key: closeTodayDedupe,
          skipNativeAlert: wasPreScheduled,
        },
        existingDedupeKeys
      );
      if (notifCloseToday) generatedCount++;
    } else if (hasPermission && ipo.close_date && ipo.close_date > todayStr) {
      // Advance native OS schedule for 09:30 AM IST on close_date (deduplicated)
      const closeTodaySchedDedupe = `sched_close_today_${ipo.id}_${ipo.close_date}`;
      if (!existingDedupeKeys.has(closeTodaySchedDedupe)) {
        const targetCloseDate = new Date(`${ipo.close_date}T09:30:00+05:30`);
        if (targetCloseDate.getTime() > Date.now()) {
          const schedId = await scheduleLocalNotification(
            'Final Day to Apply',
            `${ipoName} closes today for subscription.`,
            { ipoId: ipo.id, type: 'IPO_CLOSING_TODAY' },
            targetCloseDate,
            closeTodaySchedDedupe
          );
          if (schedId) {
            existingDedupeKeys.add(closeTodaySchedDedupe);
            newlyScheduledKeys.push(closeTodaySchedDedupe);
          }
        }
      }
    }

    // Tracker in-memory lookup for GMP & Radar comparison
    const trackerRow = trackerMap.get(ipo.id);
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
        }, existingDedupeKeys);

        if (notifGmp) {
          generatedCount++;
          const nowIso = new Date().toISOString();
          trackerMap.set(ipo.id, {
            ipo_id: ipo.id,
            last_notified_gmp: currentGmp,
            last_notified_radar_category: prevRadarCat,
          });
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
      }, existingDedupeKeys);

      if (notifRadar) {
        generatedCount++;
        const nowIso = new Date().toISOString();
        trackerMap.set(ipo.id, {
          ipo_id: ipo.id,
          last_notified_gmp: prevGmp,
          last_notified_radar_category: currentCategory,
        });
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
      }, existingDedupeKeys);

      if (notifDowngrade) {
        generatedCount++;
        const nowIso = new Date().toISOString();
        trackerMap.set(ipo.id, {
          ipo_id: ipo.id,
          last_notified_gmp: prevGmp,
          last_notified_radar_category: currentCategory,
        });
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

    // 7. EVENT: IPO ALLOTMENT OUT & ALLOTMENT RECEIVED FOR MANAGED ACCOUNTS
    const statusUpper = (ipo.status || ipo.lifecycle_status || '').toUpperCase();
    const isAllotmentOut =
      statusUpper === 'ALLOTMENT_COMPLETED' ||
      statusUpper === 'ALLOTMENT_OUT' ||
      statusUpper === 'ALLOTMENT OUT';

    if (isAllotmentOut) {
      const localApps = await safeGetAllAsync<{
        id: string;
        user_id: string;
        user_name?: string;
        status?: string;
        allotment_status?: string;
        allotted_shares?: number;
        allotted_lots?: number;
      }>(
        db,
        `SELECT a.id, a.user_id, u.name as user_name, a.status,
                alt.allotment_status, alt.allotted_shares, alt.allotted_lots
         FROM ipo_applications a
         JOIN users_table u ON a.user_id = u.id
         LEFT JOIN ipo_allotments alt ON a.id = alt.application_id
         WHERE a.ipo_id = ? OR a.ipo_id IN (SELECT id FROM ipo_listings WHERE backend_ipo_id = ?)`,
        [ipo.id, ipo.id],
        'runNotificationEngine.checkAllotmentApplications'
      );

      if (localApps && localApps.length > 0) {
        // 7a. Generic Allotment Out notification (primary user device only)
        const allotmentOutDedupe = `ipo_allotment_out_${ipo.id}`;
        const notifAllotmentOut = await createDeduplicatedNotification(db, {
          type: 'ALLOTTED',
          ipo_id: ipo.id,
          title: 'IPO Allotment Out',
          body: `${ipoName} allotment is now available. Check your allotment status.`,
          dedupe_key: allotmentOutDedupe,
        }, existingDedupeKeys);
        if (notifAllotmentOut) generatedCount++;

        // 7b. Check if one or more managed accounts received allotment
        const allottedApps = localApps.filter((app) => {
          const altStatus = (app.allotment_status || '').toUpperCase();
          const appStatus = (app.status || '').toLowerCase();
          return (
            altStatus === 'ALLOTTED' ||
            altStatus === 'PARTIALLY_ALLOTTED' ||
            appStatus === 'allotted' ||
            appStatus === 'partially allotted'
          );
        });

        if (allottedApps.length > 0) {
          const allottedDedupe = `ipo_allotment_received_${ipo.id}`;
          const notifAllotted = await createDeduplicatedNotification(db, {
            type: 'ALLOTTED',
            ipo_id: ipo.id,
            title: '🎉 Allotment Confirmed!',
            body: `Congratulations! Allotment received for ${ipoName} across your managed account(s).`,
            dedupe_key: allottedDedupe,
          }, existingDedupeKeys);
          if (notifAllotted) generatedCount++;
        }
      }
    }
  }

  // Advance schedule all future calendar milestones for all synced IPOs (open, close soon, close today, allotment, listing)
  await scheduleAdvanceIPONotifications(db, syncedIPOs, existingDedupeKeys);

    if (newlyScheduledKeys.length > 0) {
      try {
        const updatedKeys = Array.from(new Set([...storedScheduledKeys, ...newlyScheduledKeys]))
          .filter((k) => {
            const m = k.match(/(\d{4}-\d{2}-\d{2})$/);
            return m ? m[1] >= todayStr : true;
          })
          .slice(-200);
        await safeAsyncStorage.setItem(SCHEDULED_KEYS_STORAGE_KEY, JSON.stringify(updatedKeys));
      } catch {}
    }

    probe.finish();
    return generatedCount;
  } catch (err) {
    probe.finish(err);
    throw err;
  } finally {
    probe.finish();
  }
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

/**
 * Configures foreground notification presentation options.
 */
export function setupNotificationPresentation() {
  try {
    const Notifications = getNotificationsModule();
    if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] setNotificationHandler error:', err);
  }
}

export const SCHEDULED_KEYS_STORAGE_KEY = '@ipovault_scheduled_dedupe_keys';
export const PUSH_TOKEN_CACHE_KEY_PREFIX = '@ipovault_registered_push_token_';

/**
 * Registers the device push token with the IPOVault backend.
 * - Guards against web, test environments, and non-granted permissions
 * - Requests Expo push token using configured EAS project ID
 * - Caches registered token to avoid redundant network registrations
 * - Transmits to backend POST /api/v1/notifications/push-token with Bearer auth
 * - Gracefully handles failures without throwing
 */
export async function registerDevicePushTokenAsync(
  userId?: string,
  forceRefresh = false
): Promise<string | null> {
  try {
    const rnPlatform = getPlatform();
    if (rnPlatform === 'web') return null;

    // Check permission status
    const permStatus = await getNotificationPermissionStatus();
    if (!permStatus.granted) {
      if (__DEV__) console.log('[Notifications] Push token skipped (permission not granted)');
      return null;
    }

    const Notifications = getNotificationsModule();
    if (!Notifications || typeof Notifications.getExpoPushTokenAsync !== 'function') {
      return null;
    }

    const cacheKey = `${PUSH_TOKEN_CACHE_KEY_PREFIX}${userId || 'anonymous'}`;
    if (!forceRefresh) {
      const cached = await safeAsyncStorage.getItem(cacheKey);
      if (cached) {
        return cached; // Token already registered for this user session
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let projectId = 'cee9106f-87cd-4458-86d2-46d6341a959d';
    try {
      const Constants = require('expo-constants').default;
      projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId ||
        projectId;
    } catch {}

    let pushTokenData: any = null;
    try {
      pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    } catch (tokenErr) {
      if (__DEV__) console.warn('[Notifications] getExpoPushTokenAsync failed:', tokenErr);
      return null;
    }

    const token = typeof pushTokenData === 'string' ? pushTokenData : pushTokenData?.data || null;
    if (!token) return null;

    // Register with backend if user session is active
    const authHeaders = await getAuthHeaders();
    if (authHeaders.Authorization) {
      try {
        const apiClient = new ApiClient({
          baseUrl: process.env.EXPO_PUBLIC_BACKEND_URL || 'https://api.getipovault.in',
        });
        await apiClient.post(
          ENDPOINTS.PUSH_TOKEN,
          { token, platform: rnPlatform },
          authHeaders
        );
      } catch (apiErr) {
        if (__DEV__) console.warn('[Notifications] Push token backend registration error:', apiErr);
        // Do not cache token if backend transmission failed for authenticated user so it retries
        return token;
      }
    }

    await safeAsyncStorage.setItem(cacheKey, token);
    return token;
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] registerDevicePushTokenAsync error:', err);
    return null;
  }
}

/**
 * Attaches a listener for native Expo/FCM push token rotation events.
 * Automatically synchronizes updated token with backend.
 */
export function setupPushTokenRefreshListener(userId?: string) {
  try {
    const Notifications = getNotificationsModule();
    if (Notifications && typeof Notifications.addPushTokenListener === 'function') {
      const subscription = Notifications.addPushTokenListener((tokenData: any) => {
        const token = typeof tokenData === 'string' ? tokenData : tokenData?.data;
        if (token) {
          registerDevicePushTokenAsync(userId, true).catch(() => {});
        }
      });
      return subscription;
    }
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] setupPushTokenRefreshListener error:', err);
  }
  return null;
}

/**
 * Unregisters the device push token on logout / account switch.
 * - Deactivates the token mapping on the backend for this user
 * - Clears the local storage cache key
 */
export async function unregisterDevicePushTokenAsync(userId?: string): Promise<boolean> {
  try {
    const cacheKey = `${PUSH_TOKEN_CACHE_KEY_PREFIX}${userId || 'anonymous'}`;
    const token = await safeAsyncStorage.getItem(cacheKey);
    if (!token) return true;

    const authHeaders = await getAuthHeaders();
    if (authHeaders.Authorization) {
      const apiClient = new ApiClient({
        baseUrl: process.env.EXPO_PUBLIC_BACKEND_URL || 'https://api.getipovault.in',
      });
      await apiClient.delete(
        `${ENDPOINTS.PUSH_TOKEN}/${encodeURIComponent(token)}`,
        undefined,
        authHeaders
      );
    }

    await safeAsyncStorage.removeItem(cacheKey);
    return true;
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] unregisterDevicePushTokenAsync error:', err);
    return false;
  }
}

// ── Deep Linking & Notification Tap Routing ───────────────────────────────────

export interface NotificationRoutingTarget {
  pathname: string;
  params?: Record<string, any>;
}

/**
 * Resolves the destination route based on notification category and identifier availability.
 * - Allotment notifications → /allotment-checker (or /applications if missing ipoId)
 * - IPO-related notifications → /ipo-details (or /notifications if missing ipoId)
 * - General/unclassified notifications → /notifications safe fallback
 */
export function resolveNotificationRoute(data?: Record<string, any> | null): NotificationRoutingTarget {
  if (!data || typeof data !== 'object') {
    return { pathname: '/notifications' };
  }

  const rawType = typeof data.type === 'string' ? data.type.trim().toUpperCase() : '';
  const candidateId = data.ipoId || data.ipo_id || data.id;
  const rawIpoId = typeof candidateId === 'string' && candidateId.trim().length > 0 ? candidateId.trim() : null;
  const rawSymbol = typeof data.symbol === 'string' && data.symbol.trim().length > 0 ? data.symbol.trim() : undefined;

  const isAllotmentType =
    rawType === 'ALLOTTED' ||
    rawType === 'PARTIALLY_ALLOTTED' ||
    rawType === 'NOT_ALLOTTED';

  if (isAllotmentType) {
    if (rawIpoId) {
      return {
        pathname: '/allotment-checker',
        params: { ipoId: rawIpoId, ...(rawSymbol ? { symbol: rawSymbol } : {}) },
      };
    }
    return { pathname: '/applications' };
  }

  const isIpoType =
    rawType === 'NEW_IPO' ||
    rawType === 'IPO_OPEN' ||
    rawType === 'IPO_CLOSING_SOON' ||
    rawType === 'IPO_CLOSING_TODAY' ||
    rawType === 'GMP_CHANGE' ||
    rawType === 'RADAR_UPGRADE';

  if (isIpoType) {
    if (rawIpoId) {
      return {
        pathname: '/ipo-details',
        params: { id: rawIpoId },
      };
    }
    return { pathname: '/notifications' };
  }

  // Fallback if data has a valid IPO ID but no recognized type
  if (rawIpoId) {
    return {
      pathname: '/ipo-details',
      params: { id: rawIpoId },
    };
  }

  return { pathname: '/notifications' };
}

// ── Duplicate Response Tracking ───────────────────────────────────────────────
const processedResponseIds = new Set<string>();

export function isNotificationResponseProcessed(responseId: string): boolean {
  return processedResponseIds.has(responseId);
}

export function __resetProcessedNotificationResponsesForTest(): void {
  processedResponseIds.clear();
}

export function getNotificationResponseIdentifier(response: any): string | null {
  if (!response) return null;
  const reqId = response?.notification?.request?.identifier;
  if (typeof reqId === 'string' && reqId.trim()) {
    return reqId.trim();
  }
  const date = response?.notification?.date;
  if (date) {
    return `resp-date-${date}`;
  }
  const contentData = response?.notification?.request?.content?.data;
  if (contentData && typeof contentData === 'object') {
    try {
      return `resp-data-${JSON.stringify(contentData)}`;
    } catch {}
  }
  return null;
}

/**
 * Processes a single notification tap response (cold start or live listener).
 * Returns true if navigation was triggered, false if skipped/already processed.
 */
export async function handleNotificationResponse(response: any, router: any): Promise<boolean> {
  if (!response) return false;

  const responseId = getNotificationResponseIdentifier(response);
  if (responseId && processedResponseIds.has(responseId)) {
    if (__DEV__) {
      console.log(`[Notifications] Response already processed: ${responseId}`);
    }
    return false;
  }

  if (responseId) {
    processedResponseIds.add(responseId);
    if (processedResponseIds.size > 100) {
      const oldest = Array.from(processedResponseIds).slice(0, 50);
      for (const id of oldest) {
        processedResponseIds.delete(id);
      }
    }
  }

  const data = response?.notification?.request?.content?.data;
  const target = resolveNotificationRoute(data);

  if (router && typeof router.push === 'function') {
    try {
      router.push({
        pathname: target.pathname,
        ...(target.params ? { params: target.params } : {}),
      } as any);
      return true;
    } catch (err) {
      if (__DEV__) console.warn('[Notifications] Navigation error on response:', err);
    }
  }

  return false;
}

let coldStartChecked = false;

export function __resetColdStartForTest(): void {
  coldStartChecked = false;
}

/**
 * Handles cold-start notification response when the application is launched from a terminated state
 * via a notification tap. Guaranteed to run only once per app session.
 */
export async function handleColdStartNotificationResponse(router: any): Promise<boolean> {
  if (coldStartChecked) return false;
  coldStartChecked = true;

  try {
    const Notifications = getNotificationsModule();
    if (Notifications && typeof Notifications.getLastNotificationResponseAsync === 'function') {
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastResponse) {
        return await handleNotificationResponse(lastResponse, router);
      }
    }
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] Cold-start response error:', err);
  }
  return false;
}

/**
 * Attaches notification response listener for deep linking on tap.
 * Evaluates cold-start response on initial attach and manages runtime listener.
 */
export function setupNotificationResponseListener(router: any) {
  try {
    // 1. Process cold-start response if app was opened via notification tap
    handleColdStartNotificationResponse(router).catch(() => {});

    // 2. Attach runtime listener for foreground/background response taps
    const Notifications = getNotificationsModule();
    if (Notifications && typeof Notifications.addNotificationResponseReceivedListener === 'function') {
      const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
        handleNotificationResponse(response, router).catch(() => {});
      });
      return subscription;
    }
  } catch (err) {
    if (__DEV__) console.warn('[Notifications] setupNotificationResponseListener error:', err);
  }
  return null;
}

