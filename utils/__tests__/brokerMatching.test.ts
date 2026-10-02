import {
  normalizeNameForMatching,
  getCompactKey,
  findMatchingBrokerInvestment,
  getBrokerLtpForApplication,
} from '../brokerMatching';
import { UserPortfolioIpoSummary } from '@/services/broker/BrokerApiService';

export const mockBrokerInvestments: UserPortfolioIpoSummary[] = [
  {
    ipoId: 'inst-1',
    isin: 'INE894V01022',
    symbol: 'BELRISE',
    companyName: 'BELRISE',
    logoUrl: null,
    exchange: 'BSE',
    status: 'HOLDING',
    allottedQuantity: 75,
    allotmentPrice: 191.7,
    allotmentDate: null,
    totalSoldQuantity: 0,
    weightedSellPrice: null,
    totalSellValue: 0,
    realizedPnl: 0,
    remainingHoldingQuantity: 75,
    currentHoldingPrice: 237.0,
    priceSource: 'BROKER_HOLDING',
    totalHoldingValue: 17775.0,
    unrealizedPnl: 3397.5,
    totalPnl: 3397.5,
    brokerHoldings: [
      {
        brokerAccountId: 'acc-1',
        broker: 'ZERODHA',
        quantity: 75,
        averagePrice: 191.7,
        lastPrice: 237.0,
        currentValue: 17775.0,
        unrealizedPnl: 3397.5,
        asOf: '2026-10-02T12:00:00Z',
      },
    ],
    sellTrades: [],
  },
  {
    ipoId: 'inst-2',
    isin: 'INE509F01029',
    symbol: 'CUPID',
    companyName: 'CUPID LIMITED',
    logoUrl: null,
    exchange: 'BSE',
    status: 'HOLDING',
    allottedQuantity: 152,
    allotmentPrice: 136.36,
    allotmentDate: null,
    totalSoldQuantity: 0,
    weightedSellPrice: null,
    totalSellValue: 0,
    realizedPnl: 0,
    remainingHoldingQuantity: 152,
    currentHoldingPrice: 312.9,
    priceSource: 'BROKER_HOLDING',
    totalHoldingValue: 47560.8,
    unrealizedPnl: 26833.75,
    totalPnl: 26833.75,
    brokerHoldings: [],
    sellTrades: [],
  },
  {
    ipoId: 'inst-3',
    isin: 'INE055S01018',
    symbol: 'CYIENTDLM',
    companyName: 'CYIENT DLM LIMITED',
    logoUrl: null,
    exchange: 'NSE',
    status: 'HOLDING',
    allottedQuantity: 25,
    allotmentPrice: 507.0,
    allotmentDate: null,
    totalSoldQuantity: 0,
    weightedSellPrice: null,
    totalSellValue: 0,
    realizedPnl: 0,
    remainingHoldingQuantity: 25,
    currentHoldingPrice: 890.0,
    priceSource: 'BROKER_HOLDING',
    totalHoldingValue: 22250.0,
    unrealizedPnl: 9572.85,
    totalPnl: 9572.85,
    brokerHoldings: [],
    sellTrades: [],
  },
];

export function runBrokerMatchingTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function assert(condition: boolean, msg: string) {
    if (condition) {
      passed++;
    } else {
      failed++;
      errors.push(`Assertion failed: ${msg}`);
    }
  }

  // 1. Normalization tests
  assert(
    normalizeNameForMatching('Belrise Industries Limited') === 'BELRISE',
    'normalize Belrise Industries Limited -> BELRISE',
  );
  assert(
    normalizeNameForMatching('Belrise Industries IPO') === 'BELRISE',
    'normalize Belrise Industries IPO -> BELRISE',
  );
  assert(
    normalizeNameForMatching('Cyient DLM Private Limited') === 'CYIENT DLM',
    'normalize Cyient DLM Private Limited -> CYIENT DLM',
  );
  assert(
    normalizeNameForMatching('Orient Cables (India) Limited SME IPO') === 'ORIENT CABLES',
    'normalize Orient Cables (India) Limited SME IPO -> ORIENT CABLES',
  );

  // 2. Compact Key tests
  assert(getCompactKey('CYIENT DLM') === 'CYIENTDLM', 'compact key for CYIENT DLM');
  assert(getCompactKey('BELRISE-IND.') === 'BELRISEIND', 'compact key for BELRISE-IND.');

  // 3. Belrise Industries IPO + broker symbol BELRISE -> LTP matched (237.0)
  const app1 = {
    id: 'app-1',
    ipo_name: 'Belrise Industries IPO',
    quantity: 75,
    buy_price: 191.7,
  };
  const matchedIpo1 = {
    id: 'ipo-1',
    company_name: 'Belrise Industries Limited',
    symbol: '',
    isin: null,
  };
  const ltp1 = getBrokerLtpForApplication(app1, matchedIpo1, mockBrokerInvestments);
  assert(ltp1 === 237.0, 'Belrise Industries IPO matches broker symbol BELRISE with LTP 237.0');
  assert(app1.quantity === 75, 'Application quantity remains 75 (never overwritten)');
  assert(app1.buy_price === 191.7, 'Application buy_price remains 191.7 (never overwritten)');

  // 4. ISIN match
  const appIsin = { ipo_name: 'Cyient DLM' };
  const matchedIpoIsin = { isin: 'INE055S01018' };
  const matchIsin = findMatchingBrokerInvestment(appIsin, matchedIpoIsin, mockBrokerInvestments);
  assert(matchIsin?.symbol === 'CYIENTDLM', 'ISIN match returns CYIENTDLM');
  assert(matchIsin?.currentHoldingPrice === 890.0, 'ISIN match returns LTP 890.0');

  // 5. Symbol match
  const appSym = { ipo_name: 'Belrise' };
  const matchedIpoSym = { symbol: 'BELRISE' };
  const matchSym = findMatchingBrokerInvestment(appSym, matchedIpoSym, mockBrokerInvestments);
  assert(matchSym?.symbol === 'BELRISE', 'Exact symbol match returns BELRISE');
  assert(matchSym?.currentHoldingPrice === 237.0, 'Exact symbol match returns LTP 237.0');

  // 6. Cyient DLM IPO by normalized company name / compact token
  const appCyient = { ipo_name: 'Cyient DLM IPO' };
  const matchedIpoCyient = { company_name: 'Cyient DLM Limited' };
  const ltpCyient = getBrokerLtpForApplication(appCyient, matchedIpoCyient, mockBrokerInvestments);
  assert(ltpCyient === 890.0, 'Cyient DLM matches broker symbol CYIENTDLM with LTP 890.0');

  // 7. Unmatched application -> returns null to preserve existing fallback
  const appUnmatched = { ipo_name: 'Tata Technologies IPO' };
  const matchedIpoUnmatched = { company_name: 'Tata Technologies Limited' };
  const ltpUnmatched = getBrokerLtpForApplication(appUnmatched, matchedIpoUnmatched, mockBrokerInvestments);
  assert(ltpUnmatched === null, 'Unmatched application returns null');

  // 8. Unrelated broker holdings (e.g. CUPID) do not match unrelated application
  const appOrient = { ipo_name: 'Orient Cables IPO' };
  const matchedIpoOrient = { company_name: 'Orient Cables (India) Limited' };
  const matchOrient = findMatchingBrokerInvestment(appOrient, matchedIpoOrient, mockBrokerInvestments);
  assert(matchOrient === null, 'CUPID broker holding does not match Orient Cables application');

  return { passed, failed, errors };
}
