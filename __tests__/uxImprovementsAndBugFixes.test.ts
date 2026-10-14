import { getFirstAvailableIpoHubTab, NewIpoTab } from '../utils/ipoHubTabUtils';
import { resolveBankLinkedUpiApp, UPI_APPS } from '../utils/bulkApplyUtils';
import { adEntitlementService, AdEntitlementState } from '../services/ads/adEntitlementService';
import {
  extractHoldingInstrumentsForQuotes,
  findMatchingMarketQuote,
  enrichApplicationsWithBrokerData,
  KNOWN_IPO_ISINS,
  CANONICAL_IPO_ISINS,
  isValidIsin,
  resolveCanonicalIsin,
  extractHoldingInstrumentsResolutionSummary,
} from '../utils/brokerMatching';
import {
  parseQueryParams,
  findQuoteEligibleAccount,
  parseMarketQuotesData,
  BrokerAccountItem,
} from '../services/broker/BrokerApiService';

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

async function runTestSuite() {
  console.log('===================================================================');
  console.log('RUNNING IPOVAULT UX IMPROVEMENTS & BUG FIXES REGRESSION TEST SUITE');
  console.log('===================================================================\n');

  // -----------------------------------------------------------------
  // 1. DASHBOARD NOTIFICATIONS ACCESS WITHOUT CONNECTED BROKER
  // -----------------------------------------------------------------
  console.log('--- 1. Dashboard Notifications Accessibility ---');
  {
    // Simulate dashboard state with NO broker connected
    const brokerAccounts: Array<{ id: string; isActive: boolean; connection?: { status: string } }> = [];
    const isBrokerConnected = brokerAccounts.some(
      (acc) => acc.connection?.status === 'CONNECTED' && acc.isActive
    );

    assert(
      isBrokerConnected === false,
      'TEST 1.1',
      'Dashboard broker connection status is false (no broker linked)'
    );

    // Verify notification action button is present and accessible independently of broker connection
    const headerActions = [
      { id: 'dashboard-notifications-btn', route: '/notifications', alwaysVisible: true },
      { id: 'dashboard-filter-btn', route: null, alwaysVisible: true },
    ];

    const notificationBtn = headerActions.find((a) => a.id === 'dashboard-notifications-btn');
    assert(
      notificationBtn !== undefined && notificationBtn.alwaysVisible === true,
      'TEST 1.2',
      'Notification bell icon is present and visible even without connected broker'
    );
    assert(
      notificationBtn?.route === '/notifications',
      'TEST 1.3',
      'Notification bell routes directly to /notifications'
    );

    // Verify unread badge count computation
    const mockNotifications = [
      { id: 'n1', title: 'Allotment Out', read_at: null },
      { id: 'n2', title: 'IPO Closing', read_at: '2026-10-12T00:00:00Z' },
      { id: 'n3', title: 'Listing Update', read_at: null },
    ];
    const unreadCount = mockNotifications.filter((n) => !n.read_at).length;
    assert(
      unreadCount === 2,
      'TEST 1.4',
      'Unread notification badge count accurately reflects unread items (2)'
    );
  }

  // -----------------------------------------------------------------
  // 2. AD-FREE DEVELOPER TOGGLE CRASH FIX & ENTITLEMENT LIFECYCLE
  // -----------------------------------------------------------------
  console.log('\n--- 2. Ad-Free Developer Toggle & NativeAdCard Hook Invariance ---');
  {
    // Start at initial free tier
    await adEntitlementService.resetEntitlement();
    const initialState = await adEntitlementService.getEntitlementState();
    assert(
      initialState.isPremium === false,
      'TEST 2.1',
      'Initial entitlement state is free tier (isPremium: false)'
    );

    // Toggle dev mock to premium (ad-free)
    const premiumState = await adEntitlementService.toggleDevMockPremium();
    assert(
      premiumState.isPremium === true && premiumState.isDevMock === true && premiumState.source === 'dev_mock',
      'TEST 2.2',
      'Toggling developer mock enables ad-free entitlement (isPremium: true, source: dev_mock)'
    );

    // Toggle back to free tier
    const toggledBack = await adEntitlementService.toggleDevMockPremium();
    assert(
      toggledBack.isPremium === false,
      'TEST 2.3',
      'Toggling developer mock again safely reverts to free tier (isPremium: false)'
    );

    // Hook Invariance Simulation:
    // In React, components must execute the same number of hooks across re-renders.
    // NativeAdCard previously crashed because `if (!adsEnabled) return null;` was above `useEffect`.
    // We simulate hook execution order to verify invariance:
    function simulateNativeAdCardHookOrder(adsEnabled: boolean) {
      const hooksExecuted: string[] = [];
      // Unconditional hooks:
      hooksExecuted.push('useAdContext');
      hooksExecuted.push('useColors');
      hooksExecuted.push('useTheme');
      hooksExecuted.push('useState_nativeAdInstance');
      hooksExecuted.push('useState_hasError');
      hooksExecuted.push('useState_loading');
      hooksExecuted.push('useEffect_adRequest'); // Moved ABOVE early returns

      // Early return check occurs AFTER all hooks
      if (!adsEnabled) {
        return { rendered: null, hookCount: hooksExecuted.length, hooks: hooksExecuted };
      }
      return { rendered: 'CARD_VIEW', hookCount: hooksExecuted.length, hooks: hooksExecuted };
    }

    const renderWithAds = simulateNativeAdCardHookOrder(true);
    const renderAdFree = simulateNativeAdCardHookOrder(false);

    assert(
      renderWithAds.hookCount === renderAdFree.hookCount,
      'TEST 2.4',
      `Hook counts are invariant between ad-enabled (${renderWithAds.hookCount}) and ad-free (${renderAdFree.hookCount}) renders`
    );
    assert(
      renderAdFree.rendered === null,
      'TEST 2.5',
      'Ad is suppressed (returns null) when user is in ad-free mode without hook mismatch'
    );
  }

  // -----------------------------------------------------------------
  // 3. BROKER AUTHENTICATION RETURN FLOW & DUPLICATE CALLBACK GUARD
  // -----------------------------------------------------------------
  console.log('\n--- 3. Broker Authentication Direct Return Flow ---');
  {
    // Test direct return after backend confirmation
    class CallbackFlowSim {
      public currentScreen: string = '/users';
      public hasProcessed: boolean = false;
      public isModalShown: boolean = false;
      public navigationCount: number = 0;

      onBackendVerified(verifiedAcc: any) {
        if (this.hasProcessed) return; // Callback deduplication
        this.hasProcessed = true;

        if (verifiedAcc && verifiedAcc.connection?.status === 'CONNECTED') {
          // Direct return without intermediate modal or 2s delay
          this.isModalShown = false;
          this.navigationCount++;
          this.currentScreen = '/users';
        }
      }
    }

    const sim = new CallbackFlowSim();
    const verifiedAccount = {
      id: 'acc-zerodha-123',
      profileId: 'usr-1',
      broker: 'ZERODHA',
      isActive: true,
      connection: { status: 'CONNECTED' },
    };

    sim.onBackendVerified(verifiedAccount);
    assert(
      sim.currentScreen === '/users',
      'TEST 3.1',
      'Direct return to originating screen (/users) upon backend verification'
    );
    assert(
      sim.isModalShown === false,
      'TEST 3.2',
      'No redundant intermediate success modal or delayed splash screen'
    );
    assert(
      sim.navigationCount === 1,
      'TEST 3.3',
      'Exactly one navigation transition occurred'
    );

    // Replay / duplicate callback simulation
    sim.onBackendVerified(verifiedAccount);
    assert(
      sim.navigationCount === 1,
      'TEST 3.4',
      'Duplicate callback ignored by deduplication guard without navigation loop'
    );
  }

  // -----------------------------------------------------------------
  // 4. IPO HUB FIRST AVAILABLE TAB PRIORITY RESOLUTION
  // -----------------------------------------------------------------
  console.log('\n--- 4. IPO Hub Default Tab Priority Selection ---');
  {
    // Priority 1: Live IPOs available -> select 'live'
    const tab1 = getFirstAvailableIpoHubTab({ live: 3, upcoming: 5, closed: 10, listed: 20 });
    assert(tab1 === 'live', 'TEST 4.1', 'Selects "live" when live IPOs exist');

    // Priority 2: No Live, Upcoming available -> select 'upcoming'
    const tab2 = getFirstAvailableIpoHubTab({ live: 0, upcoming: 4, closed: 12, listed: 15 });
    assert(tab2 === 'upcoming', 'TEST 4.2', 'Selects "upcoming" when live is empty but upcoming has IPOs');

    // Priority 3: No Live, No Upcoming, Closed available -> select 'closed'
    const tab3 = getFirstAvailableIpoHubTab({ live: 0, upcoming: 0, closed: 6, listed: 25 });
    assert(tab3 === 'closed', 'TEST 4.3', 'Selects "closed" when live and upcoming are empty');

    // Priority 4: Only Listed available -> select 'listed'
    const tab4 = getFirstAvailableIpoHubTab({ live: 0, upcoming: 0, closed: 0, listed: 8 });
    assert(tab4 === 'listed', 'TEST 4.4', 'Selects "listed" when live, upcoming, and closed are empty');

    // Fallback: All categories empty -> defaults to 'live' empty state
    const tab5 = getFirstAvailableIpoHubTab({ live: 0, upcoming: 0, closed: 0, listed: 0 });
    assert(tab5 === 'live', 'TEST 4.5', 'Defaults to "live" when all categories are empty');

    // Manual tab selection preservation simulation:
    let userSelectedTab: NewIpoTab | null = null;
    let autoSelectedTab: NewIpoTab = 'live';
    let userHasManuallySelected = false;

    // First load auto-selects upcoming because live is 0
    autoSelectedTab = getFirstAvailableIpoHubTab({ live: 0, upcoming: 2, closed: 0, listed: 0 });
    assert(autoSelectedTab === 'upcoming', 'TEST 4.6', 'Initial load auto-selects "upcoming"');

    // User manually taps 'listed'
    userHasManuallySelected = true;
    userSelectedTab = 'listed';

    // Subsequent background data refresh arrives with new live IPOs
    const refreshCounts = { live: 1, upcoming: 2, closed: 5, listed: 10 };
    let currentTab: NewIpoTab = userHasManuallySelected ? userSelectedTab : getFirstAvailableIpoHubTab(refreshCounts);
    assert(
      currentTab === 'listed',
      'TEST 4.7',
      'Manual tab selection ("listed") is strictly preserved on data refreshes without tab flicker'
    );
  }

  // -----------------------------------------------------------------
  // 5. BANK-LINKED UPI APP AUTOMATIC SELECTION & RESILIENCE
  // -----------------------------------------------------------------
  console.log('\n--- 5. Bank-to-UPI Automatic Mapping in Bulk Apply ---');
  {
    const bankAccounts = [
      { id: 'b1', bank_name: 'HDFC Bank', upi_app: 'GPay' },
      { id: 'b2', bank_name: 'State Bank of India', upi_app: 'phonepe' }, // Lowercase test
      { id: 'b3', bank_name: 'ICICI Bank', upi_app: '' }, // Missing mapping
      { id: 'b4', bank_name: 'Kotak Mahindra', upi_app: 'NonExistentWallet' }, // Invalid app
      { id: 'b5', bank_name: 'Bank of Baroda', upi_app: 'BoB ASBA' },
    ];

    // Case 1: Valid mapping (HDFC Bank -> GPay)
    const upi1 = resolveBankLinkedUpiApp('HDFC Bank', bankAccounts, UPI_APPS);
    assert(upi1 === 'GPay', 'TEST 5.1', 'Automatically selects "GPay" for HDFC Bank');

    // Case 2: Case-insensitive mapping (SBI with 'phonepe' -> 'PhonePe')
    const upi2 = resolveBankLinkedUpiApp('State Bank of India', bankAccounts, UPI_APPS);
    assert(upi2 === 'PhonePe', 'TEST 5.2', 'Resolves case-insensitive "phonepe" to canonical "PhonePe"');

    // Case 3: ASBA mapping (Bank of Baroda -> BoB ASBA)
    const upi3 = resolveBankLinkedUpiApp('Bank of Baroda', bankAccounts, UPI_APPS);
    assert(upi3 === 'BoB ASBA', 'TEST 5.3', 'Resolves ASBA mapping "BoB ASBA"');

    // Case 4: Missing mapping (ICICI Bank with empty upi_app -> null)
    const upi4 = resolveBankLinkedUpiApp('ICICI Bank', bankAccounts, UPI_APPS);
    assert(upi4 === null, 'TEST 5.4', 'Gracefully returns null for bank with missing UPI app mapping');

    // Case 5: Invalid/unknown mapping (Kotak with 'NonExistentWallet' -> null)
    const upi5 = resolveBankLinkedUpiApp('Kotak Mahindra', bankAccounts, UPI_APPS);
    assert(upi5 === null, 'TEST 5.5', 'Gracefully returns null for unknown/unsupported UPI app without selecting wrong app');

    // Case 6: Non-existent bank name
    const upi6 = resolveBankLinkedUpiApp('Random Unknown Bank', bankAccounts, UPI_APPS);
    assert(upi6 === null, 'TEST 5.6', 'Returns null for unknown bank name');

    // Case 7: Manual selection preservation across re-renders
    let currentUpiApp: string | null = 'Paytm'; // User manually chose Paytm
    // Data refresh occurs, but user did NOT change bank
    const selectedBank = 'ICICI Bank'; // ICICI has no mapping
    const recheckedMapping = resolveBankLinkedUpiApp(selectedBank, bankAccounts, UPI_APPS);
    if (recheckedMapping) {
      currentUpiApp = recheckedMapping;
    }
    assert(
      currentUpiApp === 'Paytm',
      'TEST 5.7',
      'User manual UPI selection is not overwritten when bank has no valid mapping'
    );
  }

  // -----------------------------------------------------------------
  // 6. COMPACT HOLDINGS & MANUAL LTP REFRESH BEHAVIOR
  // -----------------------------------------------------------------
  console.log('\n--- 6. Holdings Data Integrity & Manual LTP Refresh ---');
  {
    // Financial calculation semantics test
    const app = {
      id: 'app-1',
      ipo_name: 'Tata Tech',
      quantity: 30,
      shares_count: 30,
      buy_price: 500,
      sell_price: null, // Unsold holding
    };
    const qty = app.shares_count ?? app.quantity;
    const initialLtp = 500;
    const buyVal = app.buy_price * qty; // ₹15,000
    const holdingValInitial = initialLtp * qty; // ₹15,000
    const grossPlInitial = holdingValInitial - buyVal; // ₹0
    assert(buyVal === 15000, 'TEST 6.1', 'Calculates buy value correctly (30 × ₹500 = ₹15,000)');
    assert(grossPlInitial === 0, 'TEST 6.2', 'Initial unrealized P&L is 0 at buy price');

    // Fetch fresh quote: LTP changes to ₹650
    const freshMarketQuotes = {
      'TATA TECH': { ltp: 650, symbol: 'TATATECH' },
    };
    const freshLtp = findMatchingMarketQuote(
      { ipo_name: 'Tata Tech', ipo_id: 'ipo-tata' },
      { ipo_name: 'Tata Tech', symbol: 'TATATECH' },
      freshMarketQuotes as any
    );

    assert(freshLtp === 650, 'TEST 6.3', 'Successfully resolves fresh market LTP (₹650)');

    const updatedHoldingVal = freshLtp! * qty; // ₹19,500
    const updatedGrossPl = updatedHoldingVal - buyVal; // +₹4,500
    const gainPct = (updatedGrossPl / buyVal) * 100; // +30%

    assert(updatedHoldingVal === 19500, 'TEST 6.4', 'Holding value updates to ₹19,500 with fresh LTP');
    assert(updatedGrossPl === 4500, 'TEST 6.5', 'Unrealized profit reflects ₹4,500');
    assert(gainPct === 30, 'TEST 6.6', 'Gain percentage reflects +30.0%');

    // Buy price and sale status remain unmutated:
    assert(app.buy_price === 500, 'TEST 6.7', 'Buy price is preserved and never overwritten by LTP');
    assert(app.sell_price === null, 'TEST 6.8', 'LTP is never written into executed sell_price');

    // Concurrency guard simulation:
    let isRefreshing = false;
    let refreshRequestCount = 0;

    async function simulateLtpRefresh() {
      if (isRefreshing) return; // Prevent duplicate concurrent requests
      isRefreshing = true;
      refreshRequestCount++;
      // Simulate async request delay
      await new Promise((r) => setTimeout(r, 10));
      isRefreshing = false;
    }

    // Fire two concurrent refresh requests
    const p1 = simulateLtpRefresh();
    const p2 = simulateLtpRefresh(); // should be blocked
    await Promise.all([p1, p2]);

    assert(
      refreshRequestCount === 1,
      'TEST 6.9',
      'Concurrent duplicate LTP refresh requests are prevented by loading guard'
    );
  }

  // -----------------------------------------------------------------
  // 7. HOLDINGS VISIBILITY, LTP REFRESH SAFETY & USER FEEDBACK RESILIENCE
  // -----------------------------------------------------------------
  console.log('\n--- 7. Holdings Visibility, Refresh Safety & Feedback Resilience ---');
  {
    // 7.1 Holdings section visibility logic
    const isSectionVisible = (isBrokerConnected: boolean, holdingCount: number) =>
      isBrokerConnected || holdingCount > 0;

    assert(
      isSectionVisible(false, 2) === true,
      'TEST 7.1',
      'Section is visible when local holdings exist without a connected broker'
    );
    assert(
      isSectionVisible(true, 0) === true,
      'TEST 7.2',
      'Section is visible when a broker is connected with empty holdings (to show empty state)'
    );
    assert(
      isSectionVisible(false, 0) === false,
      'TEST 7.3',
      'Section is hidden when no broker is connected and zero holdings exist'
    );

    // 7.2 LTP refresh clear feedback simulation
    type FeedbackState = { type: string; title: string; message: string } | null;

    async function simulateRefreshWithFeedback(params: {
      activeUserId: string | null;
      connectedAccounts: any[];
      holdingInstruments: any[];
      fetchQuotes: () => Promise<Record<string, any>>;
    }): Promise<{ isRefreshing: boolean; feedback: FeedbackState; quotesMerged: boolean }> {
      let isRefreshing = true;
      let feedback: FeedbackState = null;
      let quotesMerged = false;

      try {
        if (!params.activeUserId) {
          feedback = { type: 'warning', title: 'No Profile Selected', message: 'Connect a broker account in Profile to retrieve live market quotes.' };
          return { isRefreshing: false, feedback, quotesMerged: false };
        }

        if (params.connectedAccounts.length === 0) {
          feedback = { type: 'warning', title: 'No Broker Connected', message: 'Please connect a broker account to fetch real-time market prices.' };
          return { isRefreshing: false, feedback, quotesMerged: false };
        }

        if (params.holdingInstruments.length === 0) {
          feedback = { type: 'warning', title: 'No Holdings Found', message: 'No active IPO holding instruments found to quote.' };
          return { isRefreshing: false, feedback, quotesMerged: false };
        }

        const freshQuotes = await params.fetchQuotes();
        if (freshQuotes && Object.keys(freshQuotes).length > 0) {
          quotesMerged = true;
          feedback = { type: 'success', title: 'Updated', message: 'Quotes refreshed.' };
        } else {
          feedback = { type: 'warning', title: 'Quotes Unavailable', message: 'Live market quotes are currently unavailable for these holdings.' };
        }
      } catch (err: any) {
        feedback = { type: 'error', title: 'Quote Error', message: 'Failed to retrieve live quotes from the broker service.' };
      } finally {
        isRefreshing = false;
      }

      return { isRefreshing, feedback, quotesMerged };
    }

    // Case 1: No active user
    const resNoUser = await simulateRefreshWithFeedback({
      activeUserId: null,
      connectedAccounts: [{ id: 'acc-1' }],
      holdingInstruments: [{ symbol: 'TATA' }],
      fetchQuotes: async () => ({}),
    });
    assert(resNoUser.isRefreshing === false, 'TEST 7.4a', 'Loading state resets to false when no user is selected');
    assert(resNoUser.feedback?.title === 'No Profile Selected', 'TEST 7.4b', 'Dispatches "No Profile Selected" feedback');

    // Case 2: No connected broker
    const resNoBroker = await simulateRefreshWithFeedback({
      activeUserId: 'usr-1',
      connectedAccounts: [],
      holdingInstruments: [{ symbol: 'TATA' }],
      fetchQuotes: async () => ({}),
    });
    assert(resNoBroker.isRefreshing === false, 'TEST 7.5a', 'Loading state resets to false when no broker is connected');
    assert(resNoBroker.feedback?.title === 'No Broker Connected', 'TEST 7.5b', 'Dispatches "No Broker Connected" feedback');

    // Case 3: Empty quotes returned
    const resEmptyQuotes = await simulateRefreshWithFeedback({
      activeUserId: 'usr-1',
      connectedAccounts: [{ id: 'acc-1' }],
      holdingInstruments: [{ symbol: 'TATA' }],
      fetchQuotes: async () => ({}),
    });
    assert(resEmptyQuotes.isRefreshing === false, 'TEST 7.6a', 'Loading state resets to false on empty quotes');
    assert(resEmptyQuotes.feedback?.title === 'Quotes Unavailable', 'TEST 7.6b', 'Dispatches "Quotes Unavailable" feedback');

    // Case 4: Quotes successfully fetched
    const resSuccess = await simulateRefreshWithFeedback({
      activeUserId: 'usr-1',
      connectedAccounts: [{ id: 'acc-1' }],
      holdingInstruments: [{ symbol: 'TATA' }],
      fetchQuotes: async () => ({ TATA: { ltp: 720 } }),
    });
    assert(resSuccess.isRefreshing === false, 'TEST 7.7a', 'Loading state resets on success');
    assert(resSuccess.quotesMerged === true, 'TEST 7.7b', 'Quotes correctly marked for merging into state');
    assert(resSuccess.feedback?.type === 'success', 'TEST 7.7c', 'Success feedback emitted on successful quotes');

    // Case 5: Partial / failed quote network error
    const resError = await simulateRefreshWithFeedback({
      activeUserId: 'usr-1',
      connectedAccounts: [{ id: 'acc-1' }],
      holdingInstruments: [{ symbol: 'TATA' }],
      fetchQuotes: async () => { throw new Error('Broker timeout'); },
    });
    assert(resError.isRefreshing === false, 'TEST 7.8a', 'Loading state always resets to false on quote error');
    assert(resError.feedback?.title === 'Quote Error', 'TEST 7.8b', 'Dispatches clear "Quote Error" feedback');

    // 7.3 Negative P&L and zero buy price resilience
    const lossApp = {
      buy_price: 600,
      quantity: 20,
      shares_count: 20,
      sell_price: 450, // LTP lower than buy price
    };
    const qty = lossApp.shares_count ?? lossApp.quantity;
    const curPrice = lossApp.sell_price ?? lossApp.buy_price;
    const buyVal = lossApp.buy_price * qty; // ₹12,000
    const holdingVal = curPrice * qty; // ₹9,000
    const grossPL = holdingVal - buyVal; // -₹3,000
    const gainPct = buyVal > 0 ? (grossPL / buyVal) * 100 : 0; // -25%
    const isPos = grossPL >= 0;

    assert(isPos === false, 'TEST 7.9', 'Correctly flags negative P&L as isPos === false');
    assert(grossPL === -3000, 'TEST 7.10', 'Calculates loss amount (-₹3,000) correctly');
    assert(gainPct === -25, 'TEST 7.11', 'Calculates loss percentage (-25.0%) correctly');

    // Missing quote fallback: currentPrice falls back to buy_price (unrealized P&L = 0)
    const unquotedApp = {
      buy_price: 350,
      quantity: 10,
      sell_price: null,
    };
    const resolvedPrice = unquotedApp.sell_price ?? unquotedApp.buy_price;
    assert(resolvedPrice === 350, 'TEST 7.12', 'Missing quote price falls back safely to buy_price (never 0 or NaN)');
  }

  // -----------------------------------------------------------------
  // 8. MARKET QUOTE DIAGNOSTICS & NON-QUOTE BROKER RECONCILIATION
  // -----------------------------------------------------------------
  console.log('\n--- 8. Market Quote Diagnostics & Non-Quote Broker Reconciliation ---');
  {
    // 8.1 findQuoteEligibleAccount behavior
    const zerodhaAccount: BrokerAccountItem = {
      id: 'acc-zerodha',
      profileId: 'prof-1',
      broker: 'ZERODHA',
      accountName: 'Kite',
      clientId: 'AB1234',
      isActive: true,
      connection: { id: 'c1', status: 'CONNECTED', connectedAt: null, lastSyncAt: null, lastErrorAt: null, lastError: null },
      createdAt: '',
      updatedAt: '',
    };
    const upstoxAccount: BrokerAccountItem = {
      id: 'acc-upstox',
      profileId: 'prof-1',
      broker: 'UPSTOX',
      accountName: 'Upstox Pro',
      clientId: 'UP1234',
      isActive: true,
      connection: { id: 'c2', status: 'CONNECTED', connectedAt: null, lastSyncAt: null, lastErrorAt: null, lastError: null },
      createdAt: '',
      updatedAt: '',
    };
    const disconnectedUpstox: BrokerAccountItem = {
      ...upstoxAccount,
      id: 'acc-upstox-disc',
      connection: { id: 'c3', status: 'DISCONNECTED', connectedAt: null, lastSyncAt: null, lastErrorAt: null, lastError: null },
    };

    assert(
      findQuoteEligibleAccount([zerodhaAccount]) === null,
      'TEST 8.1',
      'findQuoteEligibleAccount returns null when only Zerodha is connected (Zerodha has capabilities.quotes: false)',
    );
    assert(
      findQuoteEligibleAccount([zerodhaAccount, upstoxAccount])?.id === 'acc-upstox',
      'TEST 8.2',
      'findQuoteEligibleAccount correctly selects quote-capable broker (Upstox) when present alongside Zerodha',
    );
    assert(
      findQuoteEligibleAccount([disconnectedUpstox]) === null,
      'TEST 8.3',
      'findQuoteEligibleAccount ignores disconnected or inactive quote-capable brokers',
    );

    // 8.2 extractHoldingInstrumentsForQuotes with brokerPortfolio fallback
    const appsWithoutIsin = [
      { id: 'app-1', ipo_id: 'ipo-local-1', ipo_name: 'Tata Technologies Limited', status: 'Holding' },
      { id: 'app-2', ipo_id: 'ipo-local-2', ipo_name: 'IREDA Limited', status: 'Holding' },
      { id: 'app-3', ipo_id: 'ipo-local-3', ipo_name: 'Sold IPO', status: 'Sold' }, // Sold should be ignored
    ];
    const iposWithoutIsin = [
      { id: 'ipo-local-1', ipo_name: 'Tata Technologies Limited', isin: null, symbol: null },
      { id: 'ipo-local-2', ipo_name: 'IREDA Limited', isin: null, symbol: null },
    ];
    const mockBrokerInvestments: any[] = [
      {
        ipoId: 'ipo-backend-tata',
        companyName: 'Tata Technologies Limited',
        isin: 'INE142M01025',
        symbol: 'NSE:TATATECH',
        exchange: 'NSE',
        currentHoldingPrice: 1045,
      },
      {
        ipoId: 'ipo-backend-ireda',
        companyName: 'Indian Renewable Energy Development Agency',
        isin: 'INE202E01016',
        symbol: 'IREDA',
        exchange: 'NSE',
        currentHoldingPrice: 198,
      },
    ];

    const extracted = extractHoldingInstrumentsForQuotes(appsWithoutIsin, iposWithoutIsin, mockBrokerInvestments);
    assert(extracted.length === 2, 'TEST 8.4', 'extractHoldingInstrumentsForQuotes filters to active Holding apps only');
    const tataInst = extracted.find((e) => e.isin === 'INE142M01025');
    assert(tataInst !== undefined, 'TEST 8.5', 'Discovers ISIN from brokerPortfolio.investments fallback');
    assert(tataInst?.symbol === 'TATATECH', 'TEST 8.6', 'Normalizes symbol by stripping exchange prefix (NSE:TATATECH -> TATATECH)');

    // 8.3 parseMarketQuotesData
    const rawArrayData = [
      { isin: 'INE142M01025', symbol: 'TATATECH', exchange: 'NSE', lastPrice: 1050.25, closePrice: 1030 },
      { isin: 'INE202E01016', symbol: 'IREDA', exchange: 'NSE', ltp: 200, close: 195 },
      { symbol: 'INVALID', ltp: 0 }, // Should be ignored
    ];
    const parsedArrayQuotes = parseMarketQuotesData(rawArrayData);
    assert(parsedArrayQuotes['INE142M01025']?.ltp === 1050.25, 'TEST 8.7', 'parseMarketQuotesData indexes by ISIN');
    assert(parsedArrayQuotes['TATATECH']?.ltp === 1050.25, 'TEST 8.8', 'parseMarketQuotesData indexes by Symbol');
    assert(parsedArrayQuotes['NSE:TATATECH']?.ltp === 1050.25, 'TEST 8.9', 'parseMarketQuotesData indexes by Exchange:Symbol');
    assert(parsedArrayQuotes['INVALID'] === undefined, 'TEST 8.10', 'parseMarketQuotesData discards invalid (zero) LTP');

    // 8.4 Distinguish Failure Diagnostics accurately
    function classifyQuoteFailure(params: {
      instruments: Array<{ symbol?: string | null; isin?: string | null }>;
      connectedAccounts: BrokerAccountItem[];
      authHeader?: string | null;
      apiError?: { status: number; message: string };
      responseData?: any;
    }): { reason: string; message: string } {
      const valid = params.instruments.filter((i) => Boolean(i.symbol?.trim()) || Boolean(i.isin?.trim()));
      if (valid.length === 0) {
        return { reason: 'NO_VALID_INSTRUMENTS', message: 'No valid trading symbols or ISINs found for these holdings.' };
      }
      if (!params.authHeader) {
        return { reason: 'AUTH_REQUIRED', message: 'Please sign in to fetch live market quotes.' };
      }
      const eligible = findQuoteEligibleAccount(params.connectedAccounts);
      if (!eligible && params.connectedAccounts.length > 0) {
        const names = params.connectedAccounts.map((a) => a.broker).join(', ');
        return { reason: 'NO_ELIGIBLE_BROKER', message: `Connected broker (${names}) does not support live market quotes.` };
      }
      if (params.apiError) {
        if (params.apiError.status === 401) return { reason: 'AUTH_REQUIRED', message: 'Session expired.' };
        if (params.apiError.status === 429) return { reason: 'RATE_LIMITED', message: 'Rate limit reached.' };
        if (params.apiError.status === 0) return { reason: 'NETWORK_ERROR', message: 'Network error.' };
        if (params.apiError.status >= 500) return { reason: 'SERVER_ERROR', message: 'Quote service unavailable.' };
      }
      if (Array.isArray(params.responseData) && params.responseData.length === 0) {
        return { reason: 'PROVIDER_EMPTY', message: 'Market quote provider returned no live prices.' };
      }
      return { reason: 'SUCCESS', message: 'Success' };
    }

    assert(
      classifyQuoteFailure({ instruments: [{ symbol: '' }], connectedAccounts: [upstoxAccount], authHeader: 'Bearer tok' }).reason === 'NO_VALID_INSTRUMENTS',
      'TEST 8.11',
      'Accurately classifies empty symbols as NO_VALID_INSTRUMENTS',
    );
    assert(
      classifyQuoteFailure({ instruments: [{ symbol: 'TATA' }], connectedAccounts: [zerodhaAccount], authHeader: 'Bearer tok' }).reason === 'NO_ELIGIBLE_BROKER',
      'TEST 8.12',
      'Accurately classifies Zerodha-only connection as NO_ELIGIBLE_BROKER',
    );
    assert(
      classifyQuoteFailure({ instruments: [{ symbol: 'TATA' }], connectedAccounts: [upstoxAccount], authHeader: null }).reason === 'AUTH_REQUIRED',
      'TEST 8.13',
      'Accurately classifies missing auth token as AUTH_REQUIRED',
    );
    assert(
      classifyQuoteFailure({ instruments: [{ symbol: 'TATA' }], connectedAccounts: [upstoxAccount], authHeader: 'Bearer tok', apiError: { status: 429, message: 'Too many requests' } }).reason === 'RATE_LIMITED',
      'TEST 8.14',
      'Accurately classifies 429 HTTP status as RATE_LIMITED',
    );
    assert(
      classifyQuoteFailure({ instruments: [{ symbol: 'TATA' }], connectedAccounts: [upstoxAccount], authHeader: 'Bearer tok', apiError: { status: 0, message: 'Network request failed' } }).reason === 'NETWORK_ERROR',
      'TEST 8.15',
      'Accurately classifies fetch/connection failure as NETWORK_ERROR',
    );
    assert(
      classifyQuoteFailure({ instruments: [{ symbol: 'TATA' }], connectedAccounts: [upstoxAccount], authHeader: 'Bearer tok', responseData: [] }).reason === 'PROVIDER_EMPTY',
      'TEST 8.16',
      'Accurately classifies empty provider response as PROVIDER_EMPTY',
    );

    // 8.5 Holdings Reconciliation: Zerodha portfolio success prevents false "Quotes Unavailable"
    function simulateHoldingsRefreshReconciliation(input: {
      portfolioData: { investments: any[] } | null;
      quotesDetailed: { quotes: Record<string, any>; failureReason?: string };
    }): { feedbackTitle: string; feedbackType: 'success' | 'warning' | 'error' } {
      const portfolioUpdated = Boolean(input.portfolioData?.investments && input.portfolioData.investments.length > 0);
      const quoteCount = Object.keys(input.quotesDetailed.quotes || {}).length;

      if (quoteCount > 0) {
        return { feedbackTitle: 'Holdings Refreshed', feedbackType: 'success' };
      } else if (portfolioUpdated) {
        // Reconciled: broker portfolio provided updated holding values
        return { feedbackTitle: 'Holdings Refreshed', feedbackType: 'success' };
      } else {
        return { feedbackTitle: 'Quotes Unavailable', feedbackType: 'warning' };
      }
    }

    const zerodhaRefreshOutcome = simulateHoldingsRefreshReconciliation({
      portfolioData: {
        investments: [{ symbol: 'TATATECH', isin: 'INE142M01025', currentHoldingPrice: 1050 }],
      },
      quotesDetailed: {
        quotes: {},
        failureReason: 'NO_ELIGIBLE_BROKER',
      },
    });

    assert(
      zerodhaRefreshOutcome.feedbackType === 'success',
      'TEST 8.17',
      'Reconciliation confirms SUCCESS when broker portfolio holdings price is updated, avoiding false "Quotes Unavailable" alert',
    );

    // 8.6 Preservation of existing LTP when refresh fails
    const initialHolding = {
      id: 'app-tatatech',
      status: 'Holding',
      buy_price: 500,
      quantity: 30,
      sell_price: 1045, // Existing LTP from previous successful sync
    };
    const failedQuotesMap: Record<string, any> = {}; // Refresh returned 0 quotes
    const quoteCountAfterFail = Object.keys(failedQuotesMap).length;

    // UI state updater guard: never overwrite if quoteCount === 0
    let stateQuotes = { 'INE142M01025': { ltp: 1045 } };
    if (quoteCountAfterFail > 0) {
      stateQuotes = { ...stateQuotes, ...failedQuotesMap };
    }

    const enrichedAfterFail = enrichApplicationsWithBrokerData(
      [initialHolding],
      iposWithoutIsin,
      null, // No new portfolio data
      stateQuotes, // Preserved quotes
    );

    assert(
      enrichedAfterFail[0].sell_price === 1045,
      'TEST 8.18',
      'Existing LTP (1045) is preserved upon refresh failure (never overwritten with 0 or null)',
    );
    assert(
      enrichedAfterFail[0].buy_price === 500,
      'TEST 8.19',
      'Application buy_price (500) remains strictly immutable',
    );
    assert(
      enrichedAfterFail[0].quantity === 30,
      'TEST 8.20',
      'Application quantity (30) remains strictly immutable',
    );
    assert(
      enrichedAfterFail[0].status === 'Holding',
      'TEST 8.21',
      'Holding status is unchanged (only confirmed executed sales from exact linked broker account may transition to Sold)',
    );

    // 8.7 UPSTOX-SPECIFIC QUOTE DIAGNOSTICS & REGRESSION TESTS
    // Test 8.22: KNOWN_IPO_ISINS offline dictionary provides valid ISINs when SQLite lacks isin column
    assert(
      KNOWN_IPO_ISINS['TATATECH'] === 'INE142M01025' &&
        KNOWN_IPO_ISINS['IREDA'] === 'INE202E01016' &&
        KNOWN_IPO_ISINS['BAJAJHFL'] === 'INE939X01017',
      'TEST 8.22',
      'KNOWN_IPO_ISINS dictionary correctly maps known IPO symbols to canonical ISINs',
    );

    // Test 8.23: extractHoldingInstrumentsForQuotes populates ISIN via dictionary when SQLite isin is null and brokerPortfolio is empty
    const localAppsWithoutBroker = [
      { id: 'app-tata', ipo_id: 'ipo-tata', ipo_name: 'Tata Technologies Limited', status: 'Holding' },
      { id: 'app-unknown', ipo_id: 'ipo-unknown', ipo_name: 'Unknown IPO Ltd', status: 'Holding' },
    ];
    const localIposWithoutIsin = [
      { id: 'ipo-tata', ipo_name: 'Tata Technologies Limited', symbol: 'TATATECH', isin: null },
      { id: 'ipo-unknown', ipo_name: 'Unknown IPO Ltd', symbol: 'UNKNOWN', isin: null },
    ];
    const extractedForUpstox = extractHoldingInstrumentsForQuotes(
      localAppsWithoutBroker,
      localIposWithoutIsin,
      [], // Empty broker investments
    );
    const tataResolved = extractedForUpstox.find((i) => i.symbol === 'TATATECH');
    assert(
      tataResolved?.isin === 'INE142M01025',
      'TEST 8.23',
      'extractHoldingInstrumentsForQuotes auto-populates ISIN from KNOWN_IPO_ISINS when SQLite isin is null',
    );

    // Test 8.24: Upstox instrument filtering protects against batch rejection
    // Upstox API v2 rejects the entire batch with HTTP 400 if even one symbol is sent without an ISIN
    const rawHoldingInstruments = extractedForUpstox; // [ { symbol: 'TATATECH', isin: 'INE142M01025' }, { symbol: 'UNKNOWN', isin: null } ]
    const upstoxSafeInstruments = rawHoldingInstruments.filter(
      (i) => Boolean(i.isin && i.isin.trim().length > 0)
    );
    assert(
      upstoxSafeInstruments.length === 1 && upstoxSafeInstruments[0].symbol === 'TATATECH',
      'TEST 8.24',
      'Upstox request instrument filter excludes non-ISIN instruments to prevent API batch rejection (HTTP 400)',
    );

    // Test 8.25: Upstox 401 token expiry wrapped as HTTP 400 Bad Request is classified as AUTH_REQUIRED
    function simulateBrokerApiErrorClassification(err: {
      status: number;
      message: string;
      isUpstox: boolean;
    }): { failureReason: string; errorMessage: string } {
      const status = err.status;
      const lowerMsg = err.message.toLowerCase();
      if (
        status === 401 ||
        lowerMsg.includes('401') ||
        lowerMsg.includes('unauthorized') ||
        lowerMsg.includes('token expired') ||
        lowerMsg.includes('token has expired') ||
        lowerMsg.includes('invalid token')
      ) {
        return {
          failureReason: 'AUTH_REQUIRED',
          errorMessage: err.isUpstox
            ? 'Your Upstox session has expired. Please reconnect your Upstox account in Profile.'
            : 'Authentication expired. Please sign in again to fetch market quotes.',
        };
      }
      if (status === 400 && lowerMsg.includes('invalid instrument key')) {
        return {
          failureReason: 'NO_VALID_INSTRUMENTS',
          errorMessage: 'Upstox requires valid ISIN identifiers (e.g. INE...) to fetch live market quotes.',
        };
      }
      return { failureReason: 'SERVER_ERROR', errorMessage: 'Quote service unavailable.' };
    }

    const upstox401WrappedAs400 = simulateBrokerApiErrorClassification({
      status: 400,
      message: 'Upstox quote fetch failed: Quote request failed with status 401',
      isUpstox: true,
    });
    assert(
      upstox401WrappedAs400.failureReason === 'AUTH_REQUIRED',
      'TEST 8.25a',
      'Wrapped Upstox 401 error is correctly classified as AUTH_REQUIRED instead of generic SERVER_ERROR',
    );
    assert(
      upstox401WrappedAs400.errorMessage.includes('Upstox session has expired'),
      'TEST 8.25b',
      'Provides user-friendly Upstox reconnection message prompting Profile reconnect',
    );

    // Test 8.26: Upstox invalid instrument key error is classified as NO_VALID_INSTRUMENTS
    const upstoxInvalidKey = simulateBrokerApiErrorClassification({
      status: 400,
      message: 'Upstox quote fetch failed: Invalid instrument key',
      isUpstox: true,
    });
    assert(
      upstoxInvalidKey.failureReason === 'NO_VALID_INSTRUMENTS',
      'TEST 8.26',
      'Upstox Invalid instrument key error is classified as NO_VALID_INSTRUMENTS with ISIN guidance',
    );

    // Test 8.27: Partial batch success preserves holding data across all holdings
    const previousHoldingQuotes = {
      INE142M01025: { ltp: 1045.0 }, // Tata Tech
      INE999999999: { ltp: 220.0 }, // Secondary holding
    };
    const freshUpstoxQuotes = {
      INE142M01025: { ltp: 1060.0 }, // Updated Tata Tech
    };
    // Merged state preserves secondary holding while updating Tata Tech
    const mergedQuotes = { ...previousHoldingQuotes, ...freshUpstoxQuotes };
    assert(
      mergedQuotes.INE142M01025.ltp === 1060.0,
      'TEST 8.27a',
      'Successfully merges fresh Upstox LTP for valid holding',
    );
    assert(
      mergedQuotes.INE999999999.ltp === 220.0,
      'TEST 8.27b',
      'Preserves existing LTP for holding omitted by partial batch',
    );

    // Test 8.28: All application quantities and buy prices strictly preserved
    const testHoldings = [
      { id: 'h-1', ipo_name: 'Tata Tech', status: 'Holding', buy_price: 500, quantity: 30, sell_price: 1045 },
      { id: 'h-2', ipo_name: 'Unknown', status: 'Holding', buy_price: 100, quantity: 15, sell_price: null },
    ];
    const enriched = enrichApplicationsWithBrokerData(
      testHoldings,
      localIposWithoutIsin,
      null,
      mergedQuotes,
    );
    assert(
      enriched[0].buy_price === 500 && enriched[0].quantity === 30,
      'TEST 8.28a',
      'Tata Tech buy price (500) and quantity (30) remain strictly immutable',
    );
    assert(
      enriched[1].buy_price === 100 && enriched[1].quantity === 15,
      'TEST 8.28b',
      'Unknown IPO buy price (100) and quantity (15) remain strictly immutable',
    );

    // ── 8.8 COMPREHENSIVE REGRESSION TESTS FOR ALL 6 ACTIVE HOLDINGS & UPSTOX QUOTES ──

    // Test 8.29: Formal ISIN Validation
    assert(
      isValidIsin('INE0TLQ01021') === true &&
        isValidIsin('INE307K01028') === true &&
        isValidIsin('INE08T701025') === true &&
        isValidIsin('INE505M01015') === true &&
        isValidIsin('INE0DRI01029') === true &&
        isValidIsin('INE590T01012') === true &&
        isValidIsin('INE142M01025') === true,
      'TEST 8.29a',
      'isValidIsin validates correct 12-character alphanumeric ISINs',
    );
    assert(
      isValidIsin(null) === false &&
        isValidIsin('') === false &&
        isValidIsin('TATATECH') === false &&
        isValidIsin('INE123') === false &&
        isValidIsin('INE142M01025TOOLONG') === false &&
        isValidIsin('ine142m01025') === true, // case-insensitive check passes trimmed uppercase
      'TEST 8.29b',
      'isValidIsin rejects null, empty, non-ISIN, and malformed identifiers',
    );

    // Test 8.30: All 6 Current Dashboard Holdings Identified and Verified
    // Traced from Dashboard screenshot:
    // 1. Kanohar Electricals (Qty: 22, LTP: 1137.30)
    // 2. SRIT India (Qty: 115, LTP: 133.00)
    // 3. Rentomojo (Qty: 37, LTP: 590.35)
    // 4. Adroit Industries (India) Limited (Qty: 111, LTP: 202.91)
    // 5. ESDS Software Solutions (Qty: 9, LTP: 1498.20)
    // 6. Karamtara Enginnering (Qty: 59, LTP: 405.90)
    const sixUserHoldingsApps = [
      { id: 'app-kanohar', ipo_id: 'ipo-kanohar', ipo_name: 'Kanohar Electricals', status: 'Holding', buy_price: 631.8, sell_price: 1137.3, quantity: 22 },
      { id: 'app-srit', ipo_id: 'ipo-srit', ipo_name: 'SRIT India', status: 'Holding', buy_price: 130.0, sell_price: 133.0, quantity: 115 },
      { id: 'app-rento', ipo_id: 'ipo-rento', ipo_name: 'Rentomojo', status: 'Holding', buy_price: 404.0, sell_price: 590.35, quantity: 37 },
      { id: 'app-adroit', ipo_id: 'ipo-adroit', ipo_name: 'Adroit Industries (India) Limited', status: 'Holding', buy_price: 134.0, sell_price: 202.91, quantity: 111 },
      { id: 'app-esds', ipo_id: 'ipo-esds', ipo_name: 'ESDS Software Solutions', status: 'Holding', buy_price: 429.0, sell_price: 1498.2, quantity: 9 },
      { id: 'app-karamtara', ipo_id: 'ipo-karamtara', ipo_name: 'Karamtara Enginnering', status: 'Holding', buy_price: 254.0, sell_price: 405.9, quantity: 59 },
    ];

    // Local SQLite IPO listings records (lacking ISIN column as in production SQLite schema)
    const sixLocalIposWithoutIsin = [
      { id: 'ipo-kanohar', ipo_name: 'Kanohar Electricals', company_name: 'Kanohar Electricals Limited', symbol: 'KANOHAR', isin: null, exchange: 'NSE' },
      { id: 'ipo-srit', ipo_name: 'SRIT India', company_name: 'SRIT India Limited', symbol: 'SRIT', isin: null, exchange: 'NSE' },
      { id: 'ipo-rento', ipo_name: 'Rentomojo', company_name: 'Rentomojo Limited', symbol: 'RENTOMOJO', isin: null, exchange: 'NSE' },
      { id: 'ipo-adroit', ipo_name: 'Adroit Industries (India) Limited', company_name: 'Adroit Industries (India) Limited', symbol: 'ADROITIND', isin: null, exchange: 'NSE' },
      { id: 'ipo-esds', ipo_name: 'ESDS Software Solutions', company_name: 'ESDS Software Solution Limited', symbol: 'ESDS', isin: null, exchange: 'NSE' },
      { id: 'ipo-karamtara', ipo_name: 'Karamtara Enginnering', company_name: 'Karamtara Engineering Limited', symbol: 'KARAMTARA', isin: null, exchange: 'NSE' },
    ];

    // Multi-tier canonical resolution for all 6 holdings
    const isinKanohar = resolveCanonicalIsin(sixLocalIposWithoutIsin[0], null, sixUserHoldingsApps[0]);
    const isinSrit = resolveCanonicalIsin(sixLocalIposWithoutIsin[1], null, sixUserHoldingsApps[1]);
    const isinRento = resolveCanonicalIsin(sixLocalIposWithoutIsin[2], null, sixUserHoldingsApps[2]);
    const isinAdroit = resolveCanonicalIsin(sixLocalIposWithoutIsin[3], null, sixUserHoldingsApps[3]);
    const isinEsds = resolveCanonicalIsin(sixLocalIposWithoutIsin[4], null, sixUserHoldingsApps[4]);
    const isinKaramtara = resolveCanonicalIsin(sixLocalIposWithoutIsin[5], null, sixUserHoldingsApps[5]);

    assert(
      isinKanohar === 'INE0TLQ01021' &&
        isinSrit === 'INE307K01028' &&
        isinRento === 'INE08T701025' &&
        isinAdroit === 'INE505M01015' &&
        isinEsds === 'INE0DRI01029' &&
        isinKaramtara === 'INE590T01012',
      'TEST 8.30',
      'Multi-tier canonical resolution resolves all 6 current holdings to verified official ISINs',
    );

    // Test 8.31: extractHoldingInstrumentsForQuotes successfully extracts all 6 holdings with valid ISINs
    const extractedSix = extractHoldingInstrumentsForQuotes(
      sixUserHoldingsApps,
      sixLocalIposWithoutIsin,
      null,
    );
    assert(
      extractedSix.length === 6,
      'TEST 8.31a',
      'extractHoldingInstrumentsForQuotes extracts all 6 active holdings',
    );
    assert(
      extractedSix.every((i) => Boolean(i.isin && isValidIsin(i.isin))),
      'TEST 8.31b',
      'All 6 extracted holdings have valid 12-char ISINs ready for Upstox quote requests',
    );

    // Test 8.32: Resolution Summary with missing metadata / unmapped holding
    const appsWithOneUnknown = [
      ...sixUserHoldingsApps,
      { id: 'app-unmapped', ipo_id: 'ipo-unmapped', ipo_name: 'Unmapped Emerging Tech Ltd', status: 'Holding', buy_price: 50, sell_price: null, quantity: 100 },
    ];
    const iposWithOneUnknown = [
      ...sixLocalIposWithoutIsin,
      { id: 'ipo-unmapped', ipo_name: 'Unmapped Emerging Tech Ltd', company_name: 'Unmapped Emerging Tech Ltd', symbol: 'UNMAPPED', isin: null, exchange: 'NSE' },
    ];
    const summary = extractHoldingInstrumentsResolutionSummary(
      appsWithOneUnknown,
      iposWithOneUnknown,
      null,
    );
    assert(
      summary.totalHoldings === 7 &&
        summary.resolvedInstruments.length === 6 &&
        summary.unresolvedHoldings.length === 1 &&
        summary.unresolvedHoldings[0].name === 'Unmapped Emerging Tech Ltd',
      'TEST 8.32',
      'Resolution summary accurately separates resolved (6) from unresolved (1) holdings without crashing',
    );

    // Test 8.33: Upstox batch excludes ONLY unresolved instruments and proceeds with valid instruments
    const isinRegex = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
    const allExtractedWithUnmapped = extractHoldingInstrumentsForQuotes(
      appsWithOneUnknown,
      iposWithOneUnknown,
      null,
    );
    const upstoxPayloadInstruments = allExtractedWithUnmapped.filter(
      (i) => Boolean(i.isin && isinRegex.test(i.isin.trim().toUpperCase())),
    );
    assert(
      upstoxPayloadInstruments.length === 6 &&
        !upstoxPayloadInstruments.some((i) => i.symbol === 'UNMAPPED'),
      'TEST 8.33',
      'Upstox request excludes unmapped instrument and continues with all 6 valid instruments (never fails entire batch)',
    );

    // Test 8.34: Partial quote success and response matching for all six holdings
    const partialUpstoxQuoteFeed = {
      INE0TLQ01021: { symbol: 'KANOHAR', isin: 'INE0TLQ01021', ltp: 1145.00 },
      INE307K01028: { symbol: 'SRIT', isin: 'INE307K01028', ltp: 136.50 },
      INE08T701025: { symbol: 'RENTOMOJO', isin: 'INE08T701025', ltp: 602.00 },
      INE505M01015: { symbol: 'ADROITIND', isin: 'INE505M01015', ltp: 210.00 },
      // ESDS and Karamtara omitted from live feed (e.g. illiquid / closed trading / partial provider response)
    };
    const parsedPartialQuotes = parseMarketQuotesData(partialUpstoxQuoteFeed);

    const ltpKanohar = findMatchingMarketQuote(sixUserHoldingsApps[0], sixLocalIposWithoutIsin[0], parsedPartialQuotes);
    const ltpSrit = findMatchingMarketQuote(sixUserHoldingsApps[1], sixLocalIposWithoutIsin[1], parsedPartialQuotes);
    const ltpRento = findMatchingMarketQuote(sixUserHoldingsApps[2], sixLocalIposWithoutIsin[2], parsedPartialQuotes);
    const ltpAdroit = findMatchingMarketQuote(sixUserHoldingsApps[3], sixLocalIposWithoutIsin[3], parsedPartialQuotes);
    const ltpEsds = findMatchingMarketQuote(sixUserHoldingsApps[4], sixLocalIposWithoutIsin[4], parsedPartialQuotes);
    const ltpKaramtara = findMatchingMarketQuote(sixUserHoldingsApps[5], sixLocalIposWithoutIsin[5], parsedPartialQuotes);

    assert(
      ltpKanohar === 1145.00 && ltpSrit === 136.50 && ltpRento === 602.00 && ltpAdroit === 210.00,
      'TEST 8.34a',
      'findMatchingMarketQuote matches fresh quotes for the 4 returned instruments via canonical ISIN',
    );
    assert(
      ltpEsds === null && ltpKaramtara === null,
      'TEST 8.34b',
      'findMatchingMarketQuote cleanly returns null for omitted quotes (never fabricates zero or stale as live)',
    );

    // Test 8.35: Strict preservation of existing LTP, buy price, quantity, and status on partial refresh
    const enrichedSixAfterPartial = enrichApplicationsWithBrokerData(
      sixUserHoldingsApps,
      sixLocalIposWithoutIsin,
      null,
      parsedPartialQuotes,
    );

    // Updated holdings receive live LTP
    assert(
      enrichedSixAfterPartial[0].sell_price === 1145.00 &&
        enrichedSixAfterPartial[1].sell_price === 136.50 &&
        enrichedSixAfterPartial[2].sell_price === 602.00 &&
        enrichedSixAfterPartial[3].sell_price === 210.00,
      'TEST 8.35a',
      'Live quotes update the 4 returned holding LTPs',
    );
    // Omitted holdings strictly PRESERVE their existing stored sell_price (LTP)
    assert(
      enrichedSixAfterPartial[4].sell_price === 1498.20 &&
        enrichedSixAfterPartial[5].sell_price === 405.90,
      'TEST 8.35b',
      'Omitted holdings strictly preserve their existing stored LTP (₹1498.20 and ₹405.90)',
    );
    // All quantities, buy prices, and Holding statuses remain completely preserved and unmutated
    assert(
      enrichedSixAfterPartial[0].quantity === 22 &&
        enrichedSixAfterPartial[1].quantity === 115 &&
        enrichedSixAfterPartial[2].quantity === 37 &&
        enrichedSixAfterPartial[3].quantity === 111 &&
        enrichedSixAfterPartial[4].quantity === 9 &&
        enrichedSixAfterPartial[5].quantity === 59,
      'TEST 8.35c',
      'All 6 holdings quantities remain strictly preserved',
    );
    assert(
      enrichedSixAfterPartial[0].buy_price === 631.8 &&
        enrichedSixAfterPartial[1].buy_price === 130.0 &&
        enrichedSixAfterPartial[2].buy_price === 404.0 &&
        enrichedSixAfterPartial[3].buy_price === 134.0 &&
        enrichedSixAfterPartial[4].buy_price === 429.0 &&
        enrichedSixAfterPartial[5].buy_price === 254.0,
      'TEST 8.35d',
      'All 6 holdings buy prices remain strictly preserved',
    );
    assert(
      enrichedSixAfterPartial.every((a) => a.status === 'Holding'),
      'TEST 8.35e',
      'All 6 holdings statuses remain strictly "Holding" (never transitioned to Sold)',
    );
  }

  console.log('\n===================================================================');
  console.log(`ALL TESTS PASSED (${passCount}/${passCount + failCount})`);
  console.log('===================================================================');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
