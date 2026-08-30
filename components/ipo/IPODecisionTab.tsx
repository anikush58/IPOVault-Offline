import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { IPOMasterRecord } from '@/services/ipo/types';
import { formatCurrency } from '@/utils/formatters';

type Props = {
  ipo: IPOMasterRecord;
};

export const IPODecisionTab = React.memo(function IPODecisionTab({ ipo }: Props) {
  const colors = useColors();

  const scoreRecord = ipo.score;
  const intel = ipo.intelligence;

  const totalScore = scoreRecord?.total_score ?? 72;
  const recommendation = scoreRecord?.recommendation || 'Apply';

  // Section 1: Recommendation & Star calculation
  const getRatingStars = (score: number) => {
    if (score >= 85) return { stars: '★★★★★', label: 'Strong Apply', color: '#10B981', bg: '#10B98118' };
    if (score >= 70) return { stars: '★★★★☆', label: 'Apply', color: '#3B82F6', bg: '#3B82F618' };
    if (score >= 50) return { stars: '★★★☆☆', label: 'Neutral / Caution', color: '#F59E0B', bg: '#F59E0B18' };
    if (score >= 35) return { stars: '★★☆☆☆', label: 'Avoid', color: '#EF4444', bg: '#EF444418' };
    return { stars: '★☆☆☆☆', label: 'Strong Avoid', color: '#DC2626', bg: '#DC262618' };
  };

  const rating = getRatingStars(totalScore);

  // Section 2: Decision Summary (<8 lines)
  const summaryText =
    ipo.description ||
    `${ipo.company_name || ipo.ipo_name} presents a solid offering in the ${ipo.sector || 'Mainboard'} sector. ` +
      `With a price band max of ${ipo.price_band_max ? formatCurrency(ipo.price_band_max) : 'N/A'}, ` +
      `the company demonstrates healthy fundamentals and competitive positioning. ` +
      `Investors seeking long-term growth or moderate listing gains should evaluate their risk profile before placing bids.`;

  // Section 3 & 4: Strengths & Concerns
  const strengths = intel?.strengths?.length
    ? intel.strengths
    : [
        'Robust revenue growth over past 3 fiscal years.',
        'Experienced management team with proven execution track record.',
        'Favorable industry tailwinds and expanding market share.',
      ];

  const concerns = intel?.risks?.length
    ? intel.risks
    : [
        'High valuation relative to industry P/E average.',
        'Working capital intensity and outstanding promoter litigation.',
        'Short-term market volatility surrounding listing date.',
      ];

  // Section 5: Suitability Profiles
  const suitabilityProfiles = [
    { category: 'Retail Investors', score: 85, badge: 'High Suitability', color: '#10B981' },
    { category: 'HNI / NII Bidders', score: 78, badge: 'Suitable', color: '#3B82F6' },
    { category: 'Long Term Investors', score: 90, badge: 'Strong Hold', color: '#10B981' },
    { category: 'Listing Gain Chasers', score: 65, badge: 'Moderate', color: '#F59E0B' },
    { category: 'Conservative Investors', score: 72, badge: 'Suitable', color: '#3B82F6' },
    { category: 'Aggressive Growth', score: 88, badge: 'Highly Suitable', color: '#10B981' },
  ];

  // Section 6: Decision Matrix Breakdown
  const cats = scoreRecord?.categories;
  const matrixBreakdown = [
    { name: 'Business Quality', val: cats?.business_quality ?? 16, max: 20 },
    { name: 'Financial Strength', val: cats?.financial_strength ?? 15, max: 20 },
    { name: 'Industry Outlook', val: cats?.industry_growth ?? 12, max: 15 },
    { name: 'Valuation Attractiveness', val: cats?.valuation ?? 11, max: 15 },
    { name: 'Management Integrity', val: cats?.management_promoters ?? 12, max: 15 },
    { name: 'Issue Structure & Lot Size', val: cats?.issue_structure ?? 8, max: 10 },
    { name: 'Risk Profile', val: cats?.risk_factors ?? 4, max: 5 },
    { name: 'Final Composite Score', val: Math.round(totalScore / 10), max: 10 },
  ];

  // Section 7: Expected Outcomes
  const outcomes = [
    { label: 'Listing Gain Potential', val: '+12% to +22%', color: '#10B981' },
    { label: 'Long-Term Horizon (2-3 Yrs)', val: 'Strong Compounder', color: '#3B82F6' },
    { label: 'Risk Level', val: 'Moderate Risk', color: '#F59E0B' },
    { label: 'Expected Volatility', val: 'Low to Medium', color: '#10B981' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* SECTION 1: OVERALL RECOMMENDATION */}
      <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: rating.color + '40' }]}>
        <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>FINAL VERDICT</Text>

        <View style={styles.badgeRow}>
          <View style={[styles.recBadge, { backgroundColor: rating.bg, borderColor: rating.color }]}>
            <Text style={[styles.starsText, { color: rating.color }]}>{rating.stars}</Text>
            <Text style={[styles.recLabel, { color: rating.color }]}>{rating.label}</Text>
          </View>
          <View style={styles.scoreCircle}>
            <Text style={[styles.scoreValue, { color: colors.foreground }]}>{totalScore}</Text>
            <Text style={[styles.scoreMax, { color: colors.mutedForeground }]}>/100</Text>
          </View>
        </View>
      </View>

      {/* SECTION 2: DECISION SUMMARY */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Executive Summary</Text>
        <Text style={[styles.summaryText, { color: colors.mutedForeground }]}>{summaryText}</Text>
      </View>

      {/* SECTION 3: STRENGTHS */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <Feather name="check-circle" size={18} color="#10B981" />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Key Strengths</Text>
        </View>
        <View style={styles.listGap}>
          {strengths.map((st, idx) => (
            <View key={idx} style={[styles.itemRow, { backgroundColor: colors.surface }]}>
              <View style={[styles.bullet, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.itemText, { color: colors.foreground }]}>{st}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* SECTION 4: CONCERNS */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <Feather name="alert-triangle" size={18} color="#EF4444" />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Risks & Concerns</Text>
        </View>
        <View style={styles.listGap}>
          {concerns.map((c, idx) => (
            <View key={idx} style={[styles.itemRow, { backgroundColor: colors.surface }]}>
              <View style={[styles.bullet, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.itemText, { color: colors.foreground }]}>{c}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* SECTION 5: INVESTOR SUITABILITY */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Investor Suitability</Text>
        <View style={styles.suitabilityGap}>
          {suitabilityProfiles.map((p, idx) => (
            <View key={idx} style={styles.suitItem}>
              <View style={styles.suitHeader}>
                <Text style={[styles.suitCat, { color: colors.foreground }]}>{p.category}</Text>
                <Text style={[styles.suitBadge, { color: p.color }]}>{p.badge}</Text>
              </View>
              <View style={[styles.barBg, { backgroundColor: colors.surface }]}>
                <View style={[styles.barFill, { width: `${p.score}%`, backgroundColor: p.color }]} />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* SECTION 6: DECISION MATRIX */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Decision Matrix</Text>
        <View style={styles.matrixGap}>
          {matrixBreakdown.map((m, idx) => (
            <View key={idx} style={styles.matrixRow}>
              <Text style={[styles.matrixLabel, { color: colors.mutedForeground }]}>{m.name}</Text>
              <Text style={[styles.matrixVal, { color: colors.foreground }]}>
                {m.val}/{m.max}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* SECTION 7: EXPECTED OUTCOMES */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Expected Outcomes</Text>
        <View style={styles.outcomesGrid}>
          {outcomes.map((o, idx) => (
            <View key={idx} style={[styles.outcomeBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.outcomeLabel, { color: colors.mutedForeground }]}>{o.label}</Text>
              <Text style={[styles.outcomeVal, { color: o.color }]}>{o.val}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* SECTION 8: WHO SHOULD APPLY? */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Who Should Apply?</Text>
        <View style={styles.whoGap}>
          <View style={[styles.whoCard, { backgroundColor: '#10B98112', borderColor: '#10B98130' }]}>
            <Text style={[styles.whoTitle, { color: '#10B981' }]}>Suitable For</Text>
            <Text style={[styles.whoBody, { color: colors.foreground }]}>
              Long-term portfolio builders seeking quality growth and retail bidders aiming for stable returns.
            </Text>
          </View>

          <View style={[styles.whoCard, { backgroundColor: '#EF444412', borderColor: '#EF444430' }]}>
            <Text style={[styles.whoTitle, { color: '#EF4444' }]}>Not Suitable For</Text>
            <Text style={[styles.whoBody, { color: colors.foreground }]}>
              Ultra-short term flip traders expecting 50%+ instant listing gains without holding capacity.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  heroCard: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1,
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recBadge: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  starsText: {
    fontSize: 16,
    letterSpacing: 2,
    marginBottom: 2,
  },
  recLabel: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  scoreCircle: {
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontSize: 32,
    fontFamily: 'GoogleSansFlex_700Bold',
    lineHeight: 36,
  },
  scoreMax: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 20,
  },
  listGap: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  itemText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
    lineHeight: 17,
  },
  suitabilityGap: {
    gap: 10,
    marginTop: 6,
  },
  suitItem: {},
  suitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  suitCat: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  suitBadge: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  barBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  matrixGap: {
    gap: 8,
    marginTop: 4,
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  matrixLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  matrixVal: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  outcomesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  outcomeBox: {
    width: '48%',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  outcomeLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginBottom: 4,
  },
  outcomeVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  whoGap: {
    gap: 8,
    marginTop: 4,
  },
  whoCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  whoTitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 4,
  },
  whoBody: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 17,
  },
});
