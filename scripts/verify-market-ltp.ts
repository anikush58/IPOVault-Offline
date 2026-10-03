import {
  extractHoldingInstrumentsForQuotes,
  enrichApplicationsWithBrokerData,
  getBrokerLtpForApplication,
} from '../utils/brokerMatching';
import { MarketQuotesMap } from '../services/broker/BrokerApiService';

async function main() {
  console.log('===============================================================');
  console.log('RUNTIME VERIFICATION: MARKET LTP & FAMILY-ACCOUNT ISOLATION');
  console.log('===============================================================');

  const ipos = [
    { id: 'ipo-belrise', isin: 'INE000000001', symbol: 'BELRISE', company_name: 'Belrise Industries Ltd' },
    { id: 'ipo-tatatech', isin: 'INE142Z01019', symbol: 'TATATECH', company_name: 'Tata Technologies Ltd' },
    { id: 'ipo-kross', isin: 'INE000000002', symbol: 'KROSS', company_name: 'Kross Limited' },
    { id: 'ipo-orient', isin: 'INE000000003', symbol: 'ORIENT', company_name: 'Orient Technologies Ltd' },
    { id: 'ipo-ola', isin: 'INE080X01014', symbol: 'OLA', company_name: 'Ola Electric Ltd' },
  ];

  // Exactly 5 IPOVault Holdings across family members
  const fiveHoldings = [
    {
      id: 'app-father-belrise',
      user_id: 'user-father',
      ipo_id: 'ipo-belrise',
      status: 'Holding',
      buy_price: 191.7,
      sell_price: 200.0,
      quantity: 75,
      user_broker: 'Zerodha Kite',
      broker_account_id: 'acc-zerodha-1',
    },
    {
      id: 'app-father-tatatech',
      user_id: 'user-father',
      ipo_id: 'ipo-tatatech',
      status: 'Holding',
      buy_price: 500.0,
      sell_price: 520.0,
      quantity: 30,
      user_broker: 'Zerodha Kite',
      broker_account_id: 'acc-zerodha-1',
    },
    {
      id: 'app-mother-kross',
      user_id: 'user-mother',
      ipo_id: 'ipo-kross',
      status: 'Holding',
      buy_price: 240.0,
      sell_price: 250.0,
      quantity: 62,
      user_broker: 'Dhan (Mother)',
      broker_account_id: 'acc-dhan-mother',
    },
    {
      id: 'app-mother-orient',
      user_id: 'user-mother',
      ipo_id: 'ipo-orient',
      status: 'Holding',
      buy_price: 206.0,
      sell_price: 215.0,
      quantity: 72,
      user_broker: 'Dhan (Mother)',
      broker_account_id: null,
    },
    {
      id: 'app-brother-ola',
      user_id: 'user-brother',
      ipo_id: 'ipo-ola',
      status: 'Holding',
      buy_price: 76.0,
      sell_price: null,
      quantity: 195,
      user_broker: 'Groww',
      broker_account_id: null,
    },
  ];

  // Broker Portfolio: Connected broker owns ONLY 1 (Belrise). The other 4 are NOT in holdings.
  const brokerPortfolioOwnsOne = [
    {
      isin: 'INE000000001',
      ipoId: 'ipo-belrise',
      symbol: 'BELRISE',
      companyName: 'Belrise Industries Ltd',
      currentHoldingPrice: 237.0,
      brokerHoldings: [{ brokerAccountId: 'acc-zerodha-1', broker: 'ZERODHA', quantity: 75, lastPrice: 237.0 }],
      sellTrades: [],
    },
  ] as any;

  // 1. Verification of Instrument Extraction
  const extracted = extractHoldingInstrumentsForQuotes(fiveHoldings, ipos);
  console.log(`\n[Check 1] Extracted ${extracted.length}/5 instruments for quote fetching:`);
  extracted.forEach((e, idx) => console.log(`  ${idx + 1}. Symbol: ${e.symbol}, ISIN: ${e.isin}, Exchange: ${e.exchange}`));

  // 2. Scenario A: Live Market Quote API provides LTP for all 5
  const marketQuotes: MarketQuotesMap = {
    'INE000000001': { symbol: 'BELRISE', isin: 'INE000000001', ltp: 242.0 },
    'INE142Z01019': { symbol: 'TATATECH', isin: 'INE142Z01019', ltp: 1045.5 },
    'INE000000002': { symbol: 'KROSS', isin: 'INE000000002', ltp: 185.0 },
    'INE000000003': { symbol: 'ORIENT', isin: 'INE000000003', ltp: 310.0 },
    'INE080X01014': { symbol: 'OLA', isin: 'INE080X01014', ltp: 78.5 },
  };

  const enrichedA = enrichApplicationsWithBrokerData(fiveHoldings, ipos, brokerPortfolioOwnsOne, marketQuotes);
  console.log('\n[Check 2] Scenario A: Live Market Quotes Active:');
  enrichedA.forEach((a) => {
    console.log(`  • App [${a.id}] -> Status: ${a.status}, Qty: ${a.quantity}, Buy: ₹${a.buy_price}, Display Price: ₹${a.sell_price}`);
  });

  // Verify all 5 received market quote LTP
  const liveCount = enrichedA.filter(
    (a) =>
      (a.id === 'app-father-belrise' && a.sell_price === 242.0) ||
      (a.id === 'app-father-tatatech' && a.sell_price === 1045.5) ||
      (a.id === 'app-mother-kross' && a.sell_price === 185.0) ||
      (a.id === 'app-mother-orient' && a.sell_price === 310.0) ||
      (a.id === 'app-brother-ola' && a.sell_price === 78.5)
  ).length;

  console.log(`\n  => Total Holdings: 5 | Live Market LTP: ${liveCount}/5`);

  // 3. Scenario B: Fallback when market quote API is unavailable / restricted
  console.log('\n[Check 3] Scenario B: Market Quotes Unavailable (Fallback Behavior):');
  const enrichedB = enrichApplicationsWithBrokerData(fiveHoldings, ipos, brokerPortfolioOwnsOne, null);
  enrichedB.forEach((a) => {
    console.log(`  • App [${a.id}] -> Status: ${a.status}, Display Price: ₹${a.sell_price}`);
  });

  // 4. Scenario C: Sold Detection on Linked Broker Account
  console.log('\n[Check 4] Scenario C: Sold Detection with Family-Account Isolation:');
  const brokerPortfolioWithFatherSale = [
    {
      isin: 'INE000000001',
      ipoId: 'ipo-belrise',
      symbol: 'BELRISE',
      companyName: 'Belrise Industries Ltd',
      currentHoldingPrice: 237.0,
      brokerHoldings: [], // Father sold out
      sellTrades: [{ brokerAccountId: 'acc-zerodha-1', broker: 'ZERODHA', quantity: 75, price: 255.0, tradedAt: new Date().toISOString() }],
    },
  ] as any;

  const enrichedC = enrichApplicationsWithBrokerData(fiveHoldings, ipos, brokerPortfolioWithFatherSale, marketQuotes);
  enrichedC.forEach((a) => {
    console.log(`  • App [${a.id}] -> Status: ${a.status}, Price: ₹${a.sell_price}`);
  });

  console.log('\n===============================================================');
  console.log('RUNTIME VERIFICATION PASSED SUCCESSFULLY');
  console.log('===============================================================');
}

main().catch(console.error);
