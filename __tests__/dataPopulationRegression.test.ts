import { LiveIPOProvider } from '../services/ipo/providers/LiveIPOProvider';
import { IPOParser } from '../services/ipo/ipoParser';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    failCount++;
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export async function runDataPopulationRegressionTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT BACKEND -> MOBILE DATA POPULATION REGRESSION');
  console.log('===============================================================\n');

  const hdFireBackendPayload = {
    id: '4cc2f905-4b48-4728-9e5f-1d5c8c988638',
    symbol: 'HDFIRE',
    status: 'UPCOMING',
    marketSegment: 'MAINBOARD',
    exchange: 'BOTH',
    priceBandLow: '258.00',
    priceBandHigh: '271.00',
    lotSize: 55,
    issueSize: '712.31',
    freshIssueSize: '0.00',
    ofsSize: '712.31',
    preIpoEps: '6.45',
    postIpoEps: '6.45',
    preIpoPe: '42.02',
    postIpoPe: '42.02',
    preIpoPromoterHolding: '94.33',
    postIpoPromoterHolding: '75.46',
    preIpoMarketCap: '2849.24',
    postIpoMarketCap: '2849.24',
    openDate: '2026-10-15',
    closeDate: '2026-10-17',
    listingDate: '2026-10-22',
    refundDate: '2026-10-20',
    dematCreditDate: '2026-10-21',
    lifecycle: {
      openDate: '2026-10-15',
      closeDate: '2026-10-17',
      basisOfAllotmentDate: '2026-10-18',
      refundInitiationDate: '2026-10-20',
      dematCreditDate: '2026-10-21',
      listingDate: '2026-10-22',
    },
    company: {
      displayName: 'HD Fire Protect',
      legalName: 'HD Fire Protect Limited',
      aboutDescription: 'HD Fire Protect is a leading manufacturer of fire protection equipment.',
      sector: 'Capital Goods',
      website: 'https://hdfire.com',
      phone: '+91 22 2685 0000',
      email: 'info@hdfire.com',
      financials: [
        {
          fiscalPeriod: 'FY2024',
          totalRevenue: '450.25',
          pat: '48.10',
          netWorth: '210.50',
          totalAssets: '320.00',
          roePercentage: '22.85',
        },
        {
          fiscalPeriod: 'FY2025',
          totalRevenue: '530.80',
          pat: '62.40',
          netWorth: '272.90',
          totalAssets: '390.15',
          roePercentage: '22.87',
        },
        {
          fiscalPeriod: 'FY2026',
          totalRevenue: '640.10',
          pat: '81.50',
          netWorth: '354.40',
          totalAssets: '485.60',
          roePercentage: '22.99',
        },
        {
          fiscalPeriod: 'Q1 FY2027',
          totalRevenue: '180.50',
          pat: '24.20',
          netWorth: '378.60',
          totalAssets: '510.00',
          roePercentage: '6.39',
        },
      ],
    },
    participants: [
      {
        role: 'REGISTRAR',
        name: 'MUFG Intime India Private Limited',
        phone: '+91 22 4918 6000',
        email: 'hdfire.ipo@in.mpms.mufg.com',
        website: 'https://in.mpms.mufg.com/',
      },
      { role: 'BRLM', name: 'Ambit Private Limited' },
      { role: 'BRLM', name: 'Anand Rathi Advisors Limited' },
      { role: 'BRLM', name: 'IIFL Capital Services Limited' },
    ],
    documents: [
      {
        documentType: 'DRHP',
        title: 'Draft Red Herring Prospectus',
        sourceUrl: 'https://sebi.gov.in/drhp/hdfire.pdf',
      },
      {
        documentType: 'RHP',
        title: 'Red Herring Prospectus',
        sourceUrl: 'https://sebi.gov.in/rhp/hdfire.pdf',
      },
    ],
    drhpUrl: 'https://sebi.gov.in/drhp/hdfire.pdf',
    rhpUrl: 'https://sebi.gov.in/rhp/hdfire.pdf',
    prospectusUrl: 'https://sebi.gov.in/rhp/hdfire.pdf',
    currentGmp: {
      gmpAmount: '74.00',
      gmpPercentage: '27.31',
      estProfitPerLot: '4070.00',
      observedAt: '2026-10-07T12:00:00.000Z',
    },
    currentSubscription: {
      totalSubscriptionMultiple: '12.45',
      categories: [
        { category: 'QIB', subscriptionMultiple: '18.50' },
        { category: 'NII', subscriptionMultiple: '15.20' },
        { category: 'RETAIL', subscriptionMultiple: '8.30' },
      ],
    },
    risks: ['Customer concentration risk', 'Raw material volatility'],
    strengths: ['Market leader in fire protection', 'Robust margins'],
    objectsOfIssue: ['Funding capex expansion', 'General corporate purposes'],
  };

  // Test 1: LiveIPOProvider normalization of Valuation metrics
  const provider = new LiveIPOProvider();
  const normalized = (provider as any).normalizeRecord(hdFireBackendPayload);

  assert(normalized.pre_ipo_eps === 6.45, 'Valuation: Pre-IPO EPS', `Value is ${normalized.pre_ipo_eps}`);
  assert(normalized.post_ipo_eps === 6.45, 'Valuation: Post-IPO EPS', `Value is ${normalized.post_ipo_eps}`);
  assert(normalized.pre_ipo_pe === 42.02, 'Valuation: Pre-IPO P/E', `Value is ${normalized.pre_ipo_pe}`);
  assert(normalized.post_ipo_pe === 42.02, 'Valuation: Post-IPO P/E', `Value is ${normalized.post_ipo_pe}`);
  assert(normalized.pre_ipo_promoter_holding === 94.33, 'Valuation: Pre-IPO Promoter Holding', `Value is ${normalized.pre_ipo_promoter_holding}%`);
  assert(normalized.post_ipo_promoter_holding === 75.46, 'Valuation: Post-IPO Promoter Holding', `Value is ${normalized.post_ipo_promoter_holding}%`);
  assert(normalized.pre_ipo_market_cap === 2849.24, 'Valuation: Market Cap', `Value is ${normalized.pre_ipo_market_cap}`);
  assert(normalized.fresh_issue_size === 0, 'Issue: Fresh Issue Size', `Value is ${normalized.fresh_issue_size}`);
  assert(normalized.ofs_size === 712.31, 'Issue: OFS Size', `Value is ${normalized.ofs_size}`);

  // Test 2: Registrar contact fields & BRLMs list
  assert(normalized.registrar === 'MUFG Intime India Private Limited', 'Registrar: Name', `Value is ${normalized.registrar}`);
  assert(normalized.registrar_phone === '+91 22 4918 6000', 'Registrar: Phone', `Value is ${normalized.registrar_phone}`);
  assert(normalized.registrar_email === 'hdfire.ipo@in.mpms.mufg.com', 'Registrar: Email', `Value is ${normalized.registrar_email}`);
  assert(normalized.registrar_website === 'https://in.mpms.mufg.com/', 'Registrar: Website', `Value is ${normalized.registrar_website}`);
  assert(
    normalized.lead_manager === 'Ambit Private Limited, Anand Rathi Advisors Limited, IIFL Capital Services Limited',
    'BRLM: All 3 Lead Managers',
    `Value is ${normalized.lead_manager}`
  );

  // Test 3: Multi-Period Financials serialization
  assert(Boolean(normalized.financials_json), 'Financials: JSON Serialized', 'financials_json is populated');
  const parsedFin = JSON.parse(normalized.financials_json);
  assert(parsedFin.length === 4, 'Financials: Multi-period length', `Got ${parsedFin.length} periods`);
  assert(parsedFin[0].fiscalPeriod === 'FY2024', 'Financials: Period 1', `Period is ${parsedFin[0].fiscalPeriod}`);
  assert(parsedFin[3].fiscalPeriod === 'Q1 FY2027', 'Financials: Period 4', `Period is ${parsedFin[3].fiscalPeriod}`);

  // Test 4: Documents and URLs
  assert(normalized.drhp_url === 'https://sebi.gov.in/drhp/hdfire.pdf', 'Documents: DRHP URL', `Value is ${normalized.drhp_url}`);
  assert(normalized.rhp_url === 'https://sebi.gov.in/rhp/hdfire.pdf', 'Documents: RHP URL', `Value is ${normalized.rhp_url}`);
  assert(Boolean(normalized.documents_json), 'Documents: JSON Serialized', 'documents_json is populated');

  // Test 5: Intelligence (Risks, Strengths, Objects of Issue)
  assert(Boolean(normalized.intelligence_json), 'Intelligence: JSON Serialized', 'intelligence_json is populated');
  const parsedIntel = JSON.parse(normalized.intelligence_json);
  assert(parsedIntel.risks?.length === 2, 'Intelligence: Risks', `Got ${parsedIntel.risks?.length} risks`);
  assert(parsedIntel.strengths?.length === 2, 'Intelligence: Strengths', `Got ${parsedIntel.strengths?.length} strengths`);
  assert(parsedIntel.objects_of_issue?.length === 2, 'Intelligence: Objects', `Got ${parsedIntel.objects_of_issue?.length} objects`);

  // Test 6: IPOParser non-destructive parsing
  const parsedRecord = IPOParser.parse(normalized);
  assert(parsedRecord.pre_ipo_pe === 42.02, 'Parser: Retained Pre-IPO P/E', `Value is ${parsedRecord.pre_ipo_pe}`);
  assert(parsedRecord.registrar_phone === '+91 22 4918 6000', 'Parser: Retained Registrar Phone', `Value is ${parsedRecord.registrar_phone}`);
  assert(parsedRecord.fresh_issue_size === 0, 'Parser: Retained Fresh Issue Size', `Value is ${parsedRecord.fresh_issue_size}`);
  assert(Boolean(parsedRecord.financials_json), 'Parser: Retained financials_json', 'financials_json exists');

  console.log(`\n===============================================================`);
  console.log(`TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`===============================================================\n`);
}

if (require.main === module) {
  runDataPopulationRegressionTestSuite().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
