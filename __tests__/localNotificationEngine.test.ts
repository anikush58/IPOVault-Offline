/**
 * Regression & Safety Test Suite for IPOVault Native Android Local Notifications
 *
 * Verifies:
 * 1. Android Notification Channel configuration (ipovault-alerts, High Importance)
 * 2. Runtime permission handling & user-facing prompt gating policy
 * 3. User category preference filtering (IPO updates, Allotments, Price alerts, Sound)
 * 4. Duplicate prevention via SQLite dedupe_key
 * 5. Graceful fallback when native modules are unavailable or permissions denied
 */

if (typeof (global as any).__DEV__ === 'undefined') {
  (global as any).__DEV__ = true;
}

import {
  DEFAULT_NOTIFICATION_CHANNEL_ID,
  NOTIFICATION_PREF_KEYS,
  NOTIFICATION_PROMPTED_STORAGE_KEY,
  setupNotificationChannels,
  getNotificationPermissionStatus,
  requestNotificationPermission,
  getNotificationPreferences,
  setNotificationPreference,
  scheduleLocalNotification,
  createDeduplicatedNotification,
  __setMockNotificationsModule,
  resolveNotificationRoute,
  handleNotificationResponse,
  handleColdStartNotificationResponse,
  setupNotificationResponseListener,
  __resetProcessedNotificationResponsesForTest,
  registerDevicePushTokenAsync,
  SCHEDULED_KEYS_STORAGE_KEY,
  PUSH_TOKEN_CACHE_KEY_PREFIX,
  unregisterDevicePushTokenAsync,
} from '../services/notifications/notificationEngine';
import { safeAsyncStorage } from '../utils/safeAsyncStorage';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

// In-memory mock storage for testing
const memoryStore = new Map<string, string>();
safeAsyncStorage.getItem = async (k: string) => memoryStore.get(k) ?? null;
safeAsyncStorage.setItem = async (k: string, v: string) => {
  memoryStore.set(k, v);
};
safeAsyncStorage.removeItem = async (k: string) => {
  memoryStore.delete(k);
};

// In-memory mock SQLite database
function createMockDb() {
  const records: any[] = [];
  return {
    records,
    getFirstAsync: async (query: string, params: any[]) => {
      if (query.includes('FROM notifications WHERE dedupe_key = ?')) {
        const dedupeKey = params[0];
        return records.find((r) => r.dedupe_key === dedupeKey) || null;
      }
      return null;
    },
    runAsync: async (query: string, params: any[]) => {
      if (query.includes('INSERT INTO notifications')) {
        const [id, type, ipo_id, application_id, title, body, created_at, delivered_at, dedupe_key] = params;
        records.push({
          id,
          type,
          ipo_id,
          application_id,
          title,
          body,
          created_at,
          read_at: null,
          delivered_at,
          dedupe_key,
        });
      }
    },
  } as any;
}

