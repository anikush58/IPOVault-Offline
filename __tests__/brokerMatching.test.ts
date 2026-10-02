import {
  enrichApplicationsWithBrokerData,
  findMatchingBrokerInvestment,
  getBrokerLtpForApplication,
  resolveCanonicalBrokerUserId,
  resolveEffectiveHoldingPrice,
  syncBrokerHoldingPricesToLocalDb,
} from '../utils/brokerMatching';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export async function runBrokerMatchingTestSuite() {
  console.log('==================================================');
  console.log('RUNNING BROKER MATCHING & LTP SYNC TEST SUITE');
  console.log('==================================================');

  const mockIpos = [
    {
      id: 'ipo-1',
      backend_ipo_id: 'b-ipo-1',
      isin: 'INE142Z01019',
      symbol: 'TATATECH',
      company_name: 'Tata Technologies Limited',
      ipo_name: 'Tata Tech IPO',
    },
    {
      id: 'ipo-2',
      backend_ipo_id: 'b-ipo-2',
      isin: 'INE080X01014',
      symbol: 'OLA',
      company_name: 'Ola Electric Mobility Limited',
      ipo_name: 'Ola Electric IPO',
    },
  ];

  const mockBrokerInvestments = [
    {
      isin: 'INE142Z01019',
      ipoId: 'b-ipo-1',
      symbol: 'TATATECH',
      companyName: 'Tata Technologies Ltd',
      currentHoldingPrice: 1045.5,
      weightedSellPrice: null,
      totalSoldQuantity: 0,
      remainingHoldingQuantity: 30,
      brokerHoldings: [{ broker: 'ZERODHA', quantity: 30, lastPrice: 1045.5 }],
      sellTrades: [],
    },
    {
      isin: 'INE080X01014',
      ipoId: 'b-ipo-2',
      symbol: 'OLA',
      companyName: 'Ola Electric Mobility Ltd',
      currentHoldingPrice: 75.25,
      weightedSellPrice: 85.0,
      totalSoldQuantity: 15,
      remainingHoldingQuantity: 0,
      brokerHoldings: [],
      sellTrades: [{ broker: 'DHAN', quantity: 15, price: 85.0 }],
    },
    {
      isin: 'INE999Z99999',
      ipoId: 'unrelated-id',
      symbol: 'UNRELATED',
      companyName: 'Unrelated Security Limited',
      currentHoldingPrice: 500.0,
      weightedSellPrice: null,
      totalSoldQuantity: 0,
      remainingHoldingQuantity: 100,
      brokerHoldings: [{ broker: 'UPSTOX', quantity: 100, lastPrice: 500.0 }],
      sellTrades: [],
    },
  ] as any;

  // Test 1: Holding + valid broker LTP -> sell_price updated to broker LTP
  const apps1 = [
    {
      id: 'app-1',
      ipo_id: 'ipo-1',
      ipo_name: 'Tata Tech IPO',
      status: 'Holding',
      buy_price: 500,
      sell_price: null,
      quantity: 30,
      user_broker: null,
    },
  ];
  const enriched1 = enrichApplicationsWithBrokerData(apps1, mockIpos, mockBrokerInvestments);
  assert(
    enriched1[0].sell_price === 1045.5 && enriched1[0].user_broker === 'ZERODHA',
    'Test 1',
    'Holding application receives authoritative broker LTP (1045.5) and broker attribution (ZERODHA)',
  );
  assert(
    enriched1[0].buy_price === 500 && enriched1[0].quantity === 30 && enriched1[0].status === 'Holding',
    'Test 1b',
    'Application buy_price, quantity, and status are untouched',
  );

  // Test 2: Holding + broker failure / null / 0 LTP -> existing price preserved
  const apps2 = [
    {
      id: 'app-unknown',
      ipo_id: 'ipo-unknown',
      ipo_name: 'Unknown IPO',
      status: 'Holding',
      buy_price: 300,
      sell_price: 350,
      quantity: 20,
      user_broker: 'MANUAL',
    },
  ];
  const enriched2 = enrichApplicationsWithBrokerData(apps2, mockIpos, mockBrokerInvestments);
  assert(
    enriched2[0].sell_price === 350,
    'Test 2',
    'Preserves existing manual sell_price (350) when no broker match exists',
  );

  // Test 3: Sold application -> sell_price never changed by broker market LTP
  const apps3 = [
    {
      id: 'app-sold-1',
      ipo_id: 'ipo-1',
      ipo_name: 'Tata Tech IPO',
      status: 'Sold',
      buy_price: 500,
      sell_price: 1200, // Executed manual sale price
      quantity: 30,
      user_broker: 'ZERODHA',
    },
  ];
  const enriched3 = enrichApplicationsWithBrokerData(apps3, mockIpos, mockBrokerInvestments);
  assert(
    enriched3[0].sell_price === 1200 && enriched3[0].status === 'Sold',
    'Test 3',
    'Sold application retains executed sale price (1200) and is not overwritten by market LTP (1045.5)',
  );

  // Test 4: Sold application uses executed broker trade price when broker trade record is present
  const apps4 = [
    {
      id: 'app-sold-2',
      ipo_id: 'ipo-2',
      ipo_name: 'Ola Electric IPO',
      status: 'Sold',
      buy_price: 76,
      sell_price: null,
      quantity: 15,
      user_broker: null,
    },
  ];
  const enriched4 = enrichApplicationsWithBrokerData(apps4, mockIpos, mockBrokerInvestments);
  assert(
    enriched4[0].sell_price === 85.0 && enriched4[0].user_broker === 'DHAN',
    'Test 4',
    'Sold application uses executed broker trade price (85.0), NOT market LTP (75.25)',
  );

  // Test 5: Application quantity and buy_price are NEVER modified from broker
  const apps5 = [
    {
      id: 'app-1',
      ipo_id: 'ipo-1',
      ipo_name: 'Tata Tech IPO',
      status: 'Holding',
      buy_price: 500,
      sell_price: null,
      quantity: 60,
    },
  ];
  const enriched5 = enrichApplicationsWithBrokerData(apps5, mockIpos, mockBrokerInvestments);
  assert(
    enriched5[0].quantity === 60 && enriched5[0].buy_price === 500,
    'Test 5',
    'Application quantity (60) and buy_price (500) are never overwritten by broker',
  );

  // Test 6: Portfolio Details and Holdings use the exact same LTP
  const holdingApp = {
    id: 'app-1',
    ipo_id: 'ipo-1',
    ipo_name: 'Tata Tech IPO',
    status: 'Holding',
    buy_price: 500,
    sell_price: null,
    quantity: 30,
  };
  const ltp = getBrokerLtpForApplication(holdingApp, mockIpos[0], mockBrokerInvestments);
  const enrichedApps = enrichApplicationsWithBrokerData([holdingApp], mockIpos, mockBrokerInvestments);
  assert(
    ltp === 1045.5 && enrichedApps[0].sell_price === ltp,
    'Test 6',
    'Portfolio Details and Holdings resolve the exact same authoritative LTP (1045.5)',
  );

  // Test 7: Unrelated broker holdings are ignored
  assert(
    enrichedApps.length === 1 && !enrichedApps.some((a) => a.ipo_name === 'Unrelated Security Limited'),
    'Test 7',
    'Unrelated broker holdings are completely ignored and not added to applications',
  );

  // Test 8: SQLite Persistence: syncBrokerHoldingPricesToLocalDb (LTP update)
  const mockCalls: Array<{ sql: string; params: any[] }> = [];
  const mockDb = {
    runAsync: async (sql: string, params: any[]) => {
      mockCalls.push({ sql, params });
      return { changes: 1 };
    },
  };

  const apps8 = [
    {
      id: 'app-holding-1',
      ipo_id: 'ipo-1',
      ipo_name: 'Tata Tech IPO',
      status: 'Holding',
      buy_price: 500,
      sell_price: null, // needs update to 1045.5
      quantity: 30,
    },
    {
      id: 'app-holding-already-synced',
      ipo_id: 'ipo-1',
      ipo_name: 'Tata Tech IPO',
      status: 'Holding',
      buy_price: 500,
      sell_price: 1045.5, // already synced, should skip
      quantity: 30,
    },
    {
      id: 'app-sold-1',
      ipo_id: 'ipo-1',
      ipo_name: 'Tata Tech IPO',
      status: 'Sold',
      buy_price: 500,
      sell_price: 1200, // Sold -> MUST NOT BE TOUCHED
      quantity: 30,
    },
  ];

  const updatedCount = await syncBrokerHoldingPricesToLocalDb(
    apps8,
    mockIpos,
    mockBrokerInvestments,
    mockDb,
  );

  assert(
    updatedCount === 1 && mockCalls.length === 1,
    'Test 8a',
    'syncBrokerHoldingPricesToLocalDb updates exactly 1 Holding application and skips already-synced and Sold rows',
  );
  assert(
    mockCalls[0].params[0] === 1045.5 && mockCalls[0].params[3] === 'app-holding-1',
    'Test 8b',
    'SQLite UPDATE writes correct LTP (1045.5) for app-holding-1',
  );

  // Test 9: Automatic sale detection: Holding application transitions to Sold when broker sold trade detected
  const holdingAppsWithSale = [
    {
      id: 'app-holding-to-sold',
      ipo_id: 'ipo-2',
      ipo_name: 'Ola Electric IPO',
      status: 'Holding',
      buy_price: 76,
      sell_price: null,
      quantity: 15,
      user_broker: null,
    },
  ];
  const enrichedAutoSold = enrichApplicationsWithBrokerData(holdingAppsWithSale, mockIpos, mockBrokerInvestments);
  assert(
    enrichedAutoSold[0].status === 'Sold' &&
    enrichedAutoSold[0].sell_price === 85.0 &&
    enrichedAutoSold[0].buy_price === 76 &&
    enrichedAutoSold[0].quantity === 15 &&
    enrichedAutoSold[0].user_broker === 'DHAN',
    'Test 9',
    'Holding application automatically becomes Sold with executed broker trade price (85.0) and preserved buy_price/quantity',
  );

  // Test 10: Automatic sale detection persisted to SQLite (status -> Sold, sell_price -> 85.0)
  const mockCallsAutoSale: Array<{ sql: string; params: any[] }> = [];
  const mockDbAutoSale = {
    runAsync: async (sql: string, params: any[]) => {
      mockCallsAutoSale.push({ sql, params });
      return { changes: 1 };
    },
  };
  const updatedCountAutoSale = await syncBrokerHoldingPricesToLocalDb(
    holdingAppsWithSale,
    mockIpos,
    mockBrokerInvestments,
    mockDbAutoSale,
  );
  assert(
    updatedCountAutoSale === 1 &&
    mockCallsAutoSale[0].sql.includes("status = 'Sold'") &&
    mockCallsAutoSale[0].params[0] === 85.0 &&
    mockCallsAutoSale[0].params[3] === 'app-holding-to-sold',
    'Test 10',
    'SQLite automatically updates status to Sold with actual executed sell price (85.0) for sold holding',
  );

  // Test 1: Holding + SQLite currentPrice = 200 + broker LTP = 237 -> resolved currentPrice MUST be 237
  const appsReq1 = [
    {
      id: 'app-belrise',
      ipo_id: 'ipo-belrise',
      ipo_name: 'Belrise Industries IPO',
      status: 'Holding',
      buy_price: 191.7,
      sell_price: 200.0, // Stored SQLite current price
      quantity: 75,
      user_broker: 'ZERODHA',
    },
  ];
  const iposReq1 = [
    {
      id: 'ipo-belrise',
      isin: 'INE894V01022',
      symbol: 'BELRISE',
      company_name: 'Belrise Industries Limited',
      ipo_name: 'Belrise Industries IPO',
    },
  ];
  const brokerInvReq1 = [
    {
      isin: 'INE894V01022',
      symbol: 'BELRISE',
      companyName: 'Belrise Industries Limited',
      currentHoldingPrice: 237.0, // Live Zerodha LTP
      weightedSellPrice: null,
      totalSoldQuantity: 0,
      remainingHoldingQuantity: 75,
      brokerHoldings: [{ broker: 'ZERODHA', quantity: 75, lastPrice: 237.0 }],
      sellTrades: [],
    },
  ] as any;
  const enrichedReq1 = enrichApplicationsWithBrokerData(appsReq1, iposReq1, brokerInvReq1);
  assert(
    enrichedReq1[0].sell_price === 237.0,
    'Requirement 1',
    'Holding + SQLite currentPrice = 200 + broker LTP = 237 -> resolved currentPrice MUST be 237 (broker overrides SQLite)',
  );

  // Test 2: Holding + SQLite sell_price/currentPrice = 200 + broker LTP unavailable -> resolved currentPrice MUST fall back to 200
  const enrichedReq2 = enrichApplicationsWithBrokerData(appsReq1, iposReq1, []);
  assert(
    enrichedReq2[0].sell_price === 200.0,
    'Requirement 2',
    'Holding + SQLite sell_price/currentPrice = 200 + broker LTP unavailable -> resolved currentPrice MUST fall back to 200',
  );

  // Test 3: Holding + no stored current price + broker LTP = 237 -> resolved currentPrice MUST be 237
  const appsReq3 = [
    {
      id: 'app-belrise-null',
      ipo_id: 'ipo-belrise',
      ipo_name: 'Belrise Industries IPO',
      status: 'Holding',
      buy_price: 191.7,
      sell_price: null, // no stored price
      quantity: 75,
      user_broker: null,
    },
  ];
  const enrichedReq3 = enrichApplicationsWithBrokerData(appsReq3, iposReq1, brokerInvReq1);
  assert(
    enrichedReq3[0].sell_price === 237.0,
    'Requirement 3',
    'Holding + no stored current price + broker LTP = 237 -> resolved currentPrice MUST be 237',
  );

  // Test 4: Sold + sell_price = 250 + broker LTP = 270 -> displayed price MUST remain 250
  const appsReq4 = [
    {
      id: 'app-sold-fixed',
      ipo_id: 'ipo-belrise',
      ipo_name: 'Belrise Industries IPO',
      status: 'Sold',
      buy_price: 191.7,
      sell_price: 250.0, // executed sell price
      quantity: 75,
      user_broker: 'ZERODHA',
    },
  ];
  const brokerInvReq4 = [
    {
      isin: 'INE894V01022',
      symbol: 'BELRISE',
      companyName: 'Belrise Industries Limited',
      currentHoldingPrice: 270.0, // market LTP
      weightedSellPrice: null,
      totalSoldQuantity: 0,
      remainingHoldingQuantity: 0,
      brokerHoldings: [],
      sellTrades: [],
    },
  ] as any;
  const enrichedReq4 = enrichApplicationsWithBrokerData(appsReq4, iposReq1, brokerInvReq4);
  assert(
    enrichedReq4[0].sell_price === 250.0 && enrichedReq4[0].status === 'Sold',
    'Requirement 4',
    'Sold + sell_price = 250 + broker LTP = 270 -> displayed price MUST remain 250 (never LTP 270)',
  );

  // Test 5: Dashboard and Applications -> Holdings resolve exactly the same currentPrice
  const ltpDashboard = resolveEffectiveHoldingPrice(appsReq1[0], iposReq1[0], brokerInvReq1);
  const ltpAppsTab = enrichedReq1[0].sell_price;
  assert(
    ltpDashboard === 237.0 && ltpAppsTab === 237.0 && ltpDashboard === ltpAppsTab,
    'Requirement 5',
    'Dashboard and Applications -> Holdings resolve exactly the same authoritative currentPrice (237.0)',
  );

  // Test 6: Unrelated broker holdings are ignored
  const brokerInvWithUnrelated = [
    ...brokerInvReq1,
    {
      isin: 'INE002A01018',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries Limited',
      currentHoldingPrice: 2800.0,
      weightedSellPrice: null,
      totalSoldQuantity: 0,
      remainingHoldingQuantity: 50,
      brokerHoldings: [{ broker: 'ZERODHA', quantity: 50, lastPrice: 2800.0 }],
      sellTrades: [],
    },
    {
      isin: 'INE467B01029',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services Limited',
      currentHoldingPrice: 3900.0,
      weightedSellPrice: null,
      totalSoldQuantity: 0,
      remainingHoldingQuantity: 20,
      brokerHoldings: [{ broker: 'ZERODHA', quantity: 20, lastPrice: 3900.0 }],
      sellTrades: [],
    },
  ] as any;
  const enrichedReq6 = enrichApplicationsWithBrokerData(appsReq1, iposReq1, brokerInvWithUnrelated);
  assert(
    enrichedReq6.length === 1 &&
    !enrichedReq6.some((a) => a.ipo_name?.includes('Reliance') || a.ipo_name?.includes('TCS')),
    'Requirement 6',
    'Unrelated broker holdings (Reliance, TCS) are completely ignored and never imported into IPOVault',
  );

  // Test 7: Broker LTP must never overwrite IPO quantity or buy_price
  assert(
    enrichedReq1[0].quantity === 75 &&
    enrichedReq1[0].buy_price === 191.7,
    'Requirement 7',
    'Broker LTP must never overwrite IPO quantity (75) or buy_price (191.7)',
  );

  // Test 8: Broker execution price must never be confused with LTP
  const appsReq8 = [
    {
      id: 'app-ola-sale',
      ipo_id: 'ipo-2',
      ipo_name: 'Ola Electric IPO',
      status: 'Holding',
      buy_price: 76.0,
      sell_price: null,
      quantity: 15,
      user_broker: null,
    },
  ];
  const enrichedReq8 = enrichApplicationsWithBrokerData(appsReq8, mockIpos, mockBrokerInvestments);
  assert(
    enrichedReq8[0].status === 'Sold' &&
    enrichedReq8[0].sell_price === 85.0 && // actual executed broker sell trade price
    enrichedReq8[0].sell_price !== 75.25, // NOT market LTP
    'Requirement 8',
    'Broker execution price (85.0) is stored as sell_price upon sale, never market LTP (75.25)',
  );

  // Test 9: Canonical User ID Resolution - Authenticated Supabase user ID takes highest priority
  const canonicalAuthUser = { id: '8b888228-e13c-4148-ac9f-a91d7381db12' };
  const mockLocalUsersWithMismatch = [
    { id: 'usr_local_123', owner_id: '8b888228-e13c-4148-ac9f-a91d7381db12' },
    { id: 'usr_local_456' },
  ];
  const resolvedAuthUid = resolveCanonicalBrokerUserId(canonicalAuthUser, mockLocalUsersWithMismatch);
  assert(
    resolvedAuthUid === '8b888228-e13c-4148-ac9f-a91d7381db12',
    'Identity Resolution 1',
    'Authenticated Supabase user ID (8b888228-e13c-4148-ac9f-a91d7381db12) is canonically resolved for broker API requests',
  );

  // Test 10: Canonical User ID Resolution - Local owner_id used when authUser is null (offline/reloading)
  const resolvedOfflineOwnerUid = resolveCanonicalBrokerUserId(null, mockLocalUsersWithMismatch);
  assert(
    resolvedOfflineOwnerUid === '8b888228-e13c-4148-ac9f-a91d7381db12',
    'Identity Resolution 2',
    'Local user owner_id is resolved when authUser context is null/offline',
  );

  // Test 11: Canonical User ID Resolution - Never falls back to dummy 'default-user' or random local id
  const mockUnlinkedLocalUsers = [{ id: 'usr_offline_only' }];
  const resolvedUnlinkedUid = resolveCanonicalBrokerUserId(null, mockUnlinkedLocalUsers);
  assert(
    resolvedUnlinkedUid === null,
    'Identity Resolution 3',
    'Unauthenticated/unlinked session returns null (never returns dummy default-user or random local SQLite ID)',
  );

  // Test 12: End-to-end flow - Canonical user portfolio matches Holding application to display broker LTP (237.0)
  const appsHoldingReq = [
    {
      id: 'app-belrise',
      ipo_id: 'ipo-belrise',
      ipo_name: 'Belrise Industries IPO',
      status: 'Holding',
      buy_price: 191.7,
      sell_price: 200.0, // Stored SQLite fallback
      quantity: 75,
      user_broker: null,
    },
  ];
  const iposHoldingReq = [
    {
      id: 'ipo-belrise',
      backend_ipo_id: 'backend-belrise-uuid',
      isin: 'INE0L2G01017',
      symbol: 'BELRISE',
      company_name: 'Belrise Industries Limited',
      ipo_name: 'Belrise Industries IPO',
    },
  ];
  const brokerPortfolioInvestments = [
    {
      isin: 'INE0L2G01017',
      ipoId: 'backend-belrise-uuid',
      symbol: 'BELRISE',
      companyName: 'Belrise Industries Limited',
      currentHoldingPrice: 237.0, // Authoritative Zerodha LTP
      weightedSellPrice: null,
      totalSoldQuantity: 0,
      remainingHoldingQuantity: 75,
      brokerHoldings: [{ broker: 'ZERODHA', quantity: 75, lastPrice: 237.0 }],
      sellTrades: [],
    },
  ] as any;
  const enrichedFinal = enrichApplicationsWithBrokerData(appsHoldingReq, iposHoldingReq, brokerPortfolioInvestments);
  assert(
    enrichedFinal[0].sell_price === 237.0 &&
    enrichedFinal[0].user_broker === 'ZERODHA' &&
    enrichedFinal[0].quantity === 75 &&
    enrichedFinal[0].buy_price === 191.7,
    'End-to-End Verification',
    'Holding application displays live Zerodha LTP (237.0) while preserving IPO identity (Belrise), quantity (75), and buy_price (191.7)',
  );

  console.log('==================================================');
  console.log('ALL BROKER MATCHING & IDENTITY TESTS PASSED (18/18)');
  console.log('==================================================');
}

if (require.main === module) {
  runBrokerMatchingTestSuite().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
