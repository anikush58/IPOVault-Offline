import { evaluateIPORadarScore } from '../services/ipo/radarScoringEngine';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, message: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${message}`);
    passCount++;
  } else {
    console.error(`✗ FAIL: [${testName}] ${message}`);
    failCount++;
  }
}

console.log('==================================================');
console.log('RUNNING IPO RADAR V2-V5 REGRESSION TEST SUITE');
console.log('==================================================\n');

// 1. No-data IPO
const test1_noData = evaluateIPORadarScore({
  id: 'test-1', company_name: 'Blank IPO Ltd', ipo_name: 'Blank IPO', symbol: 'BLANK', exchange: 'NSE', issue_type: 'Mainboard',
  price_band_min: 100, price_band_max: 100, lot_size: 100, issue_size: 100, status: 'Upcoming',
  gmp_amount: null, gmp_percent: null, profit_per_lot: null, total_sub: null, retail_sub: null, qib_sub: null, nii_sub: null,
  score: undefined, sync_version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
  registrar: '', lead_manager: '', description: '', logo_url: '', sector: '', website: '', prospectus_url: '', allotment_link: '', registrar_website: ''
} as any);
assert(test1_noData.category === 'LOW_PRIORITY', '1. No-data IPO', `Category is ${test1_noData.category} (Expected LOW_PRIORITY)`);
assert(test1_noData.score < 35, '1. No-data IPO', `Score is ${test1_noData.score} (Expected < 35)`);

// 2. High Conviction IPO
const test2_highConv = evaluateIPORadarScore({
  id: 'test-2', company_name: 'High Conviction IPO Ltd', ipo_name: 'High Conviction IPO',
  gmp_amount: 60, gmp_percent: 61.2, price_band_max: 100, lot_size: 150, profit_per_lot: 9000,
  qib_sub: 60, nii_sub: 40, retail_sub: 25, total_sub: 45, score: { total_score: 88, recommendation: 'Strong Apply', categories: {} },
  issue_type: 'Mainboard', status: 'Open', sync_version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
  symbol: 'HIGH', exchange: 'NSE', issue_size: 50, registrar: '', lead_manager: '', logo_url: '', sector: '', description: '', website: '', prospectus_url: '', registrar_website: '', allotment_link: ''
} as any);
assert(test2_highConv.category === 'HIGH_CONVICTION', '2. High Conviction IPO', `Category is ${test2_highConv.category}`);

console.log(`\nSUMMARY: Passed ${passCount} / ${passCount + failCount} tests.`);
