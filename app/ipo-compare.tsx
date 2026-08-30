import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useCompare } from '@/context/CompareContext';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';
import { CompareHeader } from '@/components/compare/CompareHeader';
import { CompareCard } from '@/components/compare/CompareCard';
import { CompareRow } from '@/components/compare/CompareRow';
import { MetricBadge } from '@/components/compare/MetricBadge';
import { EmptyCompareState } from '@/components/compare/EmptyCompareState';
import { formatCurrency, formatDate } from '@/utils/formatters';

const REC_WEIGHTS: Record<string, number> = {
  'Strong Apply': 4,
  Apply: 3,
  Neutral: 2,
  Avoid: 1,
};

export default function IPOCompareScreen() {
  const colors = useColors();
  const router = useRouter();
  const db = useSQLiteContext();
  const { width: windowWidth } = useWindowDimensions();
  const { selectedIds, removeFromCompare, clearCompare } = useCompare();

  const [loading, setLoading] = useState(true);
  const [ipos, setIpos] = useState<IPOMasterRecord[]>([]);

  const repo = useMemo(() => new IPORepository(db), [db]);

  // Load records for selected IDs
  const loadSelectedData = useCallback(async () => {
    if (selectedIds.length === 0) {
      setIpos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const records: IPOMasterRecord[] = [];
      for (const id of selectedIds) {
        const item = await repo.getById(id);
        if (item) records.push(item);
      }
      setIpos(records);
    } catch (err) {
      if (__DEV__) console.warn('[IPOCompareScreen] Failed to load IPO details', err);
    } finally {
      setLoading(false);
    }
  }, [selectedIds, repo]);

  useEffect(() => {
    loadSelectedData();
  }, [loadSelectedData]);

  // Responsive column dimensions
  const labelWidth = Math.max(120, Math.min(160, windowWidth * 0.3));
  const columnWidth = Math.max(150, Math.min(200, (windowWidth - labelWidth - 32) / Math.max(1, ipos.length)));

  // Calculate best metrics across selected IPOs
  const bestValues = useMemo(() => {
    if (ipos.length < 2) return {};

    // 1. Lower Minimum Investment
    const minInvestments = ipos.map((i) => {
      const p = i.price_band_max || i.price_band_min;
      return p && i.lot_size ? p * i.lot_size : null;
    });
    const validMinInv = minInvestments.filter((v): v is number => v !== null);
    const lowestInvestment = validMinInv.length > 1 ? Math.min(...validMinInv) : null;

    // 2. Higher IPO Score
    const scores = ipos.map((i) => i.score?.total_score ?? null);
    const validScores = scores.filter((v): v is number => v !== null);
    const highestScore = validScores.length > 1 ? Math.max(...validScores) : null;

    // 3. Better Recommendation
    const recs = ipos.map((i) => (i.score?.recommendation ? REC_WEIGHTS[i.score.recommendation] ?? 0 : null));
    const validRecs = recs.filter((v): v is number => v !== null);
    const highestRec = validRecs.length > 1 ? Math.max(...validRecs) : null;

    // 4. Higher ROE
    const roes = ipos.map((i) => {
      const peers = i.intelligence?.peer_comparison;
      return peers && peers[0] ? peers[0].roe_percent : null;
    });
    const validRoes = roes.filter((v): v is number => v !== null);
    const highestRoe = validRoes.length > 1 ? Math.max(...validRoes) : null;

    // 5. Lower PE
    const pes = ipos.map((i) => {
      const peers = i.intelligence?.peer_comparison;
      return peers && peers[0] ? peers[0].pe_ratio : null;
    });
    const validPes = pes.filter((v): v is number => v !== null);
    const lowestPe = validPes.length > 1 ? Math.min(...validPes) : null;

    return {
      lowestInvestment,
      highestScore,
      highestRec,
      highestRoe,
      lowestPe,
    };
  }, [ipos]);

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (ipos.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <CompareHeader title="IPO Compare" />
        <EmptyCompareState />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CompareHeader title="IPO Compare" onClear={clearCompare} />

      <ScrollView style={styles.flex1} contentContainerStyle={styles.scrollContent}>
        {/* Sticky Header with Cards */}
        <View style={[styles.cardsSection, { borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ width: labelWidth }} />
            {ipos.map((ipo) => (
              <View key={ipo.id} style={{ width: columnWidth, paddingHorizontal: 4 }}>
                <CompareCard ipo={ipo} onRemove={removeFromCompare} width={columnWidth - 8} />
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Main Comparison Sections */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.tableBody}>

            {/* 1. OVERVIEW */}
            <View style={styles.categoryHeader}>
              <Text style={[styles.categoryTitle, { color: colors.primary }]}>OVERVIEW</Text>
            </View>

            <CompareRow
              label="Company"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({ id: i.id, text: i.company_name || i.ipo_name }))}
            />
            <CompareRow
              label="Sector"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({
                id: i.id,
                text: i.sector || 'N/A',
                customContent: <MetricBadge text={i.sector || 'General'} variant="info" />,
              }))}
            />
            <CompareRow
              label="Exchange"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({ id: i.id, text: i.exchange || 'BSE / NSE' }))}
            />
            <CompareRow
              label="IPO Type"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({
                id: i.id,
                text: i.issue_type || 'Mainboard',
                customContent: <MetricBadge text={i.issue_type || 'Mainboard'} variant="neutral" />,
              }))}
            />

            {/* 2. INVESTMENT */}
            <View style={styles.categoryHeader}>
              <Text style={[styles.categoryTitle, { color: colors.primary }]}>INVESTMENT</Text>
            </View>

            <CompareRow
              label="Price Band"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => {
                let txt = 'TBA';
                if (i.price_band_min && i.price_band_max) {
                  txt = i.price_band_min === i.price_band_max ? formatCurrency(i.price_band_max) : `${formatCurrency(i.price_band_min)} - ${formatCurrency(i.price_band_max)}`;
                } else if (i.price_band_max) txt = formatCurrency(i.price_band_max);
                return { id: i.id, text: txt };
              })}
            />
            <CompareRow
              label="Lot Size"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({ id: i.id, text: i.lot_size ? `${i.lot_size} Shares` : 'TBA' }))}
            />
            <CompareRow
              label="Min Investment"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => {
                const p = i.price_band_max || i.price_band_min;
                const minInv = p && i.lot_size ? p * i.lot_size : null;
                const isBest = bestValues.lowestInvestment !== null && minInv === bestValues.lowestInvestment;
                return {
                  id: i.id,
                  text: minInv ? formatCurrency(minInv) : 'TBA',
                  isBest,
                };
              })}
            />
            <CompareRow
              label="Issue Size"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({ id: i.id, text: i.issue_size ? `₹${i.issue_size} Cr` : 'TBA' }))}
            />

            {/* 3. TIMELINE */}
            <View style={styles.categoryHeader}>
              <Text style={[styles.categoryTitle, { color: colors.primary }]}>TIMELINE</Text>
            </View>

            <CompareRow
              label="Open Date"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({ id: i.id, text: i.open_date ? formatDate(i.open_date) : 'TBA' }))}
            />
            <CompareRow
              label="Close Date"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({ id: i.id, text: i.close_date ? formatDate(i.close_date) : 'TBA' }))}
            />
            <CompareRow
              label="Allotment"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({ id: i.id, text: i.allotment_date ? formatDate(i.allotment_date) : 'TBA' }))}
            />
            <CompareRow
              label="Listing"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({ id: i.id, text: i.listing_date ? formatDate(i.listing_date) : 'TBA' }))}
            />

            {/* 4. BUSINESS */}
            <View style={styles.categoryHeader}>
              <Text style={[styles.categoryTitle, { color: colors.primary }]}>BUSINESS</Text>
            </View>

            <CompareRow
              label="Objects of Issue"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({
                id: i.id,
                text: i.intelligence?.objects_of_issue?.[0] || i.description || 'General Corporate Purpose',
              }))}
            />
            <CompareRow
              label="Registrar"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({ id: i.id, text: i.registrar || 'N/A' }))}
            />
            <CompareRow
              label="Lead Manager"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({ id: i.id, text: i.lead_manager || 'N/A' }))}
            />

            {/* 5. FINANCIAL */}
            <View style={styles.categoryHeader}>
              <Text style={[styles.categoryTitle, { color: colors.primary }]}>FINANCIAL</Text>
            </View>

            <CompareRow
              label="Revenue"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => {
                const fin = i.intelligence?.financials?.[i.intelligence.financials.length - 1];
                return { id: i.id, text: fin?.revenue_cr ? `₹${fin.revenue_cr} Cr` : 'N/A' };
              })}
            />
            <CompareRow
              label="PAT"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => {
                const fin = i.intelligence?.financials?.[i.intelligence.financials.length - 1];
                return { id: i.id, text: fin?.pat_cr ? `₹${fin.pat_cr} Cr` : 'N/A' };
              })}
            />
            <CompareRow
              label="Net Worth"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => {
                const fin = i.intelligence?.financials?.[i.intelligence.financials.length - 1];
                return { id: i.id, text: fin?.net_worth_cr ? `₹${fin.net_worth_cr} Cr` : 'N/A' };
              })}
            />
            <CompareRow
              label="ROE %"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => {
                const peer = i.intelligence?.peer_comparison?.[0];
                const roe = peer?.roe_percent;
                const isBest = bestValues.highestRoe !== null && roe === bestValues.highestRoe;
                return { id: i.id, text: roe !== undefined && roe !== null ? `${roe}%` : 'N/A', isBest };
              })}
            />
            <CompareRow
              label="P/E Ratio"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => {
                const peer = i.intelligence?.peer_comparison?.[0];
                const pe = peer?.pe_ratio;
                const isBest = bestValues.lowestPe !== null && pe === bestValues.lowestPe;
                return { id: i.id, text: pe !== undefined && pe !== null ? `${pe}x` : 'N/A', isBest };
              })}
            />

            {/* 6. IPO INTELLIGENCE */}
            <View style={styles.categoryHeader}>
              <Text style={[styles.categoryTitle, { color: colors.primary }]}>IPO INTELLIGENCE</Text>
            </View>

            <CompareRow
              label="IPO Score"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => {
                const score = i.score?.total_score;
                const isBest = bestValues.highestScore !== null && score === bestValues.highestScore;
                return {
                  id: i.id,
                  text: score ? `${score} / 100` : 'N/A',
                  isBest,
                };
              })}
            />
            <CompareRow
              label="Recommendation"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => {
                const rec = i.score?.recommendation || 'Neutral';
                const weight = REC_WEIGHTS[rec] ?? 0;
                const isBest = bestValues.highestRec !== null && weight === bestValues.highestRec;
                const variant = rec === 'Strong Apply' || rec === 'Apply' ? 'success' : rec === 'Avoid' ? 'warning' : 'neutral';
                return {
                  id: i.id,
                  text: rec,
                  isBest,
                  customContent: <MetricBadge text={rec} variant={isBest ? 'gold' : variant} />,
                };
              })}
            />
            <CompareRow
              label="Strengths"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({
                id: i.id,
                text: i.intelligence?.strengths?.[0] || 'Strong Market Presence',
              }))}
            />
            <CompareRow
              label="Risks"
              labelWidth={labelWidth}
              columnWidth={columnWidth}
              values={ipos.map((i) => ({
                id: i.id,
                text: i.intelligence?.risks?.[0] || 'Market Volatility',
              }))}
            />

          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  cardsSection: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tableBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  categoryHeader: {
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
  },
  categoryTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
  },
});
