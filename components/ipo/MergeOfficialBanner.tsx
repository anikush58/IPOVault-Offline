import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { IPOMasterRecord } from '@/services/ipo/types';

type Props = {
  localIpo: IPOMasterRecord;
  officialIpo: IPOMasterRecord;
  onMerge: (localId: string, officialIpo: IPOMasterRecord) => Promise<void>;
};

export const MergeOfficialBanner = React.memo(function MergeOfficialBanner({
  localIpo,
  officialIpo,
  onMerge,
}: Props) {
  const colors = useColors();
  const [dismissed, setDismissed] = useState(false);
  const [merging, setMerging] = useState(false);

  if (dismissed) return null;

  const handleMergePress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMerging(true);
    try {
      await onMerge(localIpo.id, officialIpo);
    } catch (err) {
      if (__DEV__) console.warn('[MergeOfficialBanner] Merge failed', err);
    } finally {
      setMerging(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Feather name="info" size={16} color="#92400E" />
          <Text style={styles.title}>Official IPO Found</Text>
        </View>
        <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={8}>
          <Text style={styles.laterText}>Later</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subText}>
        An official backend listing for "{officialIpo.company_name}" is available. Merge to update details while keeping your notes & applications.
      </Text>

      <TouchableOpacity
        onPress={handleMergePress}
        disabled={merging}
        style={styles.mergeBtn}
        activeOpacity={0.8}
      >
        <Feather name="git-merge" size={14} color="#FFFFFF" />
        <Text style={styles.mergeBtnText}>{merging ? 'Merging...' : 'Merge Now'}</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#92400E',
  },
  laterText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    color: '#78350F',
  },
  subText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    color: '#78350F',
    lineHeight: 17,
    marginBottom: 10,
  },
  mergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  mergeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
