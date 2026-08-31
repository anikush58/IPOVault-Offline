import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';

import { IconButton } from '@/components/ui/IconButton';

export default function AddIPOManualScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const params = useLocalSearchParams<{ initialName?: string }>();

  const repo = useMemo(() => new IPORepository(db), [db]);

  // Document Upload & Extraction State
  const [parsingDoc, setParsingDoc] = useState(false);
  const [docName, setDocName] = useState<string | null>(null);
  const [parseResults, setParseResults] = useState<{
    success?: boolean;
    isScanned?: boolean;
    documentType?: string;
    fieldsCount?: number;
    extractedFieldKeys?: string[];
    warnings?: string[];
  } | null>(null);

  // Form Fields
  const [companyName, setCompanyName] = useState(params.initialName || '');
  const [ipoName, setIpoName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState<'BSE' | 'NSE' | 'BSE / NSE'>('BSE / NSE');
  const [issueType, setIssueType] = useState<'Mainboard' | 'SME'>('Mainboard');
  const [sector, setSector] = useState('');

  const [priceBandMin, setPriceBandMin] = useState('');
  const [priceBandMax, setPriceBandMax] = useState('');
  const [lotSize, setLotSize] = useState('');
  const [issueSize, setIssueSize] = useState('');

  const [openDate, setOpenDate] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [allotmentDate, setAllotmentDate] = useState('');
  const [listingDate, setListingDate] = useState('');

  const [registrar, setRegistrar] = useState('');
  const [leadManager, setLeadManager] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');

  // RHP / DRHP Document Extractor
  const handleUploadRHP = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const asset = res.assets[0];
      setDocName(asset.name);
      setParsingDoc(true);
      setParseResults(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const parsed = await repo.parseDocument(asset.uri, asset.name);

      if (parsed && parsed.success) {
        const extracted = parsed.extractedFields || {};
        const extractedKeys: string[] = [];

        // Apply non-overwriting rule: Only fill fields that are currently empty in form
        if (extracted.companyName && !companyName.trim()) {
          setCompanyName(extracted.companyName);
          if (!ipoName.trim()) setIpoName(extracted.ipoName || `${extracted.companyName} IPO`);
          extractedKeys.push('Company Name');
        }

        if (extracted.symbol && !symbol.trim()) {
          setSymbol(extracted.symbol);
          extractedKeys.push('Symbol');
        }

        if (extracted.priceBandMin !== undefined && extracted.priceBandMin !== null && !priceBandMin) {
          setPriceBandMin(String(extracted.priceBandMin));
          extractedKeys.push('Min Price');
        }

        if (extracted.priceBandMax !== undefined && extracted.priceBandMax !== null && !priceBandMax) {
          setPriceBandMax(String(extracted.priceBandMax));
          extractedKeys.push('Max Price');
        }

        if (extracted.lotSize !== undefined && extracted.lotSize !== null && !lotSize) {
          setLotSize(String(extracted.lotSize));
          extractedKeys.push('Lot Size');
        }

        if (extracted.issueSize !== undefined && extracted.issueSize !== null && !issueSize) {
          setIssueSize(String(extracted.issueSize));
          extractedKeys.push('Issue Size');
        }

        if (extracted.openDate && !openDate.trim()) {
          setOpenDate(extracted.openDate);
          extractedKeys.push('Open Date');
        }

        if (extracted.closeDate && !closeDate.trim()) {
          setCloseDate(extracted.closeDate);
          extractedKeys.push('Close Date');
        }

        if (extracted.allotmentDate && !allotmentDate.trim()) {
          setAllotmentDate(extracted.allotmentDate);
          extractedKeys.push('Allotment Date');
        }

        if (extracted.listingDate && !listingDate.trim()) {
          setListingDate(extracted.listingDate);
          extractedKeys.push('Listing Date');
        }

        if (extracted.registrar && !registrar.trim()) {
          setRegistrar(extracted.registrar);
          extractedKeys.push('Registrar');
        }

        if (extracted.issueType) {
          setIssueType(extracted.issueType);
          extractedKeys.push('Issue Type');
        }

        if (extracted.exchange) {
          setExchange(extracted.exchange);
          extractedKeys.push('Exchange');
        }

        setParseResults({
          success: true,
          isScanned: Boolean(parsed.isScanned),
          documentType: parsed.documentType || 'Document',
          fieldsCount: extractedKeys.length,
          extractedFieldKeys: extractedKeys,
          warnings: parsed.warnings || [],
        });

        Haptics.notificationAsync(
          parsed.isScanned
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Success
        );
      } else {
        setParseResults({
          success: false,
          warnings: [parsed?.error || 'Failed to extract text from document.'],
        });
      }
    } catch (err: any) {
      if (__DEV__) console.warn('[AddIPOManualScreen] RHP Parsing error', err);
      setParseResults({
        success: false,
        warnings: [err.message || 'Server extraction failed. Make sure the API server is reachable.'],
      });
    } finally {
      setParsingDoc(false);
    }
  };

  // UI / Validation State
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccess, setShowSuccess] = useState(false);

  const validateForm = async (): Promise<boolean> => {
    const errs: Record<string, string> = {};

    if (!companyName.trim()) {
      errs.companyName = 'Company name is required';
    }

    // Check duplicate in DB
    if (companyName.trim()) {
      const dups = await repo.findDuplicates(companyName.trim(), symbol.trim());
      const exactDup = dups.find(
        (d) =>
          d.company_name.toLowerCase() === companyName.trim().toLowerCase() ||
          (symbol.trim() && d.symbol.toLowerCase() === symbol.trim().toLowerCase())
      );
      if (exactDup) {
        errs.companyName = `An IPO for "${exactDup.company_name}" already exists.`;
      }
    }

    // Validate Price Band
    const minP = priceBandMin ? parseFloat(priceBandMin) : null;
    const maxP = priceBandMax ? parseFloat(priceBandMax) : null;
    if (minP !== null && maxP !== null && minP > maxP) {
      errs.priceBand = 'Minimum price band cannot be greater than maximum price band';
    }

    // Validate Dates format YYYY-MM-DD if entered
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (openDate && !dateRegex.test(openDate)) errs.openDate = 'Format: YYYY-MM-DD (e.g. 2026-08-10)';
    if (closeDate && !dateRegex.test(closeDate)) errs.closeDate = 'Format: YYYY-MM-DD (e.g. 2026-08-12)';
    if (allotmentDate && !dateRegex.test(allotmentDate)) errs.allotmentDate = 'Format: YYYY-MM-DD';
    if (listingDate && !dateRegex.test(listingDate)) errs.listingDate = 'Format: YYYY-MM-DD';

    if (openDate && closeDate && dateRegex.test(openDate) && dateRegex.test(closeDate)) {
      if (openDate > closeDate) {
        errs.closeDate = 'Close date must be after Open date';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isValid = await validateForm();
    if (!isValid) return;

    setSaving(true);
    try {
      const recordData: Partial<IPOMasterRecord> = {
        company_name: companyName.trim(),
        ipo_name: ipoName.trim() || `${companyName.trim()} IPO`,
        symbol: symbol.trim().toUpperCase(),
        exchange,
        issue_type: issueType,
        sector: sector.trim() || 'General',
        price_band_min: priceBandMin ? parseFloat(priceBandMin) : null,
        price_band_max: priceBandMax ? parseFloat(priceBandMax) : null,
        lot_size: lotSize ? parseInt(lotSize, 10) : null,
        issue_size: issueSize ? parseFloat(issueSize) : null,
        open_date: openDate.trim() || null,
        close_date: closeDate.trim() || null,
        allotment_date: allotmentDate.trim() || null,
        listing_date: listingDate.trim() || null,
        registrar: registrar.trim(),
        lead_manager: leadManager.trim(),
        website: website.trim(),
        description: notes.trim() || 'Manually created IPO entry',
      };

      const savedRecord = await repo.createManual(recordData);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccess(true);

      setTimeout(() => {
        router.replace({
          pathname: '/ipo-details' as any,
          params: { id: savedRecord.id },
        });
      }, 700);
    } catch (err) {
      if (__DEV__) console.warn('[AddIPOManualScreen] Failed to save IPO', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Top App Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background },
        ]}
      >
        <IconButton
          name="chevron-left"
          variant="surface"
          size="md"
          onPress={() => router.back()}
        />

        <View style={styles.titleWrap}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>MANUAL ENTRY</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Create IPO Manually</Text>
        </View>

        <View style={{ width: 44, height: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Upload RHP / DRHP Banner Card */}
        <TouchableOpacity
          onPress={handleUploadRHP}
          disabled={parsingDoc}
          activeOpacity={0.85}
          style={{
            backgroundColor: isDark ? '#1E1B4B44' : '#EEF2FF',
            borderWidth: 1.5,
            borderColor: isDark ? '#4338CA' : '#A5B4FC',
            borderRadius: 16,
            padding: 16,
            marginBottom: parseResults ? 12 : 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? '#312E81' : '#E0E7FF', alignItems: 'center', justifyContent: 'center' }}>
            {parsingDoc ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="file-text" size={22} color={colors.primary} />
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground }}>
              {docName ? `Uploaded: ${docName}` : 'Import from DRHP / RHP'}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground, marginTop: 2 }}>
              {parsingDoc ? 'Reading PDF & extracting IPO parameters...' : 'Upload PDF document to prefill fields automatically'}
            </Text>
          </View>

          <Feather name="upload-cloud" size={20} color={colors.primary} />
        </TouchableOpacity>

        {/* Extraction Feedback & Confidence Summary */}
        {parseResults ? (
          <View
            style={{
              backgroundColor: !parseResults.success || parseResults.isScanned
                ? isDark ? '#3F171822' : '#FFF5F5'
                : isDark ? '#064E3B22' : '#ECFDF5',
              borderWidth: 1,
              borderColor: !parseResults.success || parseResults.isScanned
                ? isDark ? '#7F1D1D55' : '#FECACA'
                : isDark ? '#05966955' : '#A7F3D0',
              borderRadius: 14,
              padding: 14,
              marginBottom: 20,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Feather
                  name={!parseResults.success ? 'alert-circle' : parseResults.isScanned ? 'alert-triangle' : 'check-circle'}
                  size={16}
                  color={!parseResults.success || parseResults.isScanned ? (isDark ? '#F87171' : '#DC2626') : (isDark ? '#34D399' : '#059669')}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: 'GoogleSansFlex_700Bold',
                    color: !parseResults.success || parseResults.isScanned ? (isDark ? '#F87171' : '#DC2626') : (isDark ? '#34D399' : '#059669'),
                    flex: 1,
                  }}
                >
                  {!parseResults.success
                    ? '⚠ Unable to Process Document'
                    : parseResults.isScanned
                    ? 'Scanned PDF Detected'
                    : `✓ ${parseResults.documentType || 'Document'} Processed (${parseResults.fieldsCount || 0} fields pre-filled)`}
                </Text>
              </View>

              {!parseResults.success ? (
                <TouchableOpacity
                  onPress={handleUploadRHP}
                  style={{
                    backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold', color: isDark ? '#FECACA' : '#991B1B' }}>Retry</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {parseResults.extractedFieldKeys && parseResults.extractedFieldKeys.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {parseResults.extractedFieldKeys.map((key) => (
                  <View
                    key={key}
                    style={{
                      backgroundColor: isDark ? '#065F46' : '#D1FAE5',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Feather name="check" size={10} color={isDark ? '#A7F3D0' : '#065F46'} />
                    <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold', color: isDark ? '#A7F3D0' : '#065F46' }}>
                      {key}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {parseResults.warnings && parseResults.warnings.length > 0 ? (
              <View style={{ marginTop: 2 }}>
                {parseResults.warnings.map((w, idx) => (
                  <Text key={idx} style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', color: !parseResults.success ? (isDark ? '#F87171' : '#DC2626') : colors.mutedForeground }}>
                    • {w}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Company & Details Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>BASIC INFORMATION</Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Company Name *</Text>
            <TextInput
              value={companyName}
              onChangeText={(t) => {
                setCompanyName(t);
                if (errors.companyName) setErrors((e) => ({ ...e, companyName: '' }));
              }}
              placeholder="e.g. Acme Technologies Ltd"
              placeholderTextColor={colors.mutedForeground + '70'}
              style={[
                styles.input,
                { backgroundColor: colors.surface, borderColor: errors.companyName ? colors.negative : colors.border, color: colors.foreground },
              ]}
            />
            {errors.companyName ? <Text style={[styles.errText, { color: colors.negative }]}>{errors.companyName}</Text> : null}
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>IPO Title</Text>
            <TextInput
              value={ipoName}
              onChangeText={setIpoName}
              placeholder="e.g. Acme Tech IPO (defaults to company name)"
              placeholderTextColor={colors.mutedForeground + '70'}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Symbol</Text>
              <TextInput
                value={symbol}
                onChangeText={(t) => setSymbol(t.toUpperCase())}
                placeholder="e.g. ACMETEC"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                autoCapitalize="characters"
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Sector</Text>
              <TextInput
                value={sector}
                onChangeText={setSector}
                placeholder="e.g. Technology"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Exchange</Text>
              <View style={styles.chipRow}>
                {(['BSE / NSE', 'NSE', 'BSE'] as const).map((ex) => (
                  <TouchableOpacity
                    key={ex}
                    onPress={() => setExchange(ex)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: exchange === ex ? colors.primary + '18' : colors.surface,
                        borderColor: exchange === ex ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: exchange === ex ? colors.primary : colors.mutedForeground }]}>
                      {ex}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Issue Type</Text>
              <View style={styles.chipRow}>
                {(['Mainboard', 'SME'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setIssueType(t)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: issueType === t ? colors.primary + '18' : colors.surface,
                        borderColor: issueType === t ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: issueType === t ? colors.primary : colors.mutedForeground }]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Investment Details */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>INVESTMENT PARAMETERS</Text>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Price Band Min (₹)</Text>
              <TextInput
                value={priceBandMin}
                onChangeText={setPriceBandMin}
                placeholder="e.g. 100"
                keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: errors.priceBand ? colors.negative : colors.border, color: colors.foreground }]}
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Price Band Max (₹)</Text>
              <TextInput
                value={priceBandMax}
                onChangeText={setPriceBandMax}
                placeholder="e.g. 108"
                keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: errors.priceBand ? colors.negative : colors.border, color: colors.foreground }]}
              />
            </View>
          </View>
          {errors.priceBand ? <Text style={[styles.errText, { color: colors.negative }]}>{errors.priceBand}</Text> : null}

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Lot Size (Shares)</Text>
              <TextInput
                value={lotSize}
                onChangeText={setLotSize}
                placeholder="e.g. 135"
                keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Issue Size (₹ Cr)</Text>
              <TextInput
                value={issueSize}
                onChangeText={setIssueSize}
                placeholder="e.g. 450"
                keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
          </View>
        </View>

        {/* Timeline Dates */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>TIMELINE DATES (YYYY-MM-DD)</Text>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Open Date</Text>
              <TextInput
                value={openDate}
                onChangeText={setOpenDate}
                placeholder="2026-08-10"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: errors.openDate ? colors.negative : colors.border, color: colors.foreground }]}
              />
              {errors.openDate ? <Text style={[styles.errText, { color: colors.negative }]}>{errors.openDate}</Text> : null}
            </View>

            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Close Date</Text>
              <TextInput
                value={closeDate}
                onChangeText={setCloseDate}
                placeholder="2026-08-12"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: errors.closeDate ? colors.negative : colors.border, color: colors.foreground }]}
              />
              {errors.closeDate ? <Text style={[styles.errText, { color: colors.negative }]}>{errors.closeDate}</Text> : null}
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Allotment Date</Text>
              <TextInput
                value={allotmentDate}
                onChangeText={setAllotmentDate}
                placeholder="2026-08-13"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>

            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Listing Date</Text>
              <TextInput
                value={listingDate}
                onChangeText={setListingDate}
                placeholder="2026-08-17"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
          </View>
        </View>

        {/* Corporate Details */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>ORGANIZATION & LINKS</Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Registrar</Text>
            <TextInput
              value={registrar}
              onChangeText={setRegistrar}
              placeholder="e.g. KFin Technologies"
              placeholderTextColor={colors.mutedForeground + '70'}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Lead Manager(s)</Text>
            <TextInput
              value={leadManager}
              onChangeText={setLeadManager}
              placeholder="e.g. ICICI Securities, Axis Capital, Kotak Mahindra"
              placeholderTextColor={colors.mutedForeground + '70'}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Website</Text>
            <TextInput
              value={website}
              onChangeText={setWebsite}
              placeholder="e.g. https://company.com"
              placeholderTextColor={colors.mutedForeground + '70'}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Notes / Description</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes about business or issue objects..."
              placeholderTextColor={colors.mutedForeground + '70'}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || showSuccess}
          style={[styles.saveBtn, { backgroundColor: showSuccess ? colors.positive : colors.primary }]}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : showSuccess ? (
            <>
              <Feather name="check" size={20} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>IPO Created Successfully!</Text>
            </>
          ) : (
            <>
              <Feather name="check-circle" size={18} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Save & Open IPO</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  field: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginBottom: 6,
  },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  textArea: {
    height: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  errText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    marginTop: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
