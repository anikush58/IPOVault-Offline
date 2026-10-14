import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { NotificationRecord } from '@/services/notifications/notificationEngine';
import { safeRunAsync, safeGetAllAsync } from '@/utils/sqliteDebug';
import { concurrencyTelemetry } from '@/utils/concurrencyTelemetry';

interface NotificationContextType {
  notifications: NotificationRecord[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function areNotificationsEqual(a: NotificationRecord[], b: NotificationRecord[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const itemA = a[i];
    const itemB = b[i];
    if (
      itemA.id !== itemB.id ||
      itemA.read_at !== itemB.read_at ||
      itemA.type !== itemB.type ||
      itemA.delivered_at !== itemB.delivered_at ||
      itemA.dedupe_key !== itemB.dedupe_key
    ) {
      return false;
    }
  }
  return true;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const inFlightRef = useRef(false);

  const refreshNotifications = useCallback(async () => {
    if (inFlightRef.current || !db) return;
    inFlightRef.current = true;
    const probe = concurrencyTelemetry.startExecuting('BACKGROUND_POLL', 'NotificationContext.poll');
    try {
      const rows = await safeGetAllAsync<NotificationRecord>(
        db,
        'SELECT * FROM notifications ORDER BY created_at DESC',
        [],
        'NotificationContext.refresh'
      );
      const newRows = rows || [];
      setNotifications((prev) => {
        if (areNotificationsEqual(prev, newRows)) {
          return prev;
        }
        return newRows;
      });
      probe.finish();
    } catch (err) {
      probe.finish(err);
      setNotifications((prev) => (prev.length === 0 ? prev : []));
    } finally {
      probe.finish();
      setIsLoading(false);
      inFlightRef.current = false;
    }
  }, [db]);

  useEffect(() => {
    refreshNotifications();

    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (!interval) {
        interval = setInterval(refreshNotifications, 30000);
      }
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    startPolling();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        refreshNotifications();
        startPolling();
      } else {
        stopPolling();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      stopPolling();
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, [refreshNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    if (!db) return;
    const now = new Date().toISOString();
    await safeRunAsync(
      db,
      'UPDATE notifications SET read_at = ? WHERE id = ?',
      [now, id],
      'NotificationContext.markAsRead'
    );
    await refreshNotifications();
  }, [db, refreshNotifications]);

  const markAllAsRead = useCallback(async () => {
    if (!db) return;
    const now = new Date().toISOString();
    await safeRunAsync(
      db,
      'UPDATE notifications SET read_at = ? WHERE read_at IS NULL',
      [now],
      'NotificationContext.markAllAsRead'
    );
    await refreshNotifications();
  }, [db, refreshNotifications]);

  const deleteNotification = useCallback(async (id: string) => {
    if (!db) return;
    await safeRunAsync(
      db,
      'DELETE FROM notifications WHERE id = ?',
      [id],
      'NotificationContext.deleteNotification'
    );
    await refreshNotifications();
  }, [db, refreshNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications]
  );

  const contextValue = useMemo(
    () => ({
      notifications,
      unreadCount,
      isLoading,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      refreshNotifications,
    }),
    [notifications, unreadCount, isLoading, markAsRead, markAllAsRead, deleteNotification, refreshNotifications]
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextType {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
}
