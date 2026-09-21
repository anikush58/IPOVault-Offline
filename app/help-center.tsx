import React, { useState } from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import * as Haptics from 'expo-haptics';

interface FAQItem {
  id: string;
  category: 'allotment' | 'bidding' | 'backup' | 'general';
  question: string;
  answer: string;
}

const FAQ_LIST: FAQItem[] = [
  {
    id: 'faq-1',
    category: 'allotment',
    question: 'How do I check my IPO allotment status?',
    answer:
      'Go to the Allotment Checker tab or open any IPO detail screen. Select the IPO and applicant name (or enter your PAN/Application No). IPOVault directly queries the official registrar to fetch your allotment result in real time.',
  },
  {
    id: 'faq-2',
    category: 'allotment',
    question: 'Why is my allotment showing "Not Allotted" or "Record Not Found"?',
    answer:
      'Registrars often finalize allotment in batches late at night (often after 11:00 PM). If the registrar has not uploaded the full final data yet, it may return "Record Not Found". Try checking again once the registrar officially announces allotment completion.',
  },
  {
    id: 'faq-3',
    category: 'bidding',
    question: 'How does multi-account family bidding work?',
    answer:
      'You can add multiple family members in the Users tab with their respective PAN numbers and Demat DP IDs. When applying, select multiple applicants in one go to automatically track all family bids and check allotments simultaneously.',
  },
  {
    id: 'faq-4',
    category: 'bidding',
    question: 'When are funds blocked and unblocked in bank accounts (ASBA)?',
    answer:
      'When applying via UPI/ASBA, funds remain blocked in your bank account until the allotment date. If allotted, the exact bid amount is debited; if not allotted, your bank releases the hold within 1 to 2 business days after the allotment date.',
  },
  {
    id: 'faq-5',
    category: 'general',
    question: 'What does Grey Market Premium (GMP) mean?',
    answer:
      'GMP reflects unofficial investor sentiment in the grey market before the stock lists on NSE/BSE. An estimated listing gain = (Price Band Cutoff + GMP). Note that GMP is an estimate and not guaranteed by exchanges.',
  },
  {
    id: 'faq-6',
    category: 'backup',
    question: 'How do I transfer my data to a new phone?',
    answer:
      'You can use either:\n1. Cloud Backup: Sign in to Supabase in Settings, tap "Backup to Cloud Now", then tap "Restore from Cloud" on your new device.\n2. Local Export: Go to Settings > Export Backup, save the JSON file, and import it on your other phone.',
  },
];

const REGISTRARS = [
  {
    name: 'Link Intime India',
    phone: '+91 810 811 4949',
    email: 'ipo.helpdesk@linkintime.co.in',
    website: 'https://linkintime.co.in/initial_offer/public-issues.html',
  },
  {
    name: 'KFin Technologies',
    phone: '1800 309 4001',
    email: 'einward.ris@kfintech.com',
    website: 'https://kosmic.kfintech.com/ipostatus',
  },
  {
    name: 'Bigshare Services',
    phone: '+91 22 6263 8200',
    email: 'ipo@bigshareonline.com',
    website: 'https://www.bigshareonline.com/ipo_Allotment.html',
  },
  {
    name: 'Skyline Financial',
    phone: '+91 11 4045 0193',
    email: 'admin@skylinerta.com',
    website: 'https://www.skylinerta.com/ipo.php',
  },
];

