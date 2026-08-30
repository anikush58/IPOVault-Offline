import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { SmartIPORecord, SmartIPOLifecycleStatus } from '@/lib/smartIpo/types/smartIpo';
import { IPOFilterOptions } from '@/lib/smartIpo/types/provider';
import { LocalSQLiteProvider } from '@/lib/smartIpo/providers/LocalSQLiteProvider';
import { smartIPOProviderRegistry } from '@/lib/smartIpo/SmartIPOProviderRegistry';

export function useSmartIPODatabase(options?: IPOFilterOptions) {
  const db = useSQLiteContext();
  const [ipos, setIPOs] = useState<SmartIPORecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIPOs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      smartIPOProviderRegistry.initDefaultProviders(db);
      const provider = smartIPOProviderRegistry.getActiveProvider();
      const res = await provider.getIPOs(options);
      if (res.success) {
        setIPOs(res.data);
      } else {
        setError(res.error || 'Failed to fetch IPOs');
      }
    } catch (err: any) {
      setError(err?.message || 'Error fetching Smart IPO Database');
    } finally {
      setIsLoading(false);
    }
  }, [db, JSON.stringify(options)]);

  useEffect(() => {
    fetchIPOs();
  }, [fetchIPOs]);

  const openIPOs = useMemo(
    () => ipos.filter((i) => i.lifecycle_status === 'OPEN'),
    [ipos]
  );

  const upcomingIPOs = useMemo(
    () => ipos.filter((i) => i.lifecycle_status === 'UPCOMING'),
    [ipos]
  );

  const closedIPOs = useMemo(
    () => ipos.filter((i) => i.lifecycle_status === 'CLOSED' || i.lifecycle_status === 'ALLOTTED_PENDING' || i.lifecycle_status === 'ALLOTTED_AVAILABLE'),
    [ipos]
  );

  const listedIPOs = useMemo(
    () => ipos.filter((i) => i.lifecycle_status === 'LISTED'),
    [ipos]
  );

  const topGMPGainers = useMemo(
    () => [...ipos].sort((a, b) => (b.gmp_percent || 0) - (a.gmp_percent || 0)).slice(0, 5),
    [ipos]
  );

  return {
    ipos,
    openIPOs,
    upcomingIPOs,
    closedIPOs,
    listedIPOs,
    topGMPGainers,
    isLoading,
    error,
    refresh: fetchIPOs,
  };
}
