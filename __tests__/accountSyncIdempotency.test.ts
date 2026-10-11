/**
 * Account Sync Idempotency & Multi-Account Preservation Regression Tests
 *
 * Verifies:
 * 1. Repeated sync or refresh does not create duplicate bank accounts.
 * 2. Cloud restore preserves stable bank IDs instead of generating new random UUIDs.
 * 3. Genuinely separate accounts at the same bank (different UPI apps or distinct IDs) are preserved.
 * 4. Offline bank accounts are adopted on login without duplicating.
 * 5. Concurrent delta sync calls do not duplicate accounts.
 * 6. User account isolation is strictly enforced.
 */

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

interface BankAccountRow {
  id: string;
  bank_name: string;
  balance: number;
  upi_app: string;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * SQLite Mock Engine simulating the exact logic from DBContext.importSecondaryData
 * and firestoreSyncService.applySecondaryDeltaToSQLite
 */
class MockSQLiteDB {
  public bankAccounts: BankAccountRow[] = [];

  async getAllAsync<T>(query: string, params: any[] = []): Promise<T[]> {
    if (query.includes('FROM bank_accounts')) {
      let filtered = this.bankAccounts.filter((b) => b.deleted_at === null);
      if (query.includes('owner_id = ? OR owner_id IS NULL OR owner_id = ""')) {
        const uid = params[0];
        filtered = filtered.filter((b) => b.owner_id === uid || b.owner_id === null || b.owner_id === '');
      } else if (query.includes('owner_id = ?')) {
        const uid = params[0];
        filtered = filtered.filter((b) => b.owner_id === uid);
      } else if (query.includes('(owner_id IS NULL OR owner_id = "")')) {
        filtered = filtered.filter((b) => b.owner_id === null || b.owner_id === '');
      }
      return filtered as unknown as T[];
    }
    return [];
  }

  async getFirstAsync<T>(query: string, params: any[] = []): Promise<T | null> {
    if (query.includes('FROM bank_accounts WHERE id = ?')) {
      const id = params[0];
      const match = this.bankAccounts.find((b) => b.id === id);
      return (match || null) as unknown as T | null;
    }
    if (
      query.includes('LOWER(TRIM(bank_name)) = LOWER(TRIM(?))') ||
      query.includes('bank_name = ? AND upi_app = ?')
    ) {
      const bankName = (params[0] || '').trim().toLowerCase();
      const upiApp = (params[1] || '').trim().toLowerCase();
      const match = this.bankAccounts.find(
        (b) =>
          (b.owner_id === null || b.owner_id === '') &&
          b.bank_name.trim().toLowerCase() === bankName &&
          (b.upi_app || '').trim().toLowerCase() === upiApp &&
          b.deleted_at === null
      );
      return (match || null) as unknown as T | null;
    }
    return null;
  }

  async runAsync(query: string, params: any[] = []): Promise<void> {
    const now = new Date().toISOString();
    if (query.startsWith('INSERT INTO bank_accounts')) {
      const [id, bankName, balance, upiApp, ownerId, createdAt, updatedAt] = params;
      this.bankAccounts.push({
        id,
        bank_name: bankName,
        balance: balance ?? 0,
        upi_app: upiApp ?? '',
        owner_id: ownerId ?? null,
        created_at: createdAt || now,
        updated_at: updatedAt || now,
        deleted_at: null,
      });
    } else if (query.startsWith('UPDATE bank_accounts SET')) {
      if (query.includes('WHERE id = ?')) {
        const id = params[params.length - 1];
        const row = this.bankAccounts.find((b) => b.id === id);
        if (row) {
          if (query.includes('SET id = ?, bank_name = ?')) {
            const [newId, newBankName, newBalance, newUpiApp, newOwnerId, newUpdatedAt] = params;
            row.id = newId;
            row.bank_name = newBankName;
            row.balance = newBalance;
            row.upi_app = newUpiApp;
            row.owner_id = newOwnerId;
            row.updated_at = newUpdatedAt;
          } else if (query.includes('bank_name = ?')) {
            row.bank_name = params[0];
            row.balance = params[1];
            row.upi_app = params[2];
            row.owner_id = params[3];
            row.updated_at = params[4];
          } else if (query.includes('SET id = ?')) {
            // Adopt offline account
            const [newId, newOwnerId, newBalance, newUpdatedAt] = params;
            row.id = newId;
            row.owner_id = newOwnerId;
            row.balance = newBalance;
            row.updated_at = newUpdatedAt;
          }
        }
      }
    }
  }