export default function HelpCenterScreen() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 24 : insets.top;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'allotment' | 'bidding' | 'backup' | 'general'>('all');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: 'All FAQs' },
    { id: 'allotment', label: 'Allotment' },
    { id: 'bidding', label: 'Bidding & UPI' },
    { id: 'backup', label: 'Cloud & Backup' },
    { id: 'general', label: 'General' },
  ];

  const filteredFaqs = FAQ_LIST.filter((faq) => {
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleFaq = (id: string) => {
    Haptics.selectionAsync();
    setExpandedFaqId(expandedFaqId === id ? null : id);
  };

  const handleOpenUrl = (url: string) => {
    Linking.openURL(url).catch((err) => console.warn('Could not open URL:', err));
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
          <Text style={[styles.headerEyebrow, { color: colors.mutedForeground }]}>SUPPORT</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Help Center</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 6 }}
      >
        {/* Search Bar */}
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            placeholder="Search FAQs, allotment questions, tips..."
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Category Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContainer}
        >
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedCategory(cat.id as any);
                }}
                style={[
                  styles.categoryPill,
                  {
                    backgroundColor: isSelected
                      ? colors.primary
                      : isDark
                      ? '#262C36'
                      : '#F3F4F6',
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.categoryPillText,
                    {
                      color: isSelected
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* FAQ List */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
          FREQUENTLY ASKED QUESTIONS ({filteredFaqs.length})
        </Text>
        <View style={styles.faqList}>
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq) => {
              const isOpen = expandedFaqId === faq.id;
              return (
                <View
                  key={faq.id}
                  style={[styles.faqCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <TouchableOpacity
                    style={styles.faqHeaderRow}
                    activeOpacity={0.7}
                    onPress={() => toggleFaq(faq.id)}
                  >
                    <Text style={[styles.faqQuestion, { color: colors.foreground }]}>{faq.question}</Text>
                    <Feather
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={[styles.faqBody, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <Text style={[styles.faqAnswer, { color: colors.mutedForeground }]}>
                        {faq.answer}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No matching questions found for "{searchQuery}"
              </Text>
            </View>
          )}
        </View>

        {/* Registrar Directory */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 10 }]}>
          OFFICIAL REGISTRAR CONTACTS
        </Text>
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {REGISTRARS.map((reg, idx) => (
            <View
              key={idx}
              style={[styles.registrarCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.regHeader}>
                <View style={[styles.regIconBadge, { backgroundColor: '#3B82F618' }]}>
                  <Feather name="external-link" size={15} color="#3B82F6" />
                </View>
                <Text style={[styles.regTitle, { color: colors.foreground }]}>{reg.name}</Text>
              </View>

              <View style={styles.regActionRow}>
                <TouchableOpacity
                  style={[styles.regBtn, { backgroundColor: isDark ? '#262C36' : '#F3F4F6' }]}
                  onPress={() => handleOpenUrl(`tel:${reg.phone.replace(/[^0-9+]/g, '')}`)}
                >
                  <Feather name="phone" size={13} color={colors.foreground} />
                  <Text style={[styles.regBtnText, { color: colors.foreground }]}>{reg.phone}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.regBtn, { backgroundColor: isDark ? '#262C36' : '#F3F4F6' }]}
                  onPress={() => handleOpenUrl(`mailto:${reg.email}`)}
                >
                  <Feather name="mail" size={13} color={colors.foreground} />
                  <Text style={[styles.regBtnText, { color: colors.foreground }]}>Email</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.regBtn, { backgroundColor: '#2563EB18' }]}
                  onPress={() => handleOpenUrl(reg.website)}
                >
                  <Feather name="globe" size={13} color="#2563EB" />
                  <Text style={[styles.regBtnText, { color: '#2563EB' }]}>Portal</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Direct Contact Support Card */}
        <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.contactIconBadge, { backgroundColor: '#10B98118' }]}>
            <Feather name="message-circle" size={22} color="#10B981" />
          </View>
          <Text style={[styles.contactCardTitle, { color: colors.foreground }]}>Still need help?</Text>
          <Text style={[styles.contactCardSub, { color: colors.mutedForeground }]}>
            Have suggestions or found a bug? Get in touch with our engineering team directly.
          </Text>
          <TouchableOpacity
            style={[styles.contactSupportBtn, { backgroundColor: colors.primary }]}
            onPress={() => Linking.openURL('mailto:support@ipovault.app?subject=IPOVault%20Help%20Request')}
            activeOpacity={0.8}
          >
            <Feather name="mail" size={15} color={colors.primaryForeground} />
            <Text style={[styles.contactSupportBtnText, { color: colors.primaryForeground }]}>
              Email Support Team
            </Text>
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
  searchBox: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 8,
  },
  faqList: {
    paddingHorizontal: 16,
    gap: 10,
  },
  faqCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  faqHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  faqQuestion: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    flex: 1,
  },
  faqBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  faqAnswer: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
  emptyBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  registrarCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  regHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  regIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  regActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  regBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  regBtnText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  contactCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  contactIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  contactCardTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 4,
  },
  contactCardSub: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 17.5,
    marginBottom: 14,
  },
  contactSupportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
  },
  contactSupportBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
