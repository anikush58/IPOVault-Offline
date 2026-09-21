import React, { useState } from 'react';
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

export default function PrivacyPolicyScreen() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 24 : insets.top;

  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  const sections = [
    {
      id: 1,
      title: '1. Information We Store Locally',
      content:
        'IPOVault is designed as a local-first application. When you add users, Demat accounts, or log IPO applications, this data is saved directly on your device inside an offline SQLite database. We do not automatically send your PAN numbers, bank details, or bidding volumes to any central server.',
    },
    {
      id: 2,
      title: '2. Allotment Queries & Registrars',
      content:
        'When you use the Allotment Checker feature, your PAN or Application Number is temporarily sent via encrypted HTTPS request directly to the corresponding official registrar (such as Link Intime, KFin Technologies, Bigshare Services, Skyline, Purva Sharegistry). These queries are strictly used to retrieve allotment results and are not retained by IPOVault.',
    },
    {
      id: 3,
      title: '3. Optional Cloud Backup',
      content:
        'If you choose to sign in to Supabase and use Cloud Backup, an encrypted snapshot of your local database is securely transmitted to your personal Supabase account. Access to this backup is protected by Row-Level Security (RLS) policies tied exclusively to your authenticated user ID.',
    },
    {
      id: 4,
      title: '4. No Sale or Sharing of Financial Data',
      content:
        'We do not sell, rent, monetize, or disclose your personal or financial data to advertisers, data brokers, lenders, or third parties under any circumstances. There are no tracking or advertising SDKs embedded in the app.',
    },
    {
      id: 5,
      title: '5. Data Ownership & Deletion',
      content:
        'You have full control over your data. You can export your data anytime as a standard JSON or CSV file, or delete all records permanently using the "Clear All Data" feature in Settings.',
    },
    {
      id: 6,
      title: '6. Security Standards',
      content:
        'We implement industry-standard practices, including local file sandboxing, TLS 1.3 encrypted transport for cloud sync, and strict authorization protocols to protect your information.',
    },
    {
      id: 7,
      title: '7. Policy Updates & Contact',
      content:
        'We may update this Privacy Policy to reflect app enhancements or regulatory changes. If you have any questions or feedback regarding our privacy practices, please contact us at privacy@ipovault.app.',
    },
  ];

  const toggleSection = (id: number) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

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
          <Text style={[styles.headerEyebrow, { color: colors.mutedForeground }]}>LEGAL</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Privacy Policy</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 6 }}
      >
        {/* Effective Date & Overview Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 18, marginBottom: 14 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={[styles.effectiveDate, { color: colors.mutedForeground }]}>Effective: September 2026</Text>
            <View style={[styles.versionBadge, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]}>
              <Text style={[styles.versionText, { color: colors.foreground }]}>v2.0.2</Text>
            </View>
          </View>
          <Text style={[styles.summaryText, { color: colors.foreground }]}>
            IPOVault values your privacy. This policy explains what information is stored, how registrar allotment checks operate, and your rights as an investor.
          </Text>
        </View>

        {/* Policy Sections Accordion */}
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {sections.map((sec) => {
            const isOpen = expandedSection === sec.id;
            return (
              <View
                key={sec.id}
                style={[styles.policyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <TouchableOpacity
                  style={styles.policyHeaderRow}
                  activeOpacity={0.7}
                  onPress={() => toggleSection(sec.id)}
                >
                  <Text style={[styles.policySectionTitle, { color: colors.foreground }]}>{sec.title}</Text>
                  <Feather
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>

                {isOpen && (
                  <View style={[styles.policyBody, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <Text style={[styles.policyContentText, { color: colors.mutedForeground }]}>
                      {sec.content}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Contact Footer */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 18, marginHorizontal: 16, marginTop: 14 }]}>
          <Text style={[styles.contactTitle, { color: colors.foreground }]}>Questions or Concerns?</Text>
          <Text style={[styles.contactSub, { color: colors.mutedForeground, marginTop: 4 }]}>
            If you have questions regarding data privacy or security, reach out to our team at{' '}
            <Text style={{ color: '#2563EB', fontFamily: 'GoogleSansFlex_600SemiBold' }}>privacy@ipovault.app</Text>.
          </Text>
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
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  effectiveDate: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  versionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  versionText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  summaryText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18.5,
  },
  policyCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  policyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  policySectionTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    flex: 1,
    paddingRight: 10,
  },
  policyBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  policyContentText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
  contactTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  contactSub: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
});
