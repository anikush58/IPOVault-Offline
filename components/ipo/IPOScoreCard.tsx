import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { IPOScoreRecord } from '@/services/ipo/types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  scoreRecord?: IPOScoreRecord;
};

export function IPOScoreCard({ scoreRecord }: Props) {
  const colors = useColors();
  const animatedValue = useRef(new Animated.Value(0)).current;

  const totalScore = scoreRecord?.total_score || 0;
  const recommendation = scoreRecord?.recommendation || 'Neutral';

  useEffect(() => {
    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      toValue: totalScore,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [totalScore, animatedValue]);

  if (!scoreRecord) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.header}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>IPOVault Score</Text>
        </View>
        <View style={[styles.emptyWrap, { backgroundColor: colors.surface }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Score calculation will be generated upon complete prospectus disclosure.
          </Text>
        </View>
      </View>
    );
  }

  const radius = 42;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  const getBadgeColor = (rec: string) => {
    switch (rec) {
      case 'Strong Apply':
        return { bg: 'rgba(16, 185, 129, 0.14)', text: '#10B981', border: 'rgba(16, 185, 129, 0.30)' };
      case 'Apply':
        return { bg: 'rgba(59, 130, 246, 0.14)', text: '#3B82F6', border: 'rgba(59, 130, 246, 0.30)' };
      case 'Neutral':
        return { bg: 'rgba(245, 158, 11, 0.14)', text: '#F59E0B', border: 'rgba(245, 158, 11, 0.30)' };
      case 'Avoid':
        return { bg: 'rgba(239, 68, 68, 0.14)', text: '#EF4444', border: 'rgba(239, 68, 68, 0.30)' };
      default:
        return { bg: colors.surface, text: colors.foreground, border: colors.border };
    }
  };

  const badgeStyle = getBadgeColor(recommendation);

  const categories = [
    { label: 'Business Quality', score: scoreRecord.categories.business_quality, max: 20 },
    { label: 'Financial Strength', score: scoreRecord.categories.financial_strength, max: 20 },
    { label: 'Industry Growth', score: scoreRecord.categories.industry_growth, max: 15 },
    { label: 'Valuation', score: scoreRecord.categories.valuation, max: 15 },
    { label: 'Management & Promoters', score: scoreRecord.categories.management_promoters, max: 15 },
    { label: 'Issue Structure', score: scoreRecord.categories.issue_structure, max: 10 },
    { label: 'Risk Factors', score: scoreRecord.categories.risk_factors, max: 5 },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Card Header & Recommendation Badge */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>DETERMINISTIC EVALUATION</Text>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>IPOVault Score</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border }]}>
          <Text style={[styles.badgeText, { color: badgeStyle.text }]}>{recommendation}</Text>
        </View>
      </View>

      {/* Circle Gauge & Total Score */}
      <View style={styles.gaugeContainer}>
        <View style={styles.svgWrap}>
          <Svg width={104} height={104}>
            {/* Background Track */}
            <Circle
              cx={52}
              cy={52}
              r={radius}
              stroke={colors.surface}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Animated Gauge Ring */}
            <AnimatedCircle
              cx={52}
              cy={52}
              r={radius}
              stroke={colors.primary}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform={`rotate(-90 52 52)`}
            />
          </Svg>
          <View style={styles.scoreCenter}>
            <Text style={[styles.scoreNum, { color: colors.foreground }]}>{totalScore.toFixed(0)}</Text>
            <Text style={[styles.scoreMax, { color: colors.mutedForeground }]}>/ 100</Text>
          </View>
        </View>

        <View style={styles.overallExpWrap}>
          <Text style={[styles.overallExpText, { color: colors.secondaryForeground }]}>
            {scoreRecord.explanations?.overall || 'Evaluated across fundamental business metrics, financial strength, and industry positioning.'}
          </Text>
        </View>
      </View>

      {/* Category Breakdowns */}
      <View style={[styles.categoriesList, { borderTopColor: colors.border }]}>
        {categories.map((cat, idx) => {
          const pct = (cat.score / cat.max) * 100;
          return (
            <View key={idx} style={styles.catItem}>
              <View style={styles.catHeader}>
                <Text style={[styles.catLabel, { color: colors.foreground }]}>{cat.label}</Text>
                <Text style={[styles.catVal, { color: colors.primary }]}>
                  {cat.score.toFixed(1)} / {cat.max}
                </Text>
              </View>
              <View style={[styles.catTrack, { backgroundColor: colors.surface }]}>
                <View
                  style={[
                    styles.catFill,
                    { width: `${pct}%`, backgroundColor: colors.primary },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  gaugeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  svgWrap: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  scoreNum: {
    fontSize: 24,
    fontFamily: 'GoogleSansFlex_700Bold',
    lineHeight: 28,
  },
  scoreMax: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  overallExpWrap: {
    flex: 1,
  },
  overallExpText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 19,
  },
  categoriesList: {
    borderTopWidth: 1,
    paddingTop: 14,
    gap: 10,
  },
  catItem: {},
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  catLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  catVal: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  catTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  catFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyWrap: {
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    fontStyle: 'italic',
  },
});
