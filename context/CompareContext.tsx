import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';

interface CompareContextType {
  selectedIds: string[];
  addToCompare: (id: string) => boolean;
  removeFromCompare: (id: string) => void;
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
  isInCompare: (id: string) => boolean;
  maxLimit: number;
}

const CompareContext = createContext<CompareContextType | null>(null);

export const CompareProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const maxLimit = 4;

  const isInCompare = useCallback(
    (id: string) => selectedIds.includes(id),
    [selectedIds]
  );

  const addToCompare = useCallback((id: string): boolean => {
    let added = false;
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev;
      if (prev.length >= maxLimit) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return prev;
      }
      added = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return [...prev, id];
    });
    return added;
  }, []);

  const removeFromCompare = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  }, []);

  const toggleCompare = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= maxLimit) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return prev;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return [...prev, id];
    });
  }, []);

  const clearCompare = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds([]);
  }, []);

  const value = useMemo(
    () => ({
      selectedIds,
      addToCompare,
      removeFromCompare,
      toggleCompare,
      clearCompare,
      isInCompare,
      maxLimit,
    }),
    [selectedIds, addToCompare, removeFromCompare, toggleCompare, clearCompare, isInCompare]
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
};

export function useCompare(): CompareContextType {
  const context = useContext(CompareContext);
  if (!context) {
    throw new Error('useCompare must be used within a CompareProvider');
  }
  return context;
}
