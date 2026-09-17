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
  const [logoUrl, setLogoUrl] = useState('');
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState<'BSE' | 'NSE' | 'BSE / NSE'>('BSE / NSE');
  const [issueType, setIssueType] = useState<'Mainboard' | 'SME'>('Mainboard');
  const [sector, setSector] = useState('');

  const [priceBandMin, setPriceBandMin] = useState('');
  const [priceBandMax, setPriceBandMax] = useState('');
  const [lotSize, setLotSize] = useState('');
  const [issueSize, setIssueSize] = useState('');
  const [gmpPercent, setGmpPercent] = useState('');
  const [gmpAmount, setGmpAmount] = useState('');

  const handleGmpPercentChange = (val: string) => {
    setGmpPercent(val);
    const pct = parseFloat(val);
    const price = parseFloat(priceBandMax || priceBandMin);
    if (!isNaN(pct) && !isNaN(price) && price > 0) {
      const amt = (pct * price) / 100;
      setGmpAmount(Number.isInteger(amt) ? String(amt) : amt.toFixed(2).replace(/\.?0+$/, ''));
    } else if (!val) {
      setGmpAmount('');
    }
  };

  const handleGmpAmountChange = (val: string) => {
    setGmpAmount(val);
    const amt = parseFloat(val);
    const price = parseFloat(priceBandMax || priceBandMin);
    if (!isNaN(amt) && !isNaN(price) && price > 0) {
      const pct = (amt / price) * 100;
      setGmpPercent(Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, ''));
    } else if (!val) {
      setGmpPercent('');
    }
  };

  const [openDate, setOpenDate] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [allotmentDate, setAllotmentDate] = useState('');
  const [listingDate, setListingDate] = useState('');

  const [registrar, setRegistrar] = useState('');
  const [leadManager, setLeadManager] = useState('');
  const [website, setWebsite] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [registrarPhone, setRegistrarPhone] = useState('');
  const [registrarEmail, setRegistrarEmail] = useState('');
  const [ebitdaPercent, setEbitdaPercent] = useState('');
  const [roePercent, setRoePercent] = useState('');
  const [patPercent, setPatPercent] = useState('');
  const [drhpUrl, setDrhpUrl] = useState('');
  const [rhpUrl, setRhpUrl] = useState('');
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

  // JSON Document Import Handler
  const handleUploadJSON = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', 'text/*', '*/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const asset = res.assets[0];
      setDocName(asset.name);
      setParsingDoc(true);
      setParseResults(null);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }

      let content = '';
      if (Platform.OS === 'web' && (asset as any).file) {
        content = await (asset as any).file.text();
      } else {
        try {
          content = await FileSystem.readAsStringAsync(asset.uri);
        } catch {
          const resp = await fetch(asset.uri);
          content = await resp.text();
        }
      }

      if (!content || !content.trim()) {
        throw new Error('Selected JSON file is empty.');
      }

      const json = JSON.parse(content);

      // Unwrap root array or nested wrapper object if present
      let targetObj: any = json;
      if (Array.isArray(json)) {
        targetObj = json[0] || {};
      } else if (json && typeof json === 'object') {
        if (Array.isArray(json.items) && json.items.length > 0) targetObj = json.items[0];
        else if (Array.isArray(json.data) && json.data.length > 0) targetObj = json.data[0];
        else if (Array.isArray(json.ipos) && json.ipos.length > 0) targetObj = json.ipos[0];
        else if (json.data && typeof json.data === 'object' && !Array.isArray(json.data)) targetObj = json.data;
        else if (json.item && typeof json.item === 'object') targetObj = json.item;
        else if (json.ipo && typeof json.ipo === 'object') targetObj = json.ipo;
      }

      const companyObj = targetObj.company || targetObj;
      const ipoObj = targetObj.ipo || targetObj;
      const lifecycleObj = targetObj.lifecycle || targetObj;
      const docsObj = targetObj.documents || targetObj.docs || targetObj;
      const configObj = targetObj.allotmentConfig || targetObj;
      const gmpObj = targetObj.gmp || targetObj;

      const keysFilled: string[] = [];

      const cleanDateStr = (d: any): string => {
        if (!d) return '';
        const s = String(d).trim();
        if (s.includes('T')) return s.split('T')[0];
        return s;
      };

      // Company Name & IPO Name
      const cName = targetObj.companyName || targetObj.company_name || companyObj.displayName || companyObj.legalName || companyObj.companyName || companyObj.name || companyObj.company_name;
      if (cName) {
        const cleanCName = String(cName).trim();
        setCompanyName(cleanCName);
        keysFilled.push('Company Name');
        const iName = targetObj.ipoName || targetObj.ipo_name || ipoObj.ipoName || ipoObj.ipo_name || `${cleanCName} IPO`;
        setIpoName(String(iName).trim());
        keysFilled.push('IPO Name');
      } else if (targetObj.ipoName || targetObj.ipo_name || ipoObj.ipoName || ipoObj.ipo_name) {
        const iName = targetObj.ipoName || targetObj.ipo_name || ipoObj.ipoName || ipoObj.ipo_name;
        setIpoName(String(iName).trim());
        keysFilled.push('IPO Name');
      }

      // Logo URL
      const logo = targetObj.logoUrl || targetObj.logo_url || companyObj.logoUrl || companyObj.logo_url;
      if (logo) {
        setLogoUrl(String(logo).trim());
        keysFilled.push('Logo URL');
      }

      // Symbol
      const sym = targetObj.symbol || companyObj.symbol || ipoObj.symbol;
      if (sym) {
        setSymbol(String(sym).trim().toUpperCase());
        keysFilled.push('Symbol');
      }

      // Exchange
      const exVal = targetObj.exchange || ipoObj.exchange || companyObj.exchange;
      if (exVal) {
        const ex = String(exVal).toUpperCase();
        if (ex.includes('NSE') && ex.includes('BSE')) setExchange('BSE / NSE');
        else if (ex.includes('NSE')) setExchange('NSE');
        else if (ex.includes('BSE')) setExchange('BSE');
        keysFilled.push('Exchange');
      }

      // Issue Type
      const segVal = targetObj.issueType || targetObj.issue_type || targetObj.marketSegment || ipoObj.issueType || ipoObj.issue_type || ipoObj.marketSegment || companyObj.marketSegment;
      if (segVal) {
        const seg = String(segVal).toUpperCase();
        if (seg.includes('SME')) setIssueType('SME');
        else setIssueType('Mainboard');
        keysFilled.push('Issue Type');
      }

      // Sector
      const sec = targetObj.sector || companyObj.sector;
      if (sec) {
        setSector(String(sec).trim());
        keysFilled.push('Sector');
      }

      // Price Band Min
      const pMin = targetObj.priceBandMin ?? targetObj.price_band_min ?? targetObj.priceBandLow ?? ipoObj.priceBandMin ?? ipoObj.price_band_min ?? ipoObj.priceBandLow;
      if (pMin !== undefined && pMin !== null && String(pMin).trim() !== '') {
        setPriceBandMin(String(pMin).trim());
        keysFilled.push('Min Price');
      }

      // Price Band Max
      const pMax = targetObj.priceBandMax ?? targetObj.price_band_max ?? targetObj.priceBandHigh ?? targetObj.buy_price ?? ipoObj.priceBandMax ?? ipoObj.price_band_max ?? ipoObj.priceBandHigh ?? ipoObj.buy_price;
      if (pMax !== undefined && pMax !== null && String(pMax).trim() !== '') {
        setPriceBandMax(String(pMax).trim());
        keysFilled.push('Max Price');
      }

      // Lot Size
      const lot = targetObj.lotSize ?? targetObj.lot_size ?? targetObj.quantity ?? ipoObj.lotSize ?? ipoObj.lot_size ?? ipoObj.quantity;
      if (lot !== undefined && lot !== null && String(lot).trim() !== '') {
        setLotSize(String(lot).trim());
        keysFilled.push('Lot Size');
      }

      // Issue Size
      const iss = targetObj.issueSize ?? targetObj.issue_size ?? ipoObj.issueSize ?? ipoObj.issue_size;
      if (iss !== undefined && iss !== null && String(iss).trim() !== '') {
        setIssueSize(String(iss).trim());
        keysFilled.push('Issue Size');
      }

      // GMP Amount
      const gAmt = targetObj.gmpAmount ?? targetObj.gmp_amount ?? targetObj.gmp_value ?? gmpObj.gmpAmount ?? gmpObj.gmp_amount ?? gmpObj.gmp_value;
      if (gAmt !== undefined && gAmt !== null && String(gAmt).trim() !== '') {
        setGmpAmount(String(gAmt).trim());
        keysFilled.push('GMP Amount');
      }

      // GMP Percent
      const gPct = targetObj.gmpPercent ?? targetObj.gmp_percent ?? gmpObj.gmpPercent ?? gmpObj.gmp_percent ?? gmpObj.gmpPercentage;
      if (gPct !== undefined && gPct !== null && String(gPct).trim() !== '') {
        setGmpPercent(String(gPct).trim());
        keysFilled.push('GMP Percent');
      }

      // Dates
      const oDate = targetObj.openDate || targetObj.open_date || lifecycleObj.openDate || lifecycleObj.open_date || ipoObj.openDate || ipoObj.open_date;
      if (oDate) {
        setOpenDate(cleanDateStr(oDate));
        keysFilled.push('Open Date');
      }

      const cDate = targetObj.closeDate || targetObj.close_date || lifecycleObj.closeDate || lifecycleObj.close_date || ipoObj.closeDate || ipoObj.close_date;
      if (cDate) {
        setCloseDate(cleanDateStr(cDate));
        keysFilled.push('Close Date');
      }

      const aDate = targetObj.allotmentDate || targetObj.allotment_date || lifecycleObj.allotmentDate || lifecycleObj.allotment_date || ipoObj.allotmentDate || ipoObj.allotment_date;
      if (aDate) {
        setAllotmentDate(cleanDateStr(aDate));
        keysFilled.push('Allotment Date');
      }

      const lDate = targetObj.listingDate || targetObj.listing_date || lifecycleObj.listingDate || lifecycleObj.listing_date || ipoObj.listingDate || ipoObj.listing_date;
      if (lDate) {
        setListingDate(cleanDateStr(lDate));
        keysFilled.push('Listing Date');
      }

      // Registrar
      const reg = targetObj.registrar || configObj.registrar || companyObj.registrar || ipoObj.registrar;
      if (reg) {
        setRegistrar(String(reg).trim());
        keysFilled.push('Registrar');
      }

      const regPhone = targetObj.registrarPhone || targetObj.registrar_phone || configObj.registrarPhone || configObj.registrar_phone;
      if (regPhone) {
        setRegistrarPhone(String(regPhone).trim());
        keysFilled.push('Registrar Phone');
      }

      const regEmail = targetObj.registrarEmail || targetObj.registrar_email || configObj.registrarEmail || configObj.registrar_email;
      if (regEmail) {
        setRegistrarEmail(String(regEmail).trim());
        keysFilled.push('Registrar Email');
      }

      // Lead Manager
      const lm = targetObj.leadManager || targetObj.lead_manager || companyObj.leadManager || companyObj.lead_manager || ipoObj.leadManager || ipoObj.lead_manager;
      if (lm) {
        setLeadManager(String(lm).trim());
        keysFilled.push('Lead Manager');
      }

      // Website
      const web = companyObj.website || targetObj.website;
      if (web) {
        setWebsite(String(web).trim());
        keysFilled.push('Website');
      }

      // Phone
      const ph = targetObj.companyPhone || targetObj.company_phone || companyObj.companyPhone || companyObj.company_phone || companyObj.phone || companyObj.contactPhone;
      if (ph) {
        setCompanyPhone(String(ph).trim());
        keysFilled.push('Phone');
      }

      // Email
      const em = targetObj.companyEmail || targetObj.company_email || companyObj.companyEmail || companyObj.company_email || companyObj.email || companyObj.contactEmail;
      if (em) {
        setCompanyEmail(String(em).trim());
        keysFilled.push('Email');
      }

      // Document URLs
      const drhp = targetObj.drhpUrl || targetObj.drhp_url || docsObj.drhpUrl || docsObj.drhp_url || ipoObj.drhpUrl || ipoObj.drhp_url;
      if (drhp) {
        setDrhpUrl(String(drhp).trim());
        keysFilled.push('DRHP URL');
      }

      const rhp = targetObj.rhpUrl || targetObj.rhp_url || docsObj.rhpUrl || docsObj.rhp_url || ipoObj.rhpUrl || ipoObj.rhp_url;
      if (rhp) {
        setRhpUrl(String(rhp).trim());
        keysFilled.push('RHP URL');
      }

      // Notes
      const nts = targetObj.notes || companyObj.notes || companyObj.aboutDescription || ipoObj.notes;
      if (nts) {
        setNotes(String(nts).trim());
        keysFilled.push('Notes');
      }

      // Financial Ratios
      const fins = companyObj.financials || targetObj.financials;
      if (Array.isArray(fins) && fins.length > 0) {
        const latestFin = fins[0];
        const ebitda = latestFin.ebitdaPercent ?? latestFin.ebitda_percent ?? latestFin.ebitda;
        const roe = latestFin.roePercent ?? latestFin.roe_percent ?? latestFin.roePercentage;
        const pat = latestFin.patPercent ?? latestFin.pat_percent ?? latestFin.patMarginPercent;
        if (ebitda !== undefined && ebitda !== null) setEbitdaPercent(String(ebitda));
        if (roe !== undefined && roe !== null) setRoePercent(String(roe));
        if (pat !== undefined && pat !== null) setPatPercent(String(pat));
        keysFilled.push('Financial Ratios');
      } else {
        const ebitda = targetObj.ebitdaPercent ?? targetObj.ebitda_percent ?? companyObj.ebitdaPercent ?? companyObj.ebitda_percent;
        const roe = targetObj.roePercent ?? targetObj.roe_percent ?? companyObj.roePercent ?? companyObj.roe_percent;
        const pat = targetObj.patPercent ?? targetObj.pat_percent ?? companyObj.patPercent ?? companyObj.pat_percent;
        if (ebitda !== undefined && ebitda !== null) setEbitdaPercent(String(ebitda));
        if (roe !== undefined && roe !== null) setRoePercent(String(roe));
        if (pat !== undefined && pat !== null) setPatPercent(String(pat));
      }

      setParsingDoc(false);

      if (keysFilled.length === 0) {
        setParseResults({
          success: false,
          warnings: ['No recognized IPO fields were found in the selected JSON file.'],
        });
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
      } else {
        setParseResults({
          success: true,
          documentType: 'JSON File',
          fieldsCount: keysFilled.length,
          extractedFieldKeys: keysFilled,
        });
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      }
    } catch (e: any) {
      setParsingDoc(false);
      setParseResults({
        success: false,
        warnings: [e?.message || 'Failed to parse JSON file.'],
      });
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
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
        company_phone: companyPhone.trim() || undefined,
        company_email: companyEmail.trim() || undefined,
        registrar_phone: registrarPhone.trim() || undefined,
        registrar_email: registrarEmail.trim() || undefined,
        ebitda_percent: ebitdaPercent ? parseFloat(ebitdaPercent) : null,
        roe_percent: roePercent ? parseFloat(roePercent) : null,
        pat_percent: patPercent ? parseFloat(patPercent) : null,
        drhp_url: drhpUrl.trim() || undefined,
        rhp_url: rhpUrl.trim() || undefined,
        prospectus_url: rhpUrl.trim() || drhpUrl.trim() || undefined,
        description: notes.trim() || 'Manually created IPO entry',
        gmp_amount: gmpAmount ? parseFloat(gmpAmount) : null,
        gmp_percent: gmpPercent ? parseFloat(gmpPercent) : null,
        profit_per_lot: (gmpAmount && lotSize) ? parseFloat(gmpAmount) * parseInt(lotSize, 10) : null,
        intelligence: {
          company_phone: companyPhone.trim() || undefined,
          company_email: companyEmail.trim() || undefined,
          registrar_phone: registrarPhone.trim() || undefined,
          registrar_email: registrarEmail.trim() || undefined,
          ebitda_percent: ebitdaPercent ? parseFloat(ebitdaPercent) : null,
          roe_percent: roePercent ? parseFloat(roePercent) : null,
          pat_percent: patPercent ? parseFloat(patPercent) : null,
          drhp_url: drhpUrl.trim() || undefined,
          rhp_url: rhpUrl.trim() || undefined,
        },
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
        {/* Upload Banner Row: PDF & JSON Import */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: parseResults ? 12 : 20 }}>
          <TouchableOpacity
            onPress={handleUploadRHP}
            disabled={parsingDoc}
            activeOpacity={0.85}
            style={{
              flex: 1,
              backgroundColor: isDark ? '#1E1B4B44' : '#EEF2FF',
              borderWidth: 1.5,
              borderColor: isDark ? '#4338CA' : '#A5B4FC',
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? '#312E81' : '#E0E7FF', alignItems: 'center', justifyContent: 'center' }}>
              {parsingDoc ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="file-text" size={18} color={colors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground }} numberOfLines={1}>
                {docName ? `PDF: ${docName}` : 'Import RHP PDF'}
              </Text>
              <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground, marginTop: 1 }}>
                PDF Extractor
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleUploadJSON}
            disabled={parsingDoc}
            activeOpacity={0.85}
            style={{
              flex: 1,
              backgroundColor: isDark ? '#064E3B44' : '#ECFDF5',
              borderWidth: 1.5,
              borderColor: isDark ? '#047857' : '#6EE7B7',
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? '#065F46' : '#D1FAE5', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="code" size={18} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground }} numberOfLines={1}>
                Import JSON
              </Text>
              <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground, marginTop: 1 }}>
                Auto-fill fields
              </Text>
            </View>
          </TouchableOpacity>
        </View>

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

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Company Logo URL</Text>
            <TextInput
              value={logoUrl}
              onChangeText={setLogoUrl}
              placeholder="https://.../logo.png"
              placeholderTextColor={colors.mutedForeground + '70'}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              autoCapitalize="none"
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

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>GMP Percentage (%)</Text>
              <TextInput
                value={gmpPercent}
                onChangeText={handleGmpPercentChange}
                placeholder="e.g. 25"
                keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>GMP Amount (₹/share)</Text>
              <TextInput
                value={gmpAmount}
                onChangeText={handleGmpAmountChange}
                placeholder="Auto-calculated"
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

        {/* Key Financial Ratios */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>KEY FINANCIAL RATIOS (%)</Text>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>EBITDA (%)</Text>
              <TextInput
                value={ebitdaPercent}
                onChangeText={setEbitdaPercent}
                placeholder="e.g. 66.85"
                keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>ROE (%)</Text>
              <TextInput
                value={roePercent}
                onChangeText={setRoePercent}
                placeholder="e.g. 33.21"
                keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>PAT (%)</Text>
              <TextInput
                value={patPercent}
                onChangeText={setPatPercent}
                placeholder="e.g. 50.98"
                keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
          </View>
        </View>

        {/* Corporate Details & Contacts */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>ORGANIZATION, CONTACTS & DOCUMENTS</Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Registrar Name</Text>
            <TextInput
              value={registrar}
              onChangeText={setRegistrar}
              placeholder="e.g. KFin Technologies / Link Intime"
              placeholderTextColor={colors.mutedForeground + '70'}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Registrar Phone</Text>
              <TextInput
                value={registrarPhone}
                onChangeText={setRegistrarPhone}
                placeholder="+91..."
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Registrar Email</Text>
              <TextInput
                value={registrarEmail}
                onChangeText={setRegistrarEmail}
                placeholder="ipo.helpdesk@..."
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                autoCapitalize="none"
              />
            </View>
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

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Company Phone</Text>
              <TextInput
                value={companyPhone}
                onChangeText={setCompanyPhone}
                placeholder="+91 22 2659 8100"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Company Email</Text>
              <TextInput
                value={companyEmail}
                onChangeText={setCompanyEmail}
                placeholder="investor@company.com"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                autoCapitalize="none"
              />
            </View>
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

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>DRHP Document URL</Text>
              <TextInput
                value={drhpUrl}
                onChangeText={setDrhpUrl}
                placeholder="https://.../drhp.pdf"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                autoCapitalize="none"
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>RHP Document URL</Text>
              <TextInput
                value={rhpUrl}
                onChangeText={setRhpUrl}
                placeholder="https://.../rhp.pdf"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                autoCapitalize="none"
              />
            </View>
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
            <ActivityIndicator color={showSuccess ? '#FFFFFF' : colors.primaryForeground} />
          ) : showSuccess ? (
            <>
              <Feather name="check" size={20} color="#FFFFFF" />
              <Text style={[styles.saveBtnText, { color: '#FFFFFF' }]}>IPO Created Successfully!</Text>
            </>
          ) : (
            <>
              <Feather name="check-circle" size={18} color={colors.primaryForeground} />
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Save & Open IPO</Text>
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
