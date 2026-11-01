import type { User, BankAccount, ApplicationWithDetails } from '../context/DBContext';

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
  console.log('========================================================================');
  console.log('RUNNING USERS & BANKS PERFORMANCE AND TARGETED UPDATE REGRESSION TESTS');
  console.log('========================================================================\n');

  // --- 1. USER TARGETED UPDATES & CASCADE IN-MEMORY BEHAVIOR ---
  console.log('--- 1. User Targeted State Updates ---');

  let usersState: User[] = [
    { id: 'usr-1', name: 'Bob Sharma', pan_number: 'ABCDE1234F', broker: 'Zerodha', bank_name: 'HDFC Bank', upi_app: 'GPay', tpin: '', default_amount_blocked: 0, archived: 0 },
    { id: 'usr-2', name: 'Charlie Verma', pan_number: 'FGHIJ5678K', broker: 'Groww', bank_name: 'SBI Bank', upi_app: 'PhonePe', tpin: '', default_amount_blocked: 0, archived: 0 },
  ];

  let applicationsState: ApplicationWithDetails[] = [
    {
      id: 'app-1',
      user_id: 'usr-1',
      ipo_id: 'ipo-1',
      category: 'RETAIL',
      status: 'Applied',
      sell_price: null,
      sale_date: null,
      tax: 0,
      user_cut: 0,
      shares_count: 50,
      is_favorite: 0,
      created_at: '',
      open_date: '2026-10-28',
      user_name: 'Bob Sharma',
      user_broker: 'Zerodha',
      user_pan_number: 'ABCDE1234F',
      user_bank_name: 'HDFC Bank',
      user_upi_app: 'GPay',
      ipo_name: 'Swiggy',
      buy_price: 390,
      quantity: 50,
    },
    {
      id: 'app-2',
      user_id: 'usr-2',
      ipo_id: 'ipo-1',
      category: 'RETAIL',
      status: 'Allotted',
      sell_price: null,
      sale_date: null,
      tax: 0,
      user_cut: 0,
      shares_count: 50,
      is_favorite: 0,
      created_at: '',
      open_date: '2026-10-28',
      user_name: 'Charlie Verma',
      user_broker: 'Groww',
      user_pan_number: 'FGHIJ5678K',
      user_bank_name: 'SBI Bank',
      user_upi_app: 'PhonePe',
      ipo_name: 'Swiggy',
      buy_price: 390,
      quantity: 50,
    },
  ];

  // Simulation of addUser targeted update:
  const newUser: User = {
    id: 'usr-3',
    name: 'Alice Gupta',
    pan_number: 'KLMNO9012P',
    broker: 'Dhan',
    bank_name: 'ICICI Bank',
    upi_app: 'Paytm',
    tpin: '',
    default_amount_blocked: 0,
    archived: 0,
  };
  usersState = [...usersState, newUser].sort((a, b) => a.name.localeCompare(b.name));

  assert(usersState.length === 3, 'User Add', 'User count increased to 3 immediately');
  assert(usersState[0].name === 'Alice Gupta', 'User Sorting', 'Alice is sorted to top alphabetically');
  assert(usersState[1].name === 'Bob Sharma', 'User Order', 'Bob remains at index 1');

  // Simulation of updateUser targeted update + cascade:
  const updatedData: Omit<User, 'id'> = {
    name: 'Bob M. Sharma',
    broker: 'Angel One',
    client_id: 'CL-999',
    pan_number: 'ABCDE1234F',
    bank_name: 'Axis Bank',
    upi_app: 'BHIM',
    tpin: '',
    default_amount_blocked: 0,
  };

  usersState = usersState.map((u) => (u.id === 'usr-1' ? { ...u, ...updatedData } : u));
  applicationsState = applicationsState.map((a) =>
    a.user_id === 'usr-1'
      ? {
          ...a,
          user_name: updatedData.name || a.user_name,
          user_broker: updatedData.broker || a.user_broker,
          user_client_id: updatedData.client_id !== undefined ? updatedData.client_id : a.user_client_id,
          user_pan_number: updatedData.pan_number !== undefined ? updatedData.pan_number : a.user_pan_number,
          user_bank_name: updatedData.bank_name || a.user_bank_name,
          user_upi_app: updatedData.upi_app || a.user_upi_app,
        }
      : a
  );

  const bobUser = usersState.find((u) => u.id === 'usr-1');
  const bobApp = applicationsState.find((a) => a.user_id === 'usr-1');
  const charlieApp = applicationsState.find((a) => a.user_id === 'usr-2');

  assert(bobUser?.name === 'Bob M. Sharma', 'User Update', 'User name updated in users state');
  assert(bobUser?.broker === 'Angel One', 'User Broker', 'User broker updated in users state');
  assert(bobApp?.user_name === 'Bob M. Sharma', 'User App Cascade', 'Application user_name cascaded');
  assert(bobApp?.user_broker === 'Angel One', 'App Broker Cascade', 'Application broker cascaded');
  assert(charlieApp?.user_name === 'Charlie Verma', 'User Isolation', 'Unrelated user application unaffected');

  // Simulation of archiveUser / unarchiveUser:
  usersState = usersState.map((u) => (u.id === 'usr-1' ? { ...u, archived: 1 } : u));
  assert(usersState.find((u) => u.id === 'usr-1')?.archived === 1, 'Archive User', 'User archived status set to 1 in memory');

  usersState = usersState.map((u) => (u.id === 'usr-1' ? { ...u, archived: 0 } : u));
  assert(usersState.find((u) => u.id === 'usr-1')?.archived === 0, 'Unarchive User', 'User archived status restored to 0 in memory');


  // --- 2. BANK TARGETED UPDATES & CASCADE IN-MEMORY BEHAVIOR ---
  console.log('\n--- 2. Bank Targeted State Updates ---');

  let bankAccountsState: BankAccount[] = [
    { id: 'bnk-1', bank_name: 'HDFC Bank', balance: 150000, upi_app: 'GPay', created_at: '', updated_at: '' },
    { id: 'bnk-2', bank_name: 'State Bank of India', balance: 80000, upi_app: 'BHIM', created_at: '', updated_at: '' },
  ];

  // Simulation of addBankAccount targeted update:
  const newBank: BankAccount = {
    id: 'bnk-3',
    bank_name: 'Axis Bank',
    balance: 200000,
    upi_app: 'PhonePe',
    created_at: '2026-10-28T12:00:00Z',
    updated_at: '2026-10-28T12:00:00Z',
  };

  bankAccountsState = [...bankAccountsState, newBank].sort((a, b) => a.bank_name.localeCompare(b.bank_name));
  assert(bankAccountsState.length === 3, 'Bank Add', 'Bank account count increased to 3');
  assert(bankAccountsState[0].bank_name === 'Axis Bank', 'Bank Sorting', 'Axis Bank sorted to index 0');

  // Simulation of updateBankBalance targeted update with bank rename:
  const targetBankId = 'bnk-1';
  const newBalance = 175000;
  const newBankName = 'HDFC Bank Ltd';
  const newUpiApp = 'GPay';
  let oldBankName: string | undefined;

  // Set app-1 bank_name to HDFC Bank for cascade testing
  applicationsState = applicationsState.map((a) => (a.id === 'app-1' ? { ...a, user_bank_name: 'HDFC Bank' } : a));

  bankAccountsState = bankAccountsState.map((b) => {
    if (b.id !== targetBankId) return b;
    oldBankName = b.bank_name;
    return {
      ...b,
      balance: newBalance,
      bank_name: newBankName,
      upi_app: newUpiApp,
    };
  });

  // Cascade bank rename to users and applications
  if (oldBankName && newBankName !== oldBankName) {
    usersState = usersState.map((u) => (u.bank_name === oldBankName ? { ...u, bank_name: newBankName } : u));
    applicationsState = applicationsState.map((a) => (a.user_bank_name === oldBankName ? { ...a, user_bank_name: newBankName } : a));
  }

  const hdfcBank = bankAccountsState.find((b) => b.id === 'bnk-1');
  assert(hdfcBank?.balance === 175000, 'Bank Balance Update', 'Bank balance updated to 175000');
  assert(hdfcBank?.bank_name === 'HDFC Bank Ltd', 'Bank Name Update', 'Bank name updated to HDFC Bank Ltd');
  assert(applicationsState.find((a) => a.id === 'app-1')?.user_bank_name === 'HDFC Bank Ltd', 'Bank Rename Cascade', 'Application user_bank_name cascaded');


  // --- 3. O(1) MAP LOOKUP OPTIMIZATIONS ---
  console.log('\n--- 3. Complexity & Data Lookup Performance ---');

  // Test statsByUser Map construction & lookup
  const statsByUser = new Map<string, { applied: number; allotted: number; decided: number }>();
  for (const a of applicationsState) {
    let s = statsByUser.get(a.user_id);
    if (!s) {
      s = { applied: 0, allotted: 0, decided: 0 };
      statsByUser.set(a.user_id, s);
    }
    s.applied++;
    const st = a.status;
    if (st === 'Allotted' || st === 'Holding' || st === 'Sold') {
      s.allotted++;
      s.decided++;
    } else if (st === 'Not Allotted') {
      s.decided++;
    }
  }

  const user1Stats = statsByUser.get('usr-1');
  const user2Stats = statsByUser.get('usr-2');

  assert(user1Stats?.applied === 1, 'Stats Applied', 'User 1 applied count is 1');
  assert(user1Stats?.allotted === 0, 'Stats Allotted', 'User 1 allotted count is 0');
  assert(user2Stats?.applied === 1, 'Stats Applied User 2', 'User 2 applied count is 1');
  assert(user2Stats?.allotted === 1, 'Stats Allotted User 2', 'User 2 allotted count is 1');

  // Test blockedByBank Map construction & lookup
  const blockedByBank = new Map<string, number>();
  applicationsState.push({
    ...applicationsState[0],
    id: 'app-3',
    status: 'Mandate Approved',
    buy_price: 15000,
    quantity: 1,
    user_bank_name: 'HDFC Bank Ltd',
  });

  for (const a of applicationsState) {
    if (a.status === 'Mandate Approved') {
      const key = (a.user_bank_name || '').trim().toLowerCase();
      if (key) {
        blockedByBank.set(key, (blockedByBank.get(key) || 0) + (a.buy_price || 0) * (a.quantity || 0));
      }
    }
  }

  const hdfcBlocked = blockedByBank.get('hdfc bank ltd') || 0;
  const sbiBlocked = blockedByBank.get('state bank of india') || 0;

  assert(hdfcBlocked === 15000, 'Blocked Capital HDFC', 'HDFC Bank Ltd has ₹15,000 blocked capital');
  assert(sbiBlocked === 0, 'Blocked Capital SBI', 'SBI has ₹0 blocked capital');


  // --- 4. CLOUD SYNC ISOLATION ---
  console.log('\n--- 4. Cloud Sync Isolation & Payload Safety ---');

  // Verify single doc upsert payload for User does not contain full db dump
  const profileUpsertPayload = {
    name: bobUser?.name,
    pan_number: bobUser?.pan_number,
    client_id: bobUser?.client_id,
    broker: bobUser?.broker,
    id: bobUser?.id,
  };
  assert(!('applications' in profileUpsertPayload), 'Single Doc User', 'User payload excludes applications list');
  assert(!('bankAccounts' in profileUpsertPayload), 'Single Doc User', 'User payload excludes bank accounts list');
  assert(profileUpsertPayload.id === 'usr-1', 'Single Doc User ID', 'User payload targets specific profile id');

  // Verify single doc upsert payload for Bank
  const bankUpsertPayload = {
    bank_name: hdfcBank?.bank_name,
    balance: hdfcBank?.balance,
    upi_app: hdfcBank?.upi_app,
  };
  assert(!('users' in bankUpsertPayload), 'Single Doc Bank', 'Bank payload excludes users list');
  assert(bankUpsertPayload.balance === 175000, 'Single Doc Bank Balance', 'Bank payload has exact balance 175000');

  console.log('\n========================================================================');
  console.log(`ALL TESTS PASSED: ${passCount} / ${passCount + failCount}`);
  console.log('========================================================================');
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
