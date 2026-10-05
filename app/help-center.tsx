import React, { useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
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
import { IconButton } from '@/components/ui/IconButton';

interface GuideArticle {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  steps?: { step: number; title: string; desc: string }[];
  infoNote?: string;
  tipNote?: string;
}

const GUIDE_ARTICLES: GuideArticle[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    subtitle: 'Learn the basics of IPOVault',
    icon: 'book-open',
    iconColor: '#3B82F6',
    iconBg: 'rgba(59, 130, 246, 0.12)',
    infoNote: 'IPOVault is an offline-first IPO tracking and management tool designed for Indian markets (NSE / BSE).',
    steps: [
      { step: 1, title: 'Add Applicants', desc: 'Create family profiles with Demat and PAN in the Users tab.' },
      { step: 2, title: 'Explore IPOs', desc: 'Check upcoming, live, and closed Mainboard and SME IPOs in IPO Hub.' },
      { step: 3, title: 'Record Bids', desc: 'Add your bids and UPI transactions to track allotment automatically.' },
      { step: 4, title: 'Connect Broker', desc: 'Link Upstox or other supported brokers to monitor live LTP and holdings.' },
    ],
    tipNote: 'Your data is always stored locally on your device using SQLite.',
  },
  {
    id: 'ipo-applications',
    title: 'IPO Applications',
    subtitle: 'How to apply and track IPOs',
    icon: 'file-text',
    iconColor: '#3B82F6',
    iconBg: 'rgba(59, 130, 246, 0.12)',
    infoNote: 'You can apply for IPOs using your linked broker accounts or UPI ASBA and track everything in one place.',
    steps: [
      { step: 1, title: 'Open IPO Hub', desc: 'Go to the IPO Hub tab to see all active and upcoming IPOs.' },
      { step: 2, title: 'Select an IPO', desc: 'Tap on an IPO to view details like issue price, dates, and lot size.' },
      { step: 3, title: 'Add Application', desc: 'Tap on "Apply" or "Add Bid" and fill in the required applicant details.' },
      { step: 4, title: 'Track Status', desc: 'Your application appears in the Applications tab and updates automatically upon allotment.' },
    ],
    tipNote: 'Make sure your broker account is connected to automatically track allotment results and live profits.',
  },
  {
    id: 'allotment-results',
    title: 'Allotment Results',
    subtitle: 'Check and understand results',
    icon: 'pie-chart',
    iconColor: '#F43F5E',
    iconBg: 'rgba(244, 63, 94, 0.12)',
    infoNote: 'Allotments are finalized by official registrars (Link Intime, KFintech, Bigshare, Skyline) late in the evening.',
    steps: [
      { step: 1, title: 'Check Date', desc: 'Refer to the Allotment Date on the IPO card.' },
      { step: 2, title: 'Query Registrar', desc: 'IPOVault automatically queries registrar endpoints using your PAN/Application number.' },
      { step: 3, title: 'Inspect Status', desc: 'View allotted shares, refund status, and listing day profit projections.' },
    ],
    tipNote: 'Registrars upload allotment in phases. If not found at 10 PM, re-check early next morning.',
  },
  {
    id: 'broker-integration',
    title: 'Broker Integration',
    subtitle: 'Connect brokers and view holdings',
    icon: 'link',
    iconColor: '#8B5CF6',
    iconBg: 'rgba(139, 92, 246, 0.12)',
    infoNote: 'Connect your Upstox or other broker accounts to sync live quotes, holdings, and portfolio valuations.',
    steps: [
      { step: 1, title: 'Go to Users & Brokers', desc: 'Open the user profile and tap "Connect Broker".' },
      { step: 2, title: 'Authenticate Securely', desc: 'Log in directly via official broker OAuth. Your credentials are never stored by IPOVault.' },
      { step: 3, title: 'Live Quotes & LTP', desc: 'IPOVault matches your allotted securities to live NSE/BSE market LTP seamlessly.' },
    ],
  },
  {
    id: 'cloud-sync',
    title: 'Cloud Sync & Backup',
    subtitle: 'Keep your data safe',
    icon: 'cloud',
    iconColor: '#0EA5E9',
    iconBg: 'rgba(14, 165, 233, 0.12)',
    infoNote: 'Sync your data securely with Google Firebase cloud for multi-device backup and seamless restore.',
    steps: [
      { step: 1, title: 'Sign In', desc: 'Sign in with your Google account in Settings > Account.' },
      { step: 2, title: 'Sync to Cloud', desc: 'Tap "Sync Now" in Data & Backup to create a snapshot.' },
      { step: 3, title: 'Restore Anywhere', desc: 'On a new device, sign in and tap "Restore from Cloud" to reload all your data.' },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    subtitle: 'Fix common issues',
    icon: 'tool',
    iconColor: '#64748B',
    iconBg: 'rgba(100, 116, 139, 0.12)',
    infoNote: 'Quick solutions for common synchronization, display, or registrar connection questions.',
    steps: [
      { step: 1, title: 'Pull to Refresh', desc: 'Swipe down on the Dashboard or IPO Hub to fetch latest quotes and IPO listing data.' },
      { step: 2, title: 'Re-authenticate Broker', desc: 'If live LTP shows expired token, reconnect your broker under User settings.' },
      { step: 3, title: 'Export Backup', desc: 'Always export a local JSON copy from Settings > Data & Backup before major device upgrades.' },
    ],
  },
  {
    id: 'privacy-security',
    title: 'Privacy & Security',
    subtitle: 'Your data and security',
    icon: 'shield',
    iconColor: '#3B82F6',
    iconBg: 'rgba(59, 130, 246, 0.12)',
    infoNote: 'IPOVault is strictly private. Your financial records and personal PAN information never leave your local database without explicit cloud sync.',
  },
  {
    id: 'app-updates',
    title: 'App Updates',
    subtitle: "What's new in latest version",
    icon: 'star',
    iconColor: '#F59E0B',
    iconBg: 'rgba(245, 158, 11, 0.12)',
    infoNote: 'Version 2.3.0 brings performance improvements, staged cloud sync, live Upstox LTP, and redesigned Settings hub.',
  },
];

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
      'You can use either:\n1. Cloud Backup: Sign in with Google in Settings, tap "Sync Now", then tap "Restore from Cloud" on your new device.\n2. Local Export: Go to Settings > Data & Backup > Local Backup, export the JSON file, and import it on your other phone.',
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
  const [selectedArticle, setSelectedArticle] = useState<GuideArticle | null>(null);
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);

  const filteredArticles = GUIDE_ARTICLES.filter((art) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return art.title.toLowerCase().includes(q) || art.subtitle.toLowerCase().includes(q);
  });

  const filteredFaqs = FAQ_LIST.filter((faq) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return faq.question.toLowerCase().includes(q) || faq.answer.toLowerCase().includes(q);
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
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 56, backgroundColor: colors.background }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>SETTINGS</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Help Center</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
          Find answers and learn more about IPOVault
        </Text>

        {/* Search Bar */}
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            placeholder="Search help articles, FAQs..."
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

        {/* Guide Topics Section */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 18 }]}>
          GUIDES & ARTICLES
        </Text>

        <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {filteredArticles.map((article, idx) => {
            const isLast = idx === filteredArticles.length - 1;
            return (
              <TouchableOpacity
                key={article.id}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedArticle(article);
                }}
                style={[
                  styles.articleRow,
                  !isLast && { borderBottomWidth: 1, borderBottomColor: isDark ? '#1F2937' : '#F3F4F6' },
                ]}
              >
                <View style={[styles.articleIconWrap, { backgroundColor: article.iconBg }]}>
                  <Feather name={article.icon as any} size={18} color={article.iconColor} />
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.articleTitle, { color: colors.foreground }]}>{article.title}</Text>
                  <Text style={[styles.articleSubtitle, { color: colors.mutedForeground }]}>
                    {article.subtitle}
                  </Text>
                </View>

                <Feather name="chevron-right" size={18} color={isDark ? '#4B5563' : '#9CA3AF'} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* FAQs Accordion */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 24 }]}>
          FREQUENTLY ASKED QUESTIONS ({filteredFaqs.length})
        </Text>

        <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {filteredFaqs.map((faq, idx) => {
            const isOpen = expandedFaqId === faq.id;
            const isLast = idx === filteredFaqs.length - 1;
            return (
              <View
                key={faq.id}
                style={[
                  !isLast && { borderBottomWidth: 1, borderBottomColor: isDark ? '#1F2937' : '#F3F4F6' },
                ]}
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
          })}
        </View>

        {/* Official Registrars Directory */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 24 }]}>
          OFFICIAL REGISTRAR CONTACTS
        </Text>
        <View style={{ gap: 10 }}>
          {REGISTRARS.map((reg, idx) => (
            <View
              key={idx}
              style={[styles.registrarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.regHeader}>
                <View style={[styles.regIconBadge, { backgroundColor: '#3B82F618' }]}>
                  <Feather name="external-link" size={14} color="#3B82F6" />
                </View>
                <Text style={[styles.regTitle, { color: colors.foreground }]}>{reg.name}</Text>
              </View>

              <View style={styles.regActionRow}>
                <TouchableOpacity
                  style={[styles.regBtn, { backgroundColor: isDark ? '#262C36' : '#F3F4F6' }]}
                  onPress={() => handleOpenUrl(`tel:${reg.phone.replace(/[^0-9+]/g, '')}`)}
                >
                  <Feather name="phone" size={12} color={colors.foreground} />
                  <Text style={[styles.regBtnText, { color: colors.foreground }]}>{reg.phone}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.regBtn, { backgroundColor: isDark ? '#262C36' : '#F3F4F6' }]}
                  onPress={() => handleOpenUrl(`mailto:${reg.email}`)}
                >
                  <Feather name="mail" size={12} color={colors.foreground} />
                  <Text style={[styles.regBtnText, { color: colors.foreground }]}>Email</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.regBtn, { backgroundColor: '#2563EB18' }]}
                  onPress={() => handleOpenUrl(reg.website)}
                >
                  <Feather name="globe" size={12} color="#2563EB" />
                  <Text style={[styles.regBtnText, { color: '#2563EB' }]}>Portal</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Guide Detail Modal */}
      <Modal
        visible={!!selectedArticle}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedArticle(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedArticle(null)}>
          <Pressable
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalDragHandle} />

            <View style={styles.modalHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.modalHeaderEyebrow, { color: colors.primary }]}>GUIDE</Text>
                <Text style={[styles.modalHeaderTitle, { color: colors.foreground }]}>
                  {selectedArticle?.title}
                </Text>
                <Text style={[styles.modalHeaderSub, { color: colors.mutedForeground }]}>
                  {selectedArticle?.subtitle}
                </Text>
              </View>
              <IconButton
                name="x"
                variant="surface"
                size="sm"
                onPress={() => setSelectedArticle(null)}
              />
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 18, gap: 14 }}
            >
              {selectedArticle?.infoNote ? (
                <View
                  style={[
                    styles.infoBanner,
                    {
                      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF',
                      borderColor: isDark ? '#1D4ED8' : '#DBEAFE',
                    },
                  ]}
                >
                  <Feather name="info" size={16} color="#3B82F6" />
                  <Text style={[styles.infoBannerText, { color: isDark ? '#93C5FD' : '#1E40AF' }]}>
                    {selectedArticle.infoNote}
                  </Text>
                </View>
              ) : null}

              {selectedArticle?.steps && selectedArticle.steps.length > 0 ? (
                <View style={{ gap: 12, marginTop: 4 }}>
                  {selectedArticle.steps.map((st) => (
                    <View key={st.step} style={styles.stepItemRow}>
                      <View style={[styles.stepNumberBadge, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.stepNumberText, { color: colors.primaryForeground }]}>
                          {st.step}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.stepItemTitle, { color: colors.foreground }]}>
                          {st.title}
                        </Text>
                        <Text style={[styles.stepItemDesc, { color: colors.mutedForeground }]}>
                          {st.desc}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {selectedArticle?.tipNote ? (
                <View
                  style={[
                    styles.tipBanner,
                    {
                      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
                      borderColor: isDark ? '#B45309' : '#FDE68A',
                    },
                  ]}
                >
                  <Feather name="zap" size={16} color="#F59E0B" />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.tipBannerTitle, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                      Tip
                    </Text>
                    <Text style={[styles.tipBannerText, { color: isDark ? '#FDE68A' : '#78350F' }]}>
                      {selectedArticle.tipNote}
                    </Text>
                  </View>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                onPress={() => setSelectedArticle(null)}
              >
                <Text style={[styles.modalPrimaryBtnText, { color: colors.primaryForeground }]}>
                  Got It
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  screenSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 14,
  },
  searchBox: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.9,
    marginBottom: 8,
    paddingLeft: 4,
  },
  cardGroup: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  articleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 14,
  },
  articleIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  articleTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.1,
  },
  articleSubtitle: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  faqHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    lineHeight: 20,
  },
  faqBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 12,
  },
  faqAnswer: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 20,
  },
  registrarCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  regHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    fontFamily: 'GoogleSansFlex_700Bold',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    maxHeight: '85%',
  },
  modalDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#9CA3AF',
    alignSelf: 'center',
    marginTop: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.1)',
  },
  modalHeaderEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  modalHeaderSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
  stepItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumberBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  stepItemTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  stepItemDesc: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  tipBannerTitle: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  tipBannerText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 17,
  },
  modalPrimaryBtn: {
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryBtnText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