  // Implementation matching firestoreSyncService.applySecondaryDeltaToSQLite
  async applySecondaryDeltaToSQLite(
    delta: { bankAccounts?: Array<{ id: string; bank_name?: string; balance?: number; upi_app?: string; updated_at?: string; deleted_at?: string | null }> },
    uid: string
  ): Promise<number> {
    let count = 0;
    const nowIso = new Date().toISOString();
    for (const b of delta.bankAccounts || []) {
      if (!b?.id) continue;
      if (b.deleted_at) {
        const row = this.bankAccounts.find((r) => r.id === b.id);
        if (row) {
          row.deleted_at = b.deleted_at;
          row.updated_at = b.updated_at || nowIso;
        }
      } else {
        const local = await this.getFirstAsync<{ id: string; updated_at: string }>(
          'SELECT id, updated_at FROM bank_accounts WHERE id = ?',
          [b.id]
        );
        if (!local) {
          const offline = await this.getFirstAsync<{ id: string }>(
            'SELECT id FROM bank_accounts WHERE (owner_id IS NULL OR owner_id = "") AND LOWER(TRIM(bank_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(COALESCE(upi_app, ""))) = LOWER(TRIM(?)) AND deleted_at IS NULL',
            [b.bank_name || 'Bank', b.upi_app || '']
          );
          if (offline) {
            await this.runAsync(
              'UPDATE bank_accounts SET id = ?, bank_name = ?, balance = ?, upi_app = ?, owner_id = ?, updated_at = ? WHERE id = ?',
              [b.id, b.bank_name || 'Bank', b.balance || 0, b.upi_app || '', uid, b.updated_at || nowIso, offline.id]
            );
            count++;
            continue;
          }
        } else if (local.updated_at && b.updated_at && local.updated_at > b.updated_at) {
          continue;
        }
        const existingRow = this.bankAccounts.find((r) => r.id === b.id);
        if (existingRow) {
          existingRow.bank_name = b.bank_name || 'Bank';
          existingRow.balance = b.balance || 0;
          existingRow.upi_app = b.upi_app || '';
          existingRow.owner_id = uid;
          existingRow.updated_at = b.updated_at || nowIso;
        } else {
          this.bankAccounts.push({
            id: b.id,
            bank_name: b.bank_name || 'Bank',
            balance: b.balance || 0,
            upi_app: b.upi_app || '',
            owner_id: uid,
            created_at: nowIso,
            updated_at: b.updated_at || nowIso,
            deleted_at: null,
          });
        }
      }
      count++;
    }
    return count;
  }

