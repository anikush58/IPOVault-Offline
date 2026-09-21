import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/context/DialogContext';

export default function PrivacySecurityScreen() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showInfo } = useDialog();
  const topPad = Platform.OS === 'web' ? 24 : insets.top;

  const securityFeatures = [
    {
      icon: 'hard-drive',
      iconBg: '#10B98118',
      iconColor: '#10B981',
      title: 'Local-First Database',
      description:
        'All sensitive records including PAN numbers, Demat accounts, and IPO applications remain strictly on your device inside an isolated SQLite database.',
    },
    {
      icon: 'shield',
      iconBg: '#3B82F618',
      iconColor: '#3B82F6',
      title: 'Zero Third-Party Trackers',
      description:
        'IPOVault contains no advertising SDKs, behavioral analytics, or third-party data brokers. Your financial tracking activity is 100% private.',
    },
    {
      icon: 'lock',
      iconBg: '#8B5CF618',
      iconColor: '#8B5CF6',
      title: 'Encrypted Cloud Transport',
      description:
        'When optional Cloud Backup is used, data is transmitted exclusively over TLS 1.3 encryption and stored in Supabase with PostgreSQL Row-Level Security (RLS).',
    },
    {
      icon: 'key',
      iconBg: '#F59E0B18',
      iconColor: '#F59E0B',
      title: 'No Banking Credentials Required',
      description:
        'We never ask for or store your net banking passwords, UPI PINs, trading passwords, or OTPs. All ASBA and UPI bids are authorized through your official bank/broker app.',
    },
    {
      icon: 'trash-2',
      iconBg: '#EF444418',
      iconColor: '#EF4444',
      title: 'Instant Data Wipe & Portability',
      description:
        'You have absolute ownership of your data. Export your entire history to JSON/CSV or permanently wipe everything with one tap.',
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: isDark ? '#262C36' : '#F3F4F6' }]}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={[styles.headerEyebrow, { color: colors.mutedForeground }]}>SECURITY</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Privacy & Security</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 6 }}
      >
        {/* Hero Badge Card */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.heroIconBadge, { backgroundColor: '#10B98118' }]}>
            <Feather name="shield" size={28} color="#10B981" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Your Privacy is Built-in</Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            IPOVault is architected local-first. We believe your investment bids and PAN profiles should stay on your phone, not on commercial data servers.
          </Text>

          <View style={[styles.statusPillRow, { borderTopColor: colors.border }]}>
            <View style={[styles.statusPill, { backgroundColor: isDark ? '#10B98120' : '#ECFDF5' }]}>
              <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.statusPillText, { color: '#10B981' }]}>Local Sandbox Active</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: isDark ? '#3B82F620' : '#EFF6FF' }]}>
              <View style={[styles.statusDot, { backgroundColor: '#3B82F6' }]} />
              <Text style={[styles.statusPillText, { color: '#3B82F6' }]}>Zero Trackers</Text>
            </View>
          </View>
        </View>

        {/* Security Pillars */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>SECURITY PILLARS</Text>
        <View style={styles.listContainer}>
          {securityFeatures.map((item, idx) => (
            <View
              key={idx}
              style={[styles.featureCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.featureIconWrap, { backgroundColor: item.iconBg }]}>
                <Feather name={item.icon as any} size={18} color={item.iconColor} />
              </View>
              <View style={styles.featureTextCol}>
                <Text style={[styles.featureTitle, { color: colors.foreground }]}>{item.title}</Text>
                <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
                  {item.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Allotment Query Notice */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>REGISTRAR QUERIES</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={[styles.featureIconWrap, { backgroundColor: '#F59E0B18' }]}>
              <Feather name="info" size={18} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureTitle, { color: colors.foreground }]}>
                Official Registrar Matching
              </Text>
              <Text style={[styles.featureDesc, { color: colors.mutedForeground, marginTop: 4 }]}>
                When you check allotment status, your PAN is transmitted directly to official SEBI-registered registrar servers (Link Intime, KFintech, Bigshare) over secure HTTPS to fetch your allotment result. Queries are never stored or logged externally.
              </Text>
            </View>
          </View>
        </View>

        {/* Action button to view full policy */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <TouchableOpacity
            style={[styles.policyBtn, { backgroundColor: isDark ? '#262C36' : '#F3F4F6' }]}
            activeOpacity={0.7}
            onPress={() => router.push('/privacy-policy')}
          >
            <Text style={[styles.policyBtnText, { color: colors.foreground }]}>Read Full Privacy Policy</Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    marginBottom: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.4,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  heroIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 18.5,
    marginBottom: 16,
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 14,
    width: '100%',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 999,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 8,
  },
  listContainer: {
    paddingHorizontal: 16,
    gap: 10,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  featureCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextCol: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  featureDesc: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 3,
    lineHeight: 17.5,
  },
  policyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
  },
  policyBtnText: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
