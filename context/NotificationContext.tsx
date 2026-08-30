import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { NotificationRecord } from '@/services/notifications/notificationEngine';
import { safeRunAsync, safeGetAllAsync } from '@/utils/sqliteDebug';

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

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshNotifications = useCallback(async () => {
    try {
      const rows = await safeGetAllAsync<NotificationRecord>(
        db,
        'SELECT * FROM notifications ORDER BY created_at DESC',
        [],
        'NotificationContext.refresh'
      );
      setNotifications(rows || []);
    } catch {
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [db]);

  useEffect(() => {
    refreshNotifications();
    // Refresh every 10 seconds to pick up sync updates automatically
    const interval = setInterval(refreshNotifications, 10000);
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  const markAsRead = async (id: string) => {
    const now = new Date().toISOString();
    await safeRunAsync(
      db,
      'UPDATE notifications SET read_at = ? WHERE id = ?',
      [now, id],
      'NotificationContext.markAsRead'
    );
    await refreshNotifications();
  };

  const markAllAsRead = async () => {
    const now = new Date().toISOString();
    await safeRunAsync(
      db,
      'UPDATE notifications SET read_at = ? WHERE read_at IS NULL',
      [now],
      'NotificationContext.markAllAsRead'
    );
    await refreshNotifications();
  };

  const deleteNotification = async (id: string) => {
    await safeRunAsync(
      db,
      'DELETE FROM notifications WHERE id = ?',
      [id],
      'NotificationContext.deleteNotification'
    );
    await refreshNotifications();
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        refreshNotifications,
      }}
    >
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
