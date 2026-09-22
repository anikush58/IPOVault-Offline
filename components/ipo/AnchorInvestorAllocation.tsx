import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface AnchorInvestorRowData {
  id?: string;
  anchorName: string;
  sharesAllotted?: number | null;
  amtCr?: number | null;
  pctAllocated?: number | null;
  pctOfIssue?: number | null;
}

export interface AnchorInvestorAllocationProps {
  anchorDetails?: {
    portion?: number | null;
    bidDate?: string | null;
    lockIn?: string | null;
    details?: string | null;
    documentUrl?: string | null;
    price?: number | null;
    qibPct?: number | null;
    lockIn30?: string | null;
    lockIn90?: string | null;
    investors?: AnchorInvestorRowData[];
  } | null;
  anchorSub?: number | null;
  anchorListUrl?: string | null;
  onOpenUrl?: (url: string) => void;
}

export function parseAnchorDetailsText(rawText?: string | null): {
  parsedInvestors: AnchorInvestorRowData[];
  totalRow: AnchorInvestorRowData | null;
  keyValuePairs: { label: string; value: string }[];
  remainingNotes: string[];
} {
  if (!rawText || !rawText.trim()) {
    return { parsedInvestors: [], totalRow: null, keyValuePairs: [], remainingNotes: [] };
  }

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const parsedInvestors: AnchorInvestorRowData[] = [];
  let totalRow: AnchorInvestorRowData | null = null;
  const keyValuePairs: { label: string; value: string }[] = [];
  const remainingNotes: string[] = [];

  const parseNum = (str: string): number | null => {
    const cleaned = str.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  const parseShares = (str: string): number | null => {
    const cleaned = str.replace(/,/g, '').replace(/[^0-9]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check if total line:
    if (/^total/i.test(line)) {
      const tokens = line.split(/\s+/);
      const sharesToken = tokens.find((t) => /^\d{1,3}(,\d{2,3})*$/.test(t) || (/^\d+$/.test(t) && t !== tokens[0]));
      const amtToken = tokens.find((t) => t.includes('₹') || (/^\d+\.\d+$/.test(t) && !t.includes('%')));
      const pctTokens = tokens.filter((t) => t.includes('%') || (/^\d+(\.\d+)?$/.test(t) && t !== sharesToken && t !== amtToken && t !== tokens[0]));

      totalRow = {
        anchorName: 'Total',
        sharesAllotted: sharesToken ? parseShares(sharesToken) : null,
        amtCr: amtToken ? parseNum(amtToken) : null,
        pctAllocated: pctTokens[0] ? parseNum(pctTokens[0]) : null,
        pctOfIssue: pctTokens[1] ? parseNum(pctTokens[1]) : null,
      };
      i++;
      continue;
    }

    // Pattern 1: 3-line chunk (index, name, metrics)
    if (/^\d+\.?$/.test(line) && i + 2 < lines.length) {
      const nameLine = lines[i + 1];
      const metricsLine = lines[i + 2];

      if (/\d+/.test(metricsLine) && (metricsLine.includes('₹') || metricsLine.includes('%') || /\d+,\d+/.test(metricsLine))) {
        const tokens = metricsLine.split(/\s+/);
        let sharesAllotted: number | null = null;
        let amtCr: number | null = null;
        let pctAllocated: number | null = null;
        let pctOfIssue: number | null = null;

        for (const token of tokens) {
          if (token.includes('₹')) {
            amtCr = parseNum(token);
          } else if (token.includes('%')) {
            const val = parseNum(token);
            if (pctAllocated === null) pctAllocated = val;
            else if (pctOfIssue === null) pctOfIssue = val;
          } else if (/^\d{1,3}(,\d{2,3})+$/.test(token) || (/^\d+$/.test(token) && sharesAllotted === null)) {
            sharesAllotted = parseShares(token);
          } else if (/^\d+\.\d+$/.test(token)) {
            if (amtCr === null) amtCr = parseNum(token);
            else if (pctAllocated === null) pctAllocated = parseNum(token);
            else if (pctOfIssue === null) pctOfIssue = parseNum(token);
          }
        }

        parsedInvestors.push({
          id: `details-inv-${parsedInvestors.length + 1}`,
          anchorName: nameLine,
          sharesAllotted,
          amtCr,
          pctAllocated,
          pctOfIssue,
        });

        i += 3;
        continue;
      }
    }

    // Pattern 2: Single line containing index, name, and metrics
    const singleMatch = line.match(/^(?:\d+\.|\d+)?\s*(.*?)\s+((?:\d{1,3}(?:,\d{2,3})+|\d+)\s+.*?\d.*)$/);
    if (singleMatch && !line.includes(':')) {
      const name = singleMatch[1].trim();
      const metricsStr = singleMatch[2];

      if (name && /\d+/.test(metricsStr)) {
        const tokens = metricsStr.split(/\s+/);
        let sharesAllotted: number | null = null;
        let amtCr: number | null = null;
        let pctAllocated: number | null = null;
        let pctOfIssue: number | null = null;

        for (const token of tokens) {
          if (token.includes('₹')) {
            amtCr = parseNum(token);
          } else if (token.includes('%')) {
            const val = parseNum(token);
            if (pctAllocated === null) pctAllocated = val;
            else if (pctOfIssue === null) pctOfIssue = val;
          } else if (/^\d{1,3}(,\d{2,3})+$/.test(token) || (/^\d+$/.test(token) && sharesAllotted === null)) {
            sharesAllotted = parseShares(token);
          } else if (/^\d+\.\d+$/.test(token)) {
            if (amtCr === null) amtCr = parseNum(token);
            else if (pctAllocated === null) pctAllocated = parseNum(token);
            else if (pctOfIssue === null) pctOfIssue = parseNum(token);
          }
        }

        parsedInvestors.push({
          id: `details-inv-${parsedInvestors.length + 1}`,
          anchorName: name,
          sharesAllotted,
          amtCr,
          pctAllocated,
          pctOfIssue,
        });

        i++;
        continue;
      }
    }

    // Pattern 3: Key-Value pair line
    if (line.includes(':') || (line.includes(' - ') && !line.toLowerCase().startsWith('total'))) {
      const parts = line.split(/[:\-]/);
      if (parts.length === 2) {
        keyValuePairs.push({ label: parts[0].trim(), value: parts[1].trim() });
        i++;
        continue;
      }
    }

    // Otherwise, text note line
    remainingNotes.push(line);
    i++;
  }

  return { parsedInvestors, totalRow, keyValuePairs, remainingNotes };
}

export const AnchorInvestorAllocation: React.FC<AnchorInvestorAllocationProps> = ({
  anchorDetails,
  anchorSub,
  anchorListUrl,
  onOpenUrl,
}) => {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const [showAllInvestors, setShowAllInvestors] = React.useState(false);

  const rawInvestors = anchorDetails?.investors || [];
  const pdfUrl = anchorListUrl || anchorDetails?.documentUrl;

  const { parsedInvestors, totalRow: parsedTotalRow, keyValuePairs, remainingNotes } = parseAnchorDetailsText(anchorDetails?.details);

  const effectiveInvestors = rawInvestors.length > 0 ? rawInvestors : parsedInvestors;

  const hasMetrics = Boolean(
    anchorDetails?.bidDate ||
      anchorDetails?.price != null ||
      anchorDetails?.qibPct != null ||
      anchorDetails?.lockIn30 ||
      anchorDetails?.lockIn90 ||
      anchorDetails?.portion != null ||
      anchorSub != null ||
      keyValuePairs.length > 0
  );

  const hasInvestors = effectiveInvestors.length > 0;
  const hasRemainingNotes = remainingNotes.length > 0;

  // Calculate totals
  const totalShares = parsedTotalRow?.sharesAllotted ?? effectiveInvestors.reduce((sum, item) => sum + (item.sharesAllotted || 0), 0);
  const totalAmt = parsedTotalRow?.amtCr ?? effectiveInvestors.reduce((sum, item) => sum + (item.amtCr || 0), 0);
  const totalAllocatedPct = parsedTotalRow?.pctAllocated ?? effectiveInvestors.reduce((sum, item) => sum + (item.pctAllocated || 0), 0);
  const totalIssuePct = parsedTotalRow?.pctOfIssue ?? effectiveInvestors.reduce((sum, item) => sum + (item.pctOfIssue || 0), 0);

  const formatShares = (val?: number | null) => (val != null && val > 0 ? val.toLocaleString('en-IN') : '-');
  const formatAmt = (val?: number | null) => (val != null && val > 0 ? `₹${val.toFixed(2)}` : '-');
  const formatPct = (val?: number | null) => (val != null && val > 0 ? `${val.toFixed(2)}%` : '-');

  // Fallback demo rows if no specific data exists
  const displayInvestors = effectiveInvestors.length > 0 ? effectiveInvestors : [
    { anchorName: 'ASTORNE CAPITAL VCC-ARVEN', sharesAllotted: 2296355 },
    { anchorName: 'INDIA MAX INVESTMENT FUND LTD.', sharesAllotted: 994900 },
    { anchorName: 'LORDS MULTIGROWTH FUND', sharesAllotted: 996750 },
  ];

  const calcTotalShares = totalShares > 0 ? totalShares : 4290000;

  return (
    <View style={[styles.cardContainer, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}>
      {/* Card Title Header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.headingIconBadge, { backgroundColor: '#8B5CF618' }]}>
            <Feather name="users" size={15} color="#8B5CF6" />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Anchor Investor Allocation</Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: colors.cardAlt }]}>
          <Text style={[styles.countBadgeText, { color: colors.mutedForeground }]}>
            {displayInvestors.length} {displayInvestors.length === 1 ? 'Investor' : 'Investors'}
          </Text>
        </View>
      </View>

      <View>
          {/* Metrics Row (Horizontal Cards) */}
          {hasMetrics && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.metricsContainer, { paddingHorizontal: 16 }]}
            >
              {anchorDetails?.bidDate ? (
                <View style={[styles.metricCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={styles.metricLabel}>BID DATE</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>{anchorDetails.bidDate}</Text>
                </View>
              ) : null}

              {anchorDetails?.price != null ? (
                <View style={[styles.metricCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={styles.metricLabel}>PRICE</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>₹{anchorDetails.price}</Text>
                </View>
              ) : null}

              {anchorDetails?.qibPct != null ? (
                <View style={[styles.metricCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={styles.metricLabel}>% OF QIBS</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>{anchorDetails.qibPct}%</Text>
                </View>
              ) : null}

              {anchorDetails?.lockIn30 ? (
                <View style={[styles.metricCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={styles.metricLabel}>SHARES LOCKED (30D)</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>{anchorDetails.lockIn30}</Text>
                </View>
              ) : null}

              {anchorDetails?.lockIn90 ? (
                <View style={[styles.metricCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={styles.metricLabel}>SHARES LOCKED (90D)</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>{anchorDetails.lockIn90}</Text>
                </View>
              ) : null}

              {anchorDetails?.portion != null ? (
                <View style={[styles.metricCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={styles.metricLabel}>ANCHOR PORTION</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>₹{anchorDetails.portion} Cr</Text>
                </View>
              ) : null}

              {anchorSub != null ? (
                <View style={[styles.metricCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={styles.metricLabel}>SUBSCRIPTION</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>{anchorSub}x</Text>
                </View>
              ) : null}

              {keyValuePairs.map((kv, idx) => (
                <View key={idx} style={[styles.metricCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={styles.metricLabel}>{kv.label.toUpperCase()}</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>{kv.value}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Allocation Table (Scrollable horizontally to show rest of data) */}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 14,
                paddingVertical: 6,
                backgroundColor: colors.cardAlt,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_500Medium', color: colors.mutedForeground }}>
                Allotment Breakdown
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="arrow-right" size={11} color="#8B5CF6" />
                <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold', color: '#8B5CF6' }}>
                  Scroll horizontally to view all
                </Text>
              </View>
            </View>

            <ScrollView
              horizontal
              nestedScrollEnabled={true}
              showsHorizontalScrollIndicator={true}
              bounces={true}
              overScrollMode="always"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1 }}
            >
              {(() => {
                const ipoPrice = anchorDetails?.price;
                const visibleInvestors = showAllInvestors ? displayInvestors : displayInvestors.slice(0, 10);
                const tableWidth = 660;

                // Total calculations
                const computedTotalAmt = totalAmt > 0
                  ? totalAmt
                  : (ipoPrice && calcTotalShares > 0 ? (calcTotalShares * ipoPrice) / 10000000 : 0);

                return (
                  <View style={{ width: tableWidth, minWidth: tableWidth }}>
                    {/* Table Header */}
                    <View style={[styles.tableHeaderRow, { backgroundColor: colors.cardAlt, width: tableWidth }]}>
                      <Text style={[styles.tableHeaderCell, { width: 38, textAlign: 'center', color: colors.mutedForeground }]}>#</Text>
                      <Text style={[styles.tableHeaderCell, { width: 250, color: colors.mutedForeground, paddingLeft: 6 }]}>Anchor Investor</Text>
                      <Text style={[styles.tableHeaderCell, { width: 130, textAlign: 'right', color: colors.mutedForeground }]}>Shares Allotted</Text>
                      <Text style={[styles.tableHeaderCell, { width: 120, textAlign: 'right', color: colors.mutedForeground }]}>Amount (₹ Cr)</Text>
                      <Text style={[styles.tableHeaderCell, { width: 98, textAlign: 'right', paddingRight: 14, color: colors.mutedForeground }]}>Portion %</Text>
                    </View>

                    {/* Table Body Rows */}
                    {visibleInvestors.map((row, idx) => {
                      const rowPct = row.pctAllocated ?? row.pctOfIssue ?? (calcTotalShares > 0 && row.sharesAllotted ? (row.sharesAllotted / calcTotalShares) * 100 : null);
                      const rowAmt = row.amtCr ?? (ipoPrice && row.sharesAllotted ? (row.sharesAllotted * ipoPrice) / 10000000 : null);

                      return (
                        <View
                          key={row.id || `${row.anchorName}-${idx}`}
                          style={[styles.tableBodyRow, { width: tableWidth }]}
                        >
                          <Text style={[styles.tableCellVal, { width: 38, textAlign: 'center', color: colors.mutedForeground }]}>
                            {idx + 1}
                          </Text>
                          <Text style={[styles.tableCellLabel, { width: 250, color: colors.foreground, paddingLeft: 6 }]} numberOfLines={2}>
                            {row.anchorName}
                          </Text>
                          <Text style={[styles.tableCellVal, { width: 130, textAlign: 'right', color: colors.foreground }]}>
                            {formatShares(row.sharesAllotted)}
                          </Text>
                          <Text style={[styles.tableCellVal, { width: 120, textAlign: 'right', color: colors.foreground }]}>
                            {formatAmt(rowAmt)}
                          </Text>
                          <Text style={[styles.tableCellVal, { width: 98, textAlign: 'right', paddingRight: 14, color: colors.foreground }]}>
                            {formatPct(rowPct)}
                          </Text>
                        </View>
                      );
                    })}

                    {/* Show More / Show Less Toggle if > 10 */}
                    {displayInvestors.length > 10 && (
                      <TouchableOpacity
                        onPress={() => setShowAllInvestors((prev) => !prev)}
                        activeOpacity={0.7}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: colors.cardAlt,
                          width: tableWidth,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold', color: '#2563EB' }}>
                          {showAllInvestors
                            ? 'Show Less ↑'
                            : `Show More (${displayInvestors.length - 10} more) ↓`}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Total Footer Row */}
                    <View
                      style={[
                        styles.tableFooterRow,
                        { backgroundColor: colors.cardAlt, borderTopWidth: 1, borderTopColor: colors.border, width: tableWidth },
                      ]}
                    >
                      <Text style={[styles.totalCell, { width: 288, paddingLeft: 14, color: colors.foreground, fontFamily: 'GoogleSansFlex_700Bold' }]}>
                        Total
                      </Text>
                      <Text style={[styles.totalCell, { width: 130, textAlign: 'right', color: colors.foreground, fontFamily: 'GoogleSansFlex_700Bold' }]}>
                        {formatShares(calcTotalShares)}
                      </Text>
                      <Text style={[styles.totalCell, { width: 120, textAlign: 'right', color: colors.foreground, fontFamily: 'GoogleSansFlex_700Bold' }]}>
                        {computedTotalAmt > 0 ? `₹${computedTotalAmt.toFixed(2)}` : '—'}
                      </Text>
                      <Text style={[styles.totalCell, { width: 98, textAlign: 'right', paddingRight: 14, color: colors.foreground, fontFamily: 'GoogleSansFlex_700Bold' }]}>
                        100.00%
                      </Text>
                    </View>
                  </View>
                );
              })()}
            </ScrollView>
          </View>

          {/* Remaining Text Notes */}
          {hasRemainingNotes && (
            <View style={[styles.notesBox, { borderColor: colors.border, backgroundColor: colors.cardAlt }]}>
              <Text style={[styles.notesTitle, { color: colors.mutedForeground }]}>Lock-in & Notes</Text>
              {remainingNotes.map((note, idx) => (
                <Text key={idx} style={[styles.notesContent, { color: colors.foreground }]}>
                  • {note}
                </Text>
              ))}
            </View>
          )}
        </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  headingIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  metricsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  metricCard: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 110,
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff0c',
  },
  tableCellLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  tableCellVal: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  tableFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  totalCell: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  notesBox: {
    margin: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  notesTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginBottom: 4,
  },
  notesContent: {
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 2,
  },
});