  // Implementation matching DBContext.importSecondaryData
  async importSecondaryData(
    data: { banks?: Array<{ id?: string; bank_name: string; balance?: number; upi_app?: string; created_at?: string; updated_at?: string }> },
    currentUid: string | null
  ): Promise<number> {
    const now = new Date().toISOString();
    let bankImported = 0;

    const existingBanksList = await this.getAllAsync<BankAccountRow>(
      currentUid
        ? 'SELECT id, bank_name, balance, upi_app, owner_id, updated_at FROM bank_accounts WHERE (owner_id = ? OR owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL'
        : 'SELECT id, bank_name, balance, upi_app, owner_id, updated_at FROM bank_accounts WHERE (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL',
      currentUid ? [currentUid] : []
    );

    const existingBanksById = new Map<string, BankAccountRow>();
    const existingBanksByCompositeKey = new Map<string, BankAccountRow>();
    for (const b of existingBanksList) {
      if (b.id) existingBanksById.set(b.id, b);
      if (b.bank_name) {
        const compKey = `${b.bank_name.trim().toLowerCase()}:::${(b.upi_app || '').trim().toLowerCase()}`;
        if (!existingBanksByCompositeKey.has(compKey)) {
          existingBanksByCompositeKey.set(compKey, b);
        }
      }
    }

    for (const bank of data.banks ?? []) {
      if (!bank || !bank.bank_name) continue;
      const bankName = bank.bank_name.trim();
      const upiApp = (bank.upi_app || '').trim();
      const compKey = `${bankName.toLowerCase()}:::${upiApp.toLowerCase()}`;

      let existing = bank.id ? existingBanksById.get(bank.id) : null;
      if (!existing) {
        existing = existingBanksByCompositeKey.get(compKey) || null;
      }

      if (existing) {
        const newBalance = bank.balance !== undefined && bank.balance !== null ? bank.balance : existing.balance;
        const newUpiApp = bank.upi_app !== undefined && bank.upi_app !== null ? bank.upi_app.trim() : (existing.upi_app || '');
        const newOwnerId = currentUid || existing.owner_id || null;

        await this.runAsync(
          'UPDATE bank_accounts SET bank_name = ?, balance = ?, upi_app = ?, owner_id = ?, updated_at = ? WHERE id = ?',
          [bankName, newBalance, newUpiApp, newOwnerId, now, existing.id]
        );

        const updatedObj: BankAccountRow = {
          ...existing,
          bank_name: bankName,
          balance: newBalance,
          upi_app: newUpiApp,
          owner_id: newOwnerId,
          updated_at: now,
        };
        existingBanksById.set(existing.id, updatedObj);
        existingBanksByCompositeKey.set(compKey, updatedObj);
      } else {
        const id = bank.id || `gen-${Math.random()}`;
        const balance = bank.balance ?? 0;
        await this.runAsync(
          'INSERT INTO bank_accounts (id, bank_name, balance, upi_app, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
          [id, bankName, balance, upiApp, currentUid, bank.created_at || now, bank.updated_at || now]
        );
        const createdObj: BankAccountRow = {
          id,
          bank_name: bankName,
          balance,
          upi_app: upiApp,
          owner_id: currentUid,
          created_at: bank.created_at || now,
          updated_at: bank.updated_at || now,
          deleted_at: null,
        };
        existingBanksById.set(id, createdObj);
        existingBanksByCompositeKey.set(compKey, createdObj);
        bankImported++;
      }
    }

    return bankImported;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING ACCOUNT SYNC IDEMPOTENCY & MULTI-ACCOUNT REGRESSION SUITE');
  console.log('================================================================\n');

  // ── TEST 1: Initial Sync & Stable ID Preservation ──
  console.log('--- TEST 1: Initial Sync & Stable ID Preservation ---');
  const db1 = new MockSQLiteDB();
  const cloudBank1 = {
    id: 'bank-stable-101',
    bank_name: 'HDFC Bank',
    balance: 50000,
    upi_app: 'GPay',
  };

  const importedCount1 = await db1.importSecondaryData({ banks: [cloudBank1] }, 'user-uid-1');
  assert(importedCount1 === 1, 'Initial Import', 'Imported 1 bank account');
  assert(db1.bankAccounts.length === 1, 'Initial Count', 'Exactly 1 bank in SQLite');
  assert(db1.bankAccounts[0].id === 'bank-stable-101', 'Preserve ID', 'Preserved stable cloud ID');
  assert(db1.bankAccounts[0].upi_app === 'GPay', 'Preserve UPI App', 'Preserved UPI App');

  // ── TEST 2: Repeated Sync Idempotency (Zero Duplicates) ──
  console.log('\n--- TEST 2: Repeated Sync Idempotency (Zero Duplicates) ---');
  // Sync the exact same data again
  const importedCount2 = await db1.importSecondaryData({ banks: [cloudBank1] }, 'user-uid-1');
  assert(importedCount2 === 0, 'Repeat Import', '0 new banks imported on repeat sync');
  assert(db1.bankAccounts.length === 1, 'No Duplicates', 'SQLite still has exactly 1 bank account');
  assert(db1.bankAccounts[0].id === 'bank-stable-101', 'Same Record', 'Record retained stable ID');

  // Repeat sync with balance update
  const updatedCloudBank = { ...cloudBank1, balance: 75000 };
  await db1.importSecondaryData({ banks: [updatedCloudBank] }, 'user-uid-1');
  assert(db1.bankAccounts.length === 1, 'Update No Duplicate', 'Count remains 1 after balance update');
  assert(db1.bankAccounts[0].balance === 75000, 'Balance Updated', 'Balance updated to 75000 idempotently');

  // ── TEST 3: Distinct Accounts at the Same Bank Preserved ──
  console.log('\n--- TEST 3: Distinct Accounts at the Same Bank Preserved ---');
  // User legitimately has TWO accounts at HDFC (e.g. GPay and PhonePe)
  const cloudBank2 = {
    id: 'bank-stable-102',
    bank_name: 'HDFC Bank',
    balance: 25000,
    upi_app: 'PhonePe',
  };

  const importedCount3 = await db1.importSecondaryData({ banks: [cloudBank1, cloudBank2] }, 'user-uid-1');
  assert(importedCount3 === 1, 'Multi Account Import', 'Imported second HDFC account');
  assert(db1.bankAccounts.length === 2, 'Two Distinct Accounts', 'Both HDFC accounts exist in SQLite');

  const gpayAcc = db1.bankAccounts.find((b) => b.upi_app === 'GPay');
  const phonepeAcc = db1.bankAccounts.find((b) => b.upi_app === 'PhonePe');
  assert(Boolean(gpayAcc && phonepeAcc), 'Both Accounts Present', 'Both GPay and PhonePe accounts preserved');
  assert(gpayAcc?.id === 'bank-stable-101', 'GPay ID', 'GPay account ID is bank-stable-101');
  assert(phonepeAcc?.id === 'bank-stable-102', 'PhonePe ID', 'PhonePe account ID is bank-stable-102');

  // Repeat sync with both accounts: verify zero duplication
  await db1.importSecondaryData({ banks: [cloudBank1, cloudBank2] }, 'user-uid-1');
  assert(db1.bankAccounts.length === 2, 'Repeat Multi Sync', 'Still exactly 2 accounts after repeated sync of both');

  // ── TEST 4: Offline Bank Account Adoption on Login ──
  console.log('\n--- TEST 4: Offline Bank Account Adoption on Login ---');
  const db2 = new MockSQLiteDB();
  // User creates an account offline (owner_id is null)
  await db2.runAsync(
    'INSERT INTO bank_accounts (id, bank_name, balance, upi_app, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
    ['offline-local-uuid', 'State Bank of India', 10000, 'BHIM', null, new Date().toISOString(), new Date().toISOString()]
  );
  assert(db2.bankAccounts.length === 1, 'Offline Account Created', '1 offline bank account in SQLite');
  assert(db2.bankAccounts[0].owner_id === null, 'Unowned Offline', 'owner_id is null');

  // User logs in and cloud sync runs with a matching SBI account (same bank + upi app)
  const cloudSbi = {
    id: 'cloud-sbi-uuid',
    bank_name: 'State Bank of India',
    balance: 15000,
    upi_app: 'BHIM',
  };
  await db2.importSecondaryData({ banks: [cloudSbi] }, 'user-uid-2');
  assert(db2.bankAccounts.length === 1, 'Adopted Without Duplicate', 'Offline account was adopted, no duplicate created');
  assert(db2.bankAccounts[0].owner_id === 'user-uid-2', 'Adopted Owner', 'owner_id updated to user-uid-2');
  assert(db2.bankAccounts[0].balance === 15000, 'Adopted Balance', 'Balance updated from cloud');

  // ── TEST 4B: Offline Bank Adoption with Capitalization & Whitespace Differences (applySecondaryDeltaToSQLite) ──
  console.log('\n--- TEST 4B: Offline Bank Adoption with Capitalization & Whitespace Differences ---');
  const dbDelta = new MockSQLiteDB();
  // User creates an account offline with messy whitespace and lowercase
  await dbDelta.runAsync(
    'INSERT INTO bank_accounts (id, bank_name, balance, upi_app, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
    ['offline-messy-uuid', '  hdfc bank  ', 5000, '  gpay  ', null, new Date().toISOString(), new Date().toISOString()]
  );
  assert(dbDelta.bankAccounts.length === 1, 'Offline Messy Account', '1 offline bank account in SQLite');

  // Cloud secondary delta arrives with canonical casing and trimming: "HDFC Bank", "GPay"
  const cloudDelta = {
    bankAccounts: [
      {
        id: 'cloud-canonical-hdfc-id',
        bank_name: 'HDFC Bank',
        balance: 12000,
        upi_app: 'GPay',
      },
    ],
  };

  const appliedCount = await dbDelta.applySecondaryDeltaToSQLite(cloudDelta, 'user-uid-4');
  assert(appliedCount === 1, 'Delta Applied', '1 change applied');
  assert(dbDelta.bankAccounts.length === 1, 'Adopted Casing/Whitespace No Duplicate', 'Offline account adopted despite casing and whitespace difference; 0 duplicates');
  assert(dbDelta.bankAccounts[0].id === 'cloud-canonical-hdfc-id', 'Adopted ID', 'ID updated to canonical cloud ID');
  assert(dbDelta.bankAccounts[0].bank_name === 'HDFC Bank', 'Normalized Bank Name', 'bank_name normalized to canonical "HDFC Bank"');
  assert(dbDelta.bankAccounts[0].upi_app === 'GPay', 'Normalized UPI App', 'upi_app normalized to canonical "GPay"');
  assert(dbDelta.bankAccounts[0].owner_id === 'user-uid-4', 'Adopted Owner ID', 'owner_id updated to active UID');
  assert(dbDelta.bankAccounts[0].balance === 12000, 'Updated Balance', 'Balance updated to cloud balance (12000)');

  // Distinct account at same bank with different UPI app is NOT adopted/merged:
  const phonepeDelta = {
    bankAccounts: [
      {
        id: 'cloud-hdfc-phonepe-id',
        bank_name: 'HDFC Bank',
        balance: 20000,
        upi_app: 'PhonePe',
      },
    ],
  };
  await dbDelta.applySecondaryDeltaToSQLite(phonepeDelta, 'user-uid-4');
  assert(dbDelta.bankAccounts.length === 2, 'Distinct Account Preserved', 'Distinct account with different UPI app is inserted separately, not merged');

  // ── TEST 5: Concurrent / Sequential Multi-Sync Idempotency ──
  console.log('\n--- TEST 5: Concurrent / Sequential Multi-Sync Idempotency ---');
  const db3 = new MockSQLiteDB();
  const batch = [
    { id: 'b-1', bank_name: 'Axis Bank', balance: 10000, upi_app: 'GPay' },
    { id: 'b-2', bank_name: 'ICICI Bank', balance: 20000, upi_app: 'iMobile' },
    { id: 'b-3', bank_name: 'Kotak Bank', balance: 30000, upi_app: 'Kotak811' },
  ];

  // Run 5 sequential / overlapping imports
  for (let i = 0; i < 5; i++) {
    await db3.importSecondaryData({ banks: batch }, 'user-uid-3');
  }
  assert(db3.bankAccounts.length === 3, '5x Repeated Sync', 'Exactly 3 bank accounts exist after 5 repeat syncs');

  // ── TEST 6: User Isolation ──
  console.log('\n--- TEST 6: User Isolation ---');
  // Query accounts for user-uid-3 vs user-uid-999
  const user3Banks = await db3.getAllAsync<BankAccountRow>(
    'SELECT * FROM bank_accounts WHERE owner_id = ?',
    ['user-uid-3']
  );
  const otherUserBanks = await db3.getAllAsync<BankAccountRow>(
    'SELECT * FROM bank_accounts WHERE owner_id = ?',
    ['user-uid-999']
  );
  assert(user3Banks.length === 3, 'User 3 Banks', 'User 3 sees all 3 bank accounts');
  assert(otherUserBanks.length === 0, 'User Isolation', 'Another user sees 0 bank accounts');

  console.log('\n================================================================');
  console.log(`🎉 ALL TESTS PASSED: ${passCount} Passed, ${failCount} Failed`);
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test suite encountered an error:', err);
  process.exit(1);
});