export async function runLocalNotificationEngineTestSuite() {
  console.log('====================================================');
  console.log('RUNNING LOCAL NOTIFICATION ENGINE REGRESSION TESTS');
  console.log('====================================================\n');

  // --- SECTION 1: Android Notification Channel Setup ---
  console.log('--- TEST 1: Android Notification Channel Setup ---');
  {
    let createdChannelId = '';
    let createdChannelConfig: any = null;

    const mockExpo = {
      AndroidImportance: { HIGH: 4, DEFAULT: 3 },
      setNotificationChannelAsync: async (channelId: string, config: any) => {
        createdChannelId = channelId;
        createdChannelConfig = config;
        return config;
      },
      getPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
      scheduleNotificationAsync: async () => 'test-notif-id-1',
    };

    __setMockNotificationsModule(mockExpo);

    const success = await setupNotificationChannels();
    assert(success === true, 'Channel Setup', 'setupNotificationChannels returned true');
    assert(
      createdChannelId === DEFAULT_NOTIFICATION_CHANNEL_ID,
      'Channel ID',
      `Channel ID is "${DEFAULT_NOTIFICATION_CHANNEL_ID}"`
    );
    assert(
      createdChannelConfig.importance === 4,
      'Channel Importance',
      'Channel importance is HIGH (4) for heads-up alert visibility'
    );
    assert(
      createdChannelConfig.name === 'IPOVault Alerts',
      'Channel Name',
      'Channel user-facing name is "IPOVault Alerts"'
    );
    assert(
      createdChannelConfig.enableVibrate === true && createdChannelConfig.sound === 'default',
      'Channel Sound & Vibrate',
      'Channel enables sound and vibration defaults'
    );
  }

  // --- SECTION 2: Permission Handling & Prompt Policy ---
  console.log('\n--- TEST 2: Permission Handling & Prompt Policy ---');
  {
    memoryStore.clear();

    let requestPermissionsCalled: boolean = false;
    let currentPerms: { granted: boolean; canAskAgain?: boolean; status?: string } = {
      granted: false,
      canAskAgain: true,
      status: 'undetermined',
    };

    const mockExpo = {
      AndroidImportance: { HIGH: 4 },
      getPermissionsAsync: async () => currentPerms,
      requestPermissionsAsync: async () => {
        requestPermissionsCalled = true;
        currentPerms = { granted: true, canAskAgain: true, status: 'granted' };
        return currentPerms;
      },
      setNotificationChannelAsync: async () => ({}),
      scheduleNotificationAsync: async () => 'notif-1',
    };
    __setMockNotificationsModule(mockExpo);

    // Initial status check
    const statusBefore = await getNotificationPermissionStatus();
    assert(!statusBefore.granted, 'Initial Perms', 'Reports ungranted permission correctly');

    // First background check should prompt if userInitiated is false and never prompted
    await requestNotificationPermission(false);
    assert(requestPermissionsCalled, 'First Prompt Allowed', 'Prompts on first attempt');
    assert(
      memoryStore.get(NOTIFICATION_PROMPTED_STORAGE_KEY) === 'true',
      'Prompt Flag Saved',
      'Saves prompt flag to prevent spamming on every launch'
    );

    // Reset granted to false to simulate user declined
    currentPerms = { granted: false, canAskAgain: true, status: 'denied' };
    requestPermissionsCalled = false;

    // Subsequent background check must be suppressed
    const secondBackgroundCheck: boolean = await requestNotificationPermission(false);
    assert(
      !secondBackgroundCheck && !requestPermissionsCalled,
      'Prompt Spam Prevention',
      'Does not prompt again automatically on next background app launch'
    );

    // User-initiated action (e.g. toggling settings or tapping Enable banner) MUST prompt
    await requestNotificationPermission(true);
    assert(
      requestPermissionsCalled,
      'User-Initiated Prompt',
      'Explicit user action prompts system permission regardless of storage flag'
    );
  }

  // --- SECTION 3: Notification Category Preference Gating ---
  console.log('\n--- TEST 3: Notification Category Preference Gating ---');
  {
    memoryStore.clear();

    let scheduledPayload: any = null;
    const mockExpo = {
      AndroidImportance: { HIGH: 4 },
      getPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
      setNotificationChannelAsync: async () => ({}),
      scheduleNotificationAsync: async (payload: any) => {
        scheduledPayload = payload;
        return 'scheduled-notif-id-100';
      },
    };
    __setMockNotificationsModule(mockExpo);

    // 3.1 All preferences enabled by default
    const defaultPrefs = await getNotificationPreferences();
    assert(
      defaultPrefs.ipoUpdates && defaultPrefs.allotmentResults && defaultPrefs.priceAlerts && defaultPrefs.sound,
      'Default Preferences',
      'All notification preferences enabled by default'
    );

    // 3.2 Schedule with all enabled
    scheduledPayload = null;
    const id1 = await scheduleLocalNotification('New IPO: Tata Tech', 'Issue opened today', {
      type: 'NEW_IPO',
      ipoId: 'ipo-tata-1',
    });
    assert(id1 === 'scheduled-notif-id-100', 'Scheduled Active', 'Schedules notification when preference is active');
    assert(
      scheduledPayload.content.channelId === DEFAULT_NOTIFICATION_CHANNEL_ID,
      'Android Channel Assigned',
      'Assigns default android channel id'
    );

    // 3.3 Disable IPO_UPDATES and verify suppression
    await setNotificationPreference('IPO_UPDATES', false);
    scheduledPayload = null;
    const id2 = await scheduleLocalNotification('New IPO: Swiggy', 'Issue opened today', {
      type: 'NEW_IPO',
      ipoId: 'ipo-swiggy-1',
    });
    assert(id2 === null && scheduledPayload === null, 'IPO Updates Suppressed', 'Suppresses IPO alerts when disabled');

    // 3.4 Verify Allotment notifications still work when only IPO_UPDATES is disabled
    scheduledPayload = null;
    const id3 = await scheduleLocalNotification('Allotment Out: Swiggy', 'Check allotment status', {
      type: 'ALLOTTED',
      ipoId: 'ipo-swiggy-1',
    });
    assert(id3 !== null && scheduledPayload !== null, 'Allotment Alert Delivered', 'Allotment alerts delivered');

    // 3.5 Disable Sound and verify sound: undefined
    await setNotificationPreference('SOUND', false);
    scheduledPayload = null;
    await scheduleLocalNotification('Allotment Out: NTPC', 'Status available', {
      type: 'ALLOTTED',
      ipoId: 'ipo-ntpc-1',
    });
    assert(
      scheduledPayload.content.sound === undefined,
      'Sound Suppressed',
      'Sound set to undefined when user disabled sound'
    );
  }

  // --- SECTION 4: Duplicate Prevention & In-App SQLite Integrity ---
  console.log('\n--- TEST 4: Duplicate Prevention via SQLite dedupe_key ---');
  {
    memoryStore.clear();
    const mockDb = createMockDb();

    let scheduleCalls = 0;
    const mockExpo = {
      AndroidImportance: { HIGH: 4 },
      getPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
      setNotificationChannelAsync: async () => ({}),
      scheduleNotificationAsync: async () => {
        scheduleCalls++;
        return 'notif-id-' + scheduleCalls;
      },
    };
    __setMockNotificationsModule(mockExpo);

    const firstResult = await createDeduplicatedNotification(mockDb, {
      type: 'ALLOTTED',
      ipo_id: 'ipo-zomato-99',
      title: 'Zomato Allotment Confirmed',
      body: '100 shares allotted',
      dedupe_key: 'allotment_confirmed_ipo-zomato-99',
    });

    assert(firstResult !== null, 'First Notification Created', 'First notification created successfully');
    assert(mockDb.records.length === 1, 'SQLite Row Added', 'One SQLite record inserted in notification center');
    assert(scheduleCalls === 1, 'Native Notification Scheduled', 'Native schedule called exactly once');

    // Attempt second notification with identical dedupe_key (e.g. repeated background sync)
    const secondResult = await createDeduplicatedNotification(mockDb, {
      type: 'ALLOTTED',
      ipo_id: 'ipo-zomato-99',
      title: 'Zomato Allotment Confirmed',
      body: '100 shares allotted',
      dedupe_key: 'allotment_confirmed_ipo-zomato-99',
    });

    assert(secondResult === null, 'Duplicate Ignored', 'Second duplicate notification returns null');
    assert(mockDb.records.length === 1, 'SQLite Unchanged', 'SQLite row count unchanged');
    assert(scheduleCalls === 1, 'Duplicate Native Alert Prevented', 'Zero duplicate alerts scheduled');
  }

  // --- SECTION 5: Graceful Degradation & Native Module Absence ---
  console.log('\n--- TEST 5: Graceful Degradation (Native Module Missing / Denied) ---');
  {
    memoryStore.clear();
    const mockDb = createMockDb();

    // 5.1 Native module missing (null)
    __setMockNotificationsModule(null);

    const permStatus = await getNotificationPermissionStatus();
    assert(
      permStatus.granted === false && permStatus.status === 'undetermined',
      'Graceful Perm Status',
      'Returns ungranted status cleanly without throwing when module missing'
    );

    const channelSuccess = await setupNotificationChannels();
    assert(channelSuccess === false, 'Graceful Channel Setup', 'Returns false cleanly when module missing');

    const scheduledId = await scheduleLocalNotification('Missing Native Module', 'Should not crash');
    assert(scheduledId === null, 'Graceful Schedule Fallback', 'Returns null without crash');

    // In-app SQLite record creation still works even if native module is absent!
    const inAppOnlyRecord = await createDeduplicatedNotification(mockDb, {
      type: 'IPO_OPEN',
      ipo_id: 'ipo-offline-1',
      title: 'Offline IPO Open',
      body: 'In-app record preserved',
      dedupe_key: 'ipo_open_offline-1',
    });

    assert(inAppOnlyRecord !== null, 'In-App Notification Works', 'In-app notification created in SQLite');
    assert(mockDb.records.length === 1, 'SQLite Record Preserved', 'Notification Center remains functional');

    // 5.2 Permission denied
    const deniedExpo = {
      AndroidImportance: { HIGH: 4 },
      getPermissionsAsync: async () => ({ granted: false, status: 'denied' }),
      scheduleNotificationAsync: async () => 'should-not-reach',
    };
    __setMockNotificationsModule(deniedExpo);

    const deniedSchedule = await scheduleLocalNotification('Permission Denied', 'Should skip native notification');
    assert(
      deniedSchedule === null,
      'Permission Denied Handling',
      'Skips native alert safely when permission denied'
    );
  }

  // --- SECTION 6: Tap Handling, Route Selection, Cold-Start & Duplicate Prevention ---
  console.log('\n--- TEST 6: Tap Routing, Cold-Start & Duplicate Response Handling ---');
  {
    __resetProcessedNotificationResponsesForTest();

    // 6.1 Route Selection: Allotment notification with ipoId -> /allotment-checker
    const routeAllotment = resolveNotificationRoute({
      type: 'ALLOTTED',
      ipoId: 'ipo-bajaj-1',
      symbol: 'BAJAJHFL',
    });
    assert(
      routeAllotment.pathname === '/allotment-checker' &&
      routeAllotment.params?.ipoId === 'ipo-bajaj-1' &&
      routeAllotment.params?.symbol === 'BAJAJHFL',
      'Allotment Route with ID',
      'Routes ALLOTTED to /allotment-checker with ipoId & symbol'
    );

    // 6.2 Route Selection: Allotment notification without ipoId -> /applications
    const routeAllotmentNoId = resolveNotificationRoute({
      type: 'PARTIALLY_ALLOTTED',
    });
    assert(
      routeAllotmentNoId.pathname === '/applications',
      'Allotment Route without ID',
      'Routes allotment without ipoId to /applications'
    );

    // 6.3 Route Selection: IPO notifications -> /ipo-details with id
    const routeNewIpo = resolveNotificationRoute({
      type: 'NEW_IPO',
      ipoId: 'ipo-swiggy-9',
    });
    assert(
      routeNewIpo.pathname === '/ipo-details' &&
      routeNewIpo.params?.id === 'ipo-swiggy-9',
      'NEW_IPO Route',
      'Routes NEW_IPO to /ipo-details with id parameter'
    );

    const routeGmp = resolveNotificationRoute({
      type: 'GMP_CHANGE',
      ipo_id: 'ipo-swiggy-9',
    });
    assert(
      routeGmp.pathname === '/ipo-details' &&
      routeGmp.params?.id === 'ipo-swiggy-9',
      'GMP_CHANGE Route',
      'Routes GMP_CHANGE to /ipo-details supporting ipo_id property'
    );

    const routeClosingSoon = resolveNotificationRoute({
      type: 'IPO_CLOSING_SOON',
      ipoId: 'ipo-zomato-1',
    });
    assert(
      routeClosingSoon.pathname === '/ipo-details' &&
      routeClosingSoon.params?.id === 'ipo-zomato-1',
      'Closing Soon Route',
      'Routes IPO_CLOSING_SOON to /ipo-details'
    );

    // 6.4 Missing or invalid identifiers -> Safe /notifications fallback
    const routeMissingId = resolveNotificationRoute({
      type: 'NEW_IPO',
      ipoId: '   ',
    });
    assert(
      routeMissingId.pathname === '/notifications',
      'Missing ID Safe Fallback',
      'Falls back to /notifications when ipoId is blank/whitespace'
    );

    const routeEmptyData = resolveNotificationRoute(null);
    assert(
      routeEmptyData.pathname === '/notifications',
      'Null Data Safe Fallback',
      'Falls back to /notifications when notification data is null'
    );

    // 6.5 Cold-Start Response Handling
    const pushedRoutes: Array<{ pathname: string; params?: any }> = [];
    const mockRouter = {
      push: (target: any) => {
        pushedRoutes.push(target);
      },
    };

    let coldStartResponse: any = {
      notification: {
        request: {
          identifier: 'cold-start-notif-req-1',
          content: {
            data: {
              type: 'ALLOTTED',
              ipoId: 'ipo-cold-1',
            },
          },
        },
      },
    };

    const mockExpoWithColdStart = {
      getLastNotificationResponseAsync: async () => coldStartResponse,
      addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
    };
    __setMockNotificationsModule(mockExpoWithColdStart);

    const coldHandled = await handleColdStartNotificationResponse(mockRouter);
    assert(coldHandled === true, 'Cold-Start Handled', 'handleColdStartNotificationResponse returns true');
    assert(
      pushedRoutes.length === 1 &&
      pushedRoutes[0].pathname === '/allotment-checker' &&
      pushedRoutes[0].params?.ipoId === 'ipo-cold-1',
      'Cold-Start Navigation',
      'Dispatches navigation to /allotment-checker on cold start'
    );

    // 6.6 Duplicate Response Prevention
    const secondColdAttempt = await handleColdStartNotificationResponse(mockRouter);
    assert(
      secondColdAttempt === false,
      'Duplicate Cold Start Blocked',
      'Blocks duplicate navigation for previously processed response identifier'
    );
    assert(pushedRoutes.length === 1, 'Pushed Routes Count', 'Zero duplicate routes pushed');

    // 6.7 Runtime Listener Duplicate Prevention
    let runtimeListenerCallback: ((resp: any) => void) | null = null;
    const subscriptionTracker = { removed: false };

    const mockExpoListener = {
      getLastNotificationResponseAsync: async () => null,
      addNotificationResponseReceivedListener: (cb: any) => {
        runtimeListenerCallback = cb;
        return {
          remove: () => {
            subscriptionTracker.removed = true;
          },
        };
      },
    };
    __setMockNotificationsModule(mockExpoListener);

    const subscription = setupNotificationResponseListener(mockRouter);
    assert(subscription !== null, 'Listener Attached', 'setupNotificationResponseListener attaches subscription');
    assert(typeof runtimeListenerCallback === 'function', 'Listener Registered', 'Registers callback');

    // Fire live event
    const liveResponse = {
      notification: {
        request: {
          identifier: 'live-tap-notif-req-2',
          content: {
            data: {
              type: 'NEW_IPO',
              ipoId: 'ipo-live-99',
            },
          },
        },
      },
    };

    const liveHandled = await handleNotificationResponse(liveResponse, mockRouter);
    assert(liveHandled === true, 'Live Tap Handled', 'Live notification tap handled successfully');
    assert(
      pushedRoutes.length === 2 &&
      pushedRoutes[1].pathname === '/ipo-details' &&
      pushedRoutes[1].params?.id === 'ipo-live-99',
      'Live Tap Routed to IPO Details',
      'Routes live NEW_IPO tap to /ipo-details'
    );

    // Fire identical live response again
    const duplicateLiveHandled = await handleNotificationResponse(liveResponse, mockRouter);
    assert(
      duplicateLiveHandled === false,
      'Live Duplicate Ignored',
      'Ignores duplicate live response identifier'
    );
    assert(pushedRoutes.length === 2, 'Route Stack Unchanged', 'Route stack remains 2');

    // Cleanup subscription
    if (subscription && subscription.remove) {
      subscription.remove();
    }
    assert(subscriptionTracker.removed === true, 'Subscription Cleaned Up', 'Subscription unmounts cleanly');
  }

  // --- SECTION 7: Future Timeline Scheduling & Expo DateTriggerInput Syntax ---
  console.log('\n--- TEST 7: Future Timeline Scheduling & DateTriggerInput ---');
  {
    memoryStore.clear();
    let scheduledPayload: any = null;

    const mockExpo = {
      AndroidImportance: { HIGH: 4 },
      getPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
      setNotificationChannelAsync: async () => ({}),
      scheduleNotificationAsync: async (payload: any) => {
        // Enforce Expo DateTriggerInput validation rules
        if (payload.trigger) {
          if (!payload.trigger.type || !payload.trigger.channelId) {
            throw new TypeError('The trigger object you provided is invalid. It needs to contain a type or channelId entry.');
          }
          if (payload.trigger.type !== 'date' || typeof payload.trigger.date !== 'number') {
            throw new TypeError('Invalid date trigger');
          }
        }
        scheduledPayload = payload;
        return 'sched-notif-uuid-1';
      },
    };
    __setMockNotificationsModule(mockExpo);

    // 7.1 Future date trigger formatting
    const futureMs = Date.now() + 86400000; // Tomorrow
    const schedId = await scheduleLocalNotification(
      'Future IPO Opening',
      'Opens tomorrow at 10:00 AM',
      { type: 'IPO_OPEN', ipoId: 'ipo-future-1' },
      new Date(futureMs),
      'sched_open_ipo-future-1_2026-10-17'
    );

    assert(schedId === 'sched-notif-uuid-1', 'Future Schedule Succeeded', 'Future notification scheduled successfully');
    assert(
      scheduledPayload !== null &&
      scheduledPayload.trigger !== null &&
      scheduledPayload.trigger.type === 'date' &&
      scheduledPayload.trigger.date === futureMs,
      'Valid DateTriggerInput Type',
      'Trigger contains type="date" and target date matching expo-notifications specification'
    );
    assert(
      scheduledPayload.trigger.channelId === DEFAULT_NOTIFICATION_CHANNEL_ID,
      'DateTriggerInput Channel',
      'Trigger contains channelId matching default notification channel'
    );
    assert(
      scheduledPayload.identifier === 'sched_open_ipo-future-1_2026-10-17',
      'OS Identifier Forwarded',
      'Identifier is passed to scheduleNotificationAsync for exact OS alarm deduplication'
    );

    // 7.2 Past date trigger suppression
    scheduledPayload = null;
    const pastMs = Date.now() - 10000;
    const pastSchedId = await scheduleLocalNotification(
      'Expired Event',
      'This was in the past',
      { type: 'IPO_OPEN', ipoId: 'ipo-past-1' },
      new Date(pastMs)
    );
    assert(pastSchedId === null && scheduledPayload === null, 'Past Trigger Suppressed', 'Past triggers return null and do not schedule alarms');
  }

  // --- SECTION 8: Pre-Scheduled Notification Deduplication on App Launch ---
  console.log('\n--- TEST 8: Pre-Scheduled Notification Deduplication ---');
  {
    memoryStore.clear();
    const mockDb = createMockDb();
    let scheduleCalls = 0;

    const mockExpo = {
      AndroidImportance: { HIGH: 4 },
      getPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
      setNotificationChannelAsync: async () => ({}),
      scheduleNotificationAsync: async () => {
        scheduleCalls++;
        return 'mock-sched-id-' + scheduleCalls;
      },
    };
    __setMockNotificationsModule(mockExpo);

    // When an alert was already scheduled in advance, opening app records it in SQLite
    // but skips triggering a redundant duplicate native alert banner
    const result = await createDeduplicatedNotification(mockDb, {
      type: 'IPO_OPEN',
      ipo_id: 'ipo-today-1',
      title: 'IPO Open for Bidding',
      body: 'Today is opening day',
      dedupe_key: 'ipo_open_ipo-today-1_2026-10-16',
      skipNativeAlert: true,
    });

    assert(result !== null, 'In-App Notification Created', 'Notification created for in-app notification center');
    assert(mockDb.records.length === 1, 'SQLite Record Stored', 'Stored in SQLite notifications table');
    assert(scheduleCalls === 0, 'Redundant Alert Skipped', 'Native alert schedule was skipped to prevent duplicate pop-up on app open');

    // When not pre-scheduled, native alert schedule executes
    const result2 = await createDeduplicatedNotification(mockDb, {
      type: 'IPO_OPEN',
      ipo_id: 'ipo-today-2',
      title: 'IPO Open for Bidding 2',
      body: 'New unscheduled opening',
      dedupe_key: 'ipo_open_ipo-today-2_2026-10-16',
      skipNativeAlert: false,
    });

    assert(result2 !== null, 'Unscheduled Notification Created', 'Unscheduled notification created');
    assert(scheduleCalls === 1, 'Native Alert Triggered', 'Native alert scheduled for unscheduled opening');
  }

  // --- SECTION 9: Device Push Token Registration ---
  console.log('\n--- TEST 9: Device Push Token Registration ---');
  {
    memoryStore.clear();

    // 9.1 When permission not granted, returns null
    const mockExpoNoPerm = {
      getPermissionsAsync: async () => ({ granted: false, status: 'denied' }),
      getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[mock-token-123]' }),
    };
    __setMockNotificationsModule(mockExpoNoPerm);

    const noPermToken = await registerDevicePushTokenAsync('user-101');
    assert(noPermToken === null, 'Push Token Permission Gate', 'Returns null when permission is not granted');

    // 9.2 When permission granted, fetches token and caches
    let pushTokenCalls = 0;
    const mockExpoPerm = {
      getPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
      getExpoPushTokenAsync: async () => {
        pushTokenCalls++;
        return { data: 'ExponentPushToken[mock-token-xyz]' };
      },
    };
    __setMockNotificationsModule(mockExpoPerm);

    const token = await registerDevicePushTokenAsync('user-101');
    assert(token === 'ExponentPushToken[mock-token-xyz]', 'Push Token Acquired', 'Returns valid Expo push token');
    assert(pushTokenCalls === 1, 'Token API Called', 'Calls getExpoPushTokenAsync once');

    // 9.3 Subsequent call uses cache
    const cachedToken = await registerDevicePushTokenAsync('user-101');
    assert(cachedToken === 'ExponentPushToken[mock-token-xyz]', 'Cached Token Returned', 'Returns cached token');
    assert(pushTokenCalls === 1, 'Backend Spam Prevented', 'Does not invoke push token retrieval twice for same cached session');

    // 9.4 Force refresh bypasses cache
    const refreshedToken = await registerDevicePushTokenAsync('user-101', true);
    assert(refreshedToken === 'ExponentPushToken[mock-token-xyz]', 'Token Refreshed', 'Force refresh returns token');
    assert(pushTokenCalls === 2, 'Force Refresh Invoked API', 'Calls API when forceRefresh is requested');

    // 9.5 Account switching produces independent tokens
    const user2Token = await registerDevicePushTokenAsync('user-202');
    assert(user2Token === 'ExponentPushToken[mock-token-xyz]', 'User 2 Token Registered', 'Registers token for user 2');
    assert(pushTokenCalls === 3, 'User 2 Not Using User 1 Cache', 'New user triggers registration without cache collision');

    // 9.6 Logout deactivates and clears cache
    const unregisterSuccess = await unregisterDevicePushTokenAsync('user-101');
    assert(unregisterSuccess === true, 'Token Unregistered', 'Successfully unregisters token on logout');
    const clearedCache = await safeAsyncStorage.getItem(`${PUSH_TOKEN_CACHE_KEY_PREFIX}user-101`);
    assert(clearedCache === null, 'Cache Cleared', 'Removes user token cache on logout');
  }

  console.log('\n====================================================');
  console.log('ALL LOCAL NOTIFICATION TESTS PASSED SUCCESSFULLY! ✓');
  console.log('====================================================');
}

// Execute directly if run as main script
if (require.main === module) {
  runLocalNotificationEngineTestSuite().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
