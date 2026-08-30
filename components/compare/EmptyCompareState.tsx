import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';

export const EmptyCompareState = React.memo(function EmptyCompareState() {
  const colors = useColors();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '30' }]}>
        <Feather name="columns" size={32} color={colors.primary} />
      </View>

      <Text style={[styles.title, { color: colors.foreground }]}>No IPOs Selected</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Select up to 4 IPOs from the IPO Hub by long pressing or tapping Compare to compare specs side-by-side.
      </Text>

      <TouchableOpacity
        onPress={() => router.push('/ipos')}
        style={[styles.btn, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
      >
        <Text style={styles.btnText}>Browse IPOs</Text>
        <Feather name="arrow-right" size={16} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
});

import { TouchableOpacity } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
