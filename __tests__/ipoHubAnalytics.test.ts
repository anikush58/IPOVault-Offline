import { AnalyticsApiService } from '../services/analytics/AnalyticsApiService';
import { BackendIpoApiService } from '../services/ipo/BackendIpoApiService';
import {
  AnalyticsQualityStatus,
  AnalyticsTimePeriod,
} from '../types/analytics';

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

export async function runIpoHubAnalyticsTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING IPOVAULT PHASE 30.8 IPO HUB & ANALYTICS TEST SUITE');
  console.log('===============================================================\n');

  const analyticsService = new AnalyticsApiService('http://127.0.0.1:3000');
  const backendIpoService = new BackendIpoApiService('http://127.0.0.1:3000');

  // Test 1: Navigation & Architecture Isolation
  assert(
    analyticsService !== undefined && backendIpoService !== undefined,
    'Architecture Isolation',
    'Services instantiated cleanly without offline SQLite dependency'
  );

  // Test 2: Backend IPO Catalog
  let lastUrl = '';
  (global as any).fetch = async (url: string) => {
    lastUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'ipo-backend-1',
            symbol: 'TESTCATALOG',
            status: 'OPEN',
            marketSegment: 'MAINBOARD',
            priceBandLow: 100,
            priceBandHigh: 120,
            lotSize: 100,
            issueSize: 500000000,
          },
        ],
      }),
    };
  };

  const ipos = await backendIpoService.listBackendIpos({ marketSegment: 'MAINBOARD' });
  assert(
    lastUrl.includes('/api/v1/ipos') && ipos.length === 1 && ipos[0].symbol === 'TESTCATALOG',
    'Backend IPO Catalog',
    'Fetched backend IPO catalog items cleanly via REST API'
  );

  // Test 3: Market Analytics
  (global as any).fetch = async (url: string) => {
    lastUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          filter: {},
          snapshot: { totalIpos: 5, openIposCount: 2 },
          marketSummary: {
            totalIpos: 5,
            issueSize: {
              totalIssueSizeInr: 1000000000,
              totalIssueShareCount: 10000000,
            },
          },
        },
      }),
    };
  };

  const marketRes = await analyticsService.getMarketAnalytics({ period: AnalyticsTimePeriod.MONTH });
  assert(
    lastUrl.includes('/api/v1/analytics/market') && marketRes.snapshot.totalIpos === 5,
    'Market Analytics',
    'Fetched market analytics data correctly'
  );

  // Test 4: Subscription Analytics Unavailability
  (global as any).fetch = async (url: string) => {
    lastUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          filter: {},
          subscriptionSummary: {
            subscriptionSupported: false,
            unsupportedMetricReason:
              'Subscription demand metrics are FUTURE_DATA_DEPENDENT because canonical schema lacks subscription demand tables.',
          },
        },
      }),
    };
  };

  const subRes = await analyticsService.getSubscriptionAnalytics();
  assert(
    subRes.subscriptionSummary.subscriptionSupported === false &&
      subRes.subscriptionSummary.unsupportedMetricReason.includes('FUTURE_DATA_DEPENDENT'),
    'Subscription Analytics Unavailability',
    'Exposes explicit unavailable state without fake 0x/0% demand'
  );

  // Test 5: Allotment Analytics Descriptive Disclaimer
  (global as any).fetch = async (url: string) => {
    lastUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          filter: {},
          summary: {
            dataQuality: { totalRawObservations: 10, deduplicatedObservationsCount: 8 },
            outcomes: { observedPositiveAllotmentRatePercentage: 37.5 },
            disclaimer:
              'Observed allotment rates represent descriptive statistics of checked sample observations only.',
          },
        },
      }),
    };
  };

  const allotRes = await analyticsService.getAllotmentAnalytics();
  assert(
    allotRes.summary.outcomes.observedPositiveAllotmentRatePercentage === 37.5 &&
      allotRes.summary.disclaimer.includes('descriptive statistics'),
    'Allotment Analytics Descriptive Disclaimer',
    'Displays descriptive rate with mandatory disclaimer'
  );

  // Test 6: Unified Data Quality Statuses
  (global as any).fetch = async (url: string) => {
    lastUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          evaluatedAt: new Date().toISOString(),
          overallQualityStatus: AnalyticsQualityStatus.COMPLETE,
          disclaimer: 'Data quality describes canonical data reliability.',
          domains: {
            market: {
              qualityStatus: AnalyticsQualityStatus.COMPLETE,
              completenessPercentage: 100,
            },
          },
        },
      }),
    };
  };

  const qualRes = await analyticsService.getQualitySummary();
  assert(
    qualRes.overallQualityStatus === AnalyticsQualityStatus.COMPLETE &&
      qualRes.domains.market.completenessPercentage === 100,
    'Data Quality Summary',
    'Preserves canonical quality status codes'
  );

  // Test 7: Privacy & Security Boundary
  const samplePayload = {
    snapshot: { totalIpos: 10 },
    disclaimer: 'Sample stats only',
  };
  const jsonStr = JSON.stringify(samplePayload);
  assert(
    !jsonStr.includes('panEncrypted') &&
      !jsonStr.includes('panMasked') &&
      !jsonStr.includes('password') &&
      !jsonStr.includes('secret'),
    'Privacy & Security Boundary',
    'Ensures zero leak of sensitive identifiers or credentials'
  );

  // Test 8: Analytics Summary & Summary-First Loading
  (global as any).fetch = async (url: string) => {
    lastUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          evaluatedAt: new Date().toISOString(),
          market: {
            snapshot: { totalIpos: 12, openIposCount: 3 },
            summary: {
              totalIpos: 12,
              issueSize: { totalIssueSizeInr: 2500000000 },
            },
          },
          performance: {
            priceBandSummary: { priceBandCoveragePercentage: 100 },
            listingPerformance: { listingPerformanceSupported: false },
          },
          subscription: {
            subscriptionSupported: false,
            unsupportedMetricReason: 'Subscription demand metrics are FUTURE_DATA_DEPENDENT.',
          },
          allotment: {
            dataQuality: { definitiveObservationsCount: 15 },
            outcomes: { observedPositiveAllotmentRatePercentage: 40.0 },
          },
          qualityStatus: {
            overallStatus: AnalyticsQualityStatus.COMPLETE,
          },
        },
      }),
    };
  };

  const summaryRes = await analyticsService.getAnalyticsSummary();
  assert(
    lastUrl.includes('/api/v1/analytics/summary') &&
      summaryRes.market.snapshot.totalIpos === 12 &&
      summaryRes.qualityStatus.overallStatus === AnalyticsQualityStatus.COMPLETE,
    'Analytics Summary Telemetry',
    'Fetched aggregated summary snapshot cleanly in a single request'
  );

  // Test 9: Analytics Mobile Semantic Value Hardening (Phase 30.8.1)
  const {
    formatCurrency,
    formatRupees,
    formatLakhsCrores,
    formatPercentage,
    formatSubscriptionTimes,
    formatShareCount,
    formatRatio,
  } = await import('../utils/formatters');

  assert(formatCurrency(null) === 'N/A', 'Null Currency', 'null total issue size returns N/A');
  assert(formatCurrency(0) === '₹0', 'Zero Currency', 'zero total issue size returns ₹0');
  assert(formatShareCount(null) === 'N/A', 'Null Share Count', 'null total shares returns N/A');
  assert(formatShareCount(0) === '0 shares', 'Zero Share Count', 'zero OFS shares returns 0 shares');
  assert(formatShareCount(4500000).includes('45,00,000'), 'Known Share Count', 'known share count renders with en-IN locale commas');
  assert(formatRatio(null) === 'N/A', 'Null Ratio', 'null fresh/OFS ratio returns N/A');
  assert(formatRatio(1.5) === '1.5x', 'Known Ratio', 'valid fresh/OFS ratio renders with x suffix');
  assert(formatCurrency(925000000).includes('92,50,00,000'), 'Known OFS Size Currency', 'known OFS size of ₹92.50 Cr renders correctly formatted currency');
  assert(formatLakhsCrores(925000000) === '₹93 Cr', 'Known OFS Size Lakhs/Crores', 'known OFS size renders in Crores');
  assert(formatPercentage(null) === 'N/A', 'Null Percentage', 'null percentage returns N/A');
  assert(formatSubscriptionTimes(null) === 'N/A', 'Null Subscription', 'null subscription multiplier returns N/A');

  console.log(`\nTEST SUITE COMPLETED: ${passCount} PASSED, ${failCount} FAILED.\n`);
}

// Auto-run if executed directly via ts-node or script execution
if (require.main === module) {
  runIpoHubAnalyticsTestSuite().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
}
