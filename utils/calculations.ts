/** Buy Value = Buy Price × Quantity */
export const calcBuyValue = (buyPrice: number, quantity: number): number =>
  buyPrice * quantity;

/** Sale Value = Sell Price × Quantity */
export const calcSaleValue = (sellPrice: number, quantity: number): number =>
  sellPrice * quantity;

/** Profit / Loss = Sale Value − Buy Value */
export const calcProfitLoss = (saleValue: number, buyValue: number): number =>
  saleValue - buyValue;

/** P/L % = (P/L ÷ Buy Value) × 100 */
export const calcProfitLossPct = (profitLoss: number, buyValue: number): number =>
  buyValue > 0 ? (profitLoss / buyValue) * 100 : 0;

/** Net Profit = P/L − Tax − User Cut */
export const calcNetProfit = (profitLoss: number, tax: number, userCut: number): number =>
  profitLoss - tax - userCut;

/**
 * Portfolio CAGR = ((totalInvested + netProfit) / totalInvested)^(1/years) − 1
 * Returns null if inputs are invalid (no invested capital, no time elapsed).
 */
export const calcPortfolioCAGR = (
  netProfit: number,
  totalInvested: number,
  earliestDateStr: string,
): number | null => {
  if (totalInvested <= 0 || !earliestDateStr) return null;
  const start = new Date(earliestDateStr).getTime();
  const now = Date.now();
  const years = (now - start) / (1000 * 60 * 60 * 24 * 365.25);
  if (years < 0.01) return null; // too little time elapsed
  const ratio = (totalInvested + netProfit) / totalInvested;
  if (ratio <= 0) return null;
  return (Math.pow(ratio, 1 / years) - 1) * 100;
};

/**
 * Bank Slots Calculation:
 * Available Balance = Current Balance - Blocked Amount
 * Slots = floor(Available Balance / IPO Upper Price)
 */
export const calcBankSlots = (
  balance: number,
  blocked: number,
  lotCost: number = 15000
): { available: number; slots: number } => {
  const available = Math.max(0, balance - blocked);
  const cost = lotCost > 0 ? lotCost : 15000;
  const slots = Math.floor(available / cost);
  return { available, slots };
};

export const SPECIAL_20PCT_USERS = ['anish', 'neha', 'nitish'];

export function calculateAppTaxAndNet(app: {
  status: string;
  user_name?: string;
  buy_price: number;
  quantity: number;
  sell_price?: number | null;
  tax?: number | null;
  user_cut?: number | null;
}) {
  const isSpecialUser = SPECIAL_20PCT_USERS.includes((app.user_name || '').trim().toLowerCase());
  const buyVal = calcBuyValue(app.buy_price, app.quantity);

  if (app.status === 'Sold') {
    const saleVal = calcSaleValue(app.sell_price ?? 0, app.quantity);
    const grossPL = calcProfitLoss(saleVal, buyVal);
    const tax = isSpecialUser && grossPL > 0 ? 0.20 * grossPL : (app.tax ?? 0);
    const userCut = app.user_cut ?? 0;
    const netPL = grossPL - tax - userCut;
    return { grossPL, tax, userCut, netPL, isHolding: false, isSold: true };
  } else if (app.status === 'Holding') {
    const curPrice = app.sell_price ?? app.buy_price;
    const holdingVal = calcSaleValue(curPrice, app.quantity);
    const grossPL = calcProfitLoss(holdingVal, buyVal);
    const tax = isSpecialUser && grossPL > 0 ? 0.20 * grossPL : 0;
    const netPL = grossPL - tax;
    return { grossPL, tax, userCut: 0, netPL, isHolding: true, isSold: false };
  }

  return { grossPL: 0, tax: 0, userCut: 0, netPL: 0, isHolding: false, isSold: false };
}

export const calcTotalSlots = (
  banks: Array<{ balance: number; blocked?: number }>,
  lotCost: number = 15000
): number => {
  return banks.reduce((total, b) => {
    const { slots } = calcBankSlots(b.balance, b.blocked ?? 0, lotCost);
    return total + slots;
  }, 0);
};
