import {
  CONTROLLED_EXCHANGES,
  CONTROLLED_ISSUE_TYPES,
  CONTROLLED_REGISTRARS,
  resolveExchangeCode,
  resolveIssueTypeCode,
  resolveRegistrarCode,
} from '../../constants/ipoControls';

export interface ManualIpoFormInput {
  companyName: string;
  ipoName: string;
  symbol: string;
  exchange: string;
  registrar: string;
  issueType: string;
  buyPrice: number;
  quantity: number;
  openDate: string;
  closeDate: string;
  listingDate?: string;
  existingBackendIpoId?: string | null;
}

export function validateAndNormalizeManualIpoForm(
  input: ManualIpoFormInput,
  originalRecord?: { companyName: string; symbol: string; backendIpoId?: string | null },
): {
  isValid: boolean;
  errors: string[];
  normalizedData?: {
    companyName: string;
    ipoName: string;
    symbol: string;
    exchange: string;
    registrar: string;
    issueType: string;
    buyPrice: number;
    quantity: number;
    openDate: string;
    closeDate: string;
    listingDate?: string;
    backendIpoId: string | null;
  };
} {
  const errors: string[] = [];

  const trimmedCompany = input.companyName.trim();
  const trimmedIpoName = input.ipoName.trim() || (trimmedCompany ? `${trimmedCompany} IPO` : '');
  const trimmedSymbol = input.symbol.trim().toUpperCase();
  const exchangeCode = resolveExchangeCode(input.exchange);
  const registrarCode = resolveRegistrarCode(input.registrar);
  const issueTypeCode = resolveIssueTypeCode(input.issueType);

  if (!trimmedCompany) errors.push('Company Name is required');
  if (!trimmedIpoName) errors.push('IPO Name is required');
  if (!trimmedSymbol) errors.push('Symbol is required');
  if (!input.exchange) errors.push('Exchange is required');
  if (!input.registrar) errors.push('Registrar is required');
  if (!input.issueType) errors.push('Issue type is required');
  if (isNaN(input.buyPrice) || input.buyPrice <= 0) errors.push('Price must be greater than zero');
  if (isNaN(input.quantity) || input.quantity <= 0) errors.push('Lot size must be greater than zero');
  if (!input.openDate) errors.push('Open date is required');
  if (!input.closeDate) errors.push('Close date is required');
  if (input.openDate && input.closeDate && input.closeDate < input.openDate) {
    errors.push('Close date cannot be earlier than open date');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  // Editing Safety Rule: Clear backend_ipo_id if core identity (company name or symbol) changed
  let backendIpoId: string | null = input.existingBackendIpoId ?? null;
  if (
    originalRecord &&
    (originalRecord.companyName.trim().toLowerCase() !== trimmedCompany.toLowerCase() ||
      originalRecord.symbol.trim().toUpperCase() !== trimmedSymbol)
  ) {
    backendIpoId = null; // Unlink stale backend ID on core identity edit
  }

  return {
    isValid: true,
    errors: [],
    normalizedData: {
      companyName: trimmedCompany,
      ipoName: trimmedIpoName,
      symbol: trimmedSymbol,
      exchange: exchangeCode,
      registrar: registrarCode,
      issueType: issueTypeCode,
      buyPrice: input.buyPrice,
      quantity: input.quantity,
      openDate: input.openDate,
      closeDate: input.closeDate,
      listingDate: input.listingDate,
      backendIpoId,
    },
  };
}

describe('Manual Add/Edit IPO Form Validation & Data Model Requirements', () => {
  const validBaseInput: ManualIpoFormInput = {
    companyName: 'Juniper Hotels Limited',
    ipoName: 'Juniper Hotels IPO',
    symbol: 'JUNIPER',
    exchange: 'NSE',
    registrar: 'KFINTECH',
    issueType: 'MAINBOARD',
    buyPrice: 360,
    quantity: 40,
    openDate: '2024-02-21',
    closeDate: '2024-02-23',
    listingDate: '2024-02-28',
  };

  it('A. Valid complete IPO can be created offline', () => {
    const res = validateAndNormalizeManualIpoForm(validBaseInput);
    expect(res.isValid).toBe(true);
    expect(res.normalizedData?.companyName).toBe('Juniper Hotels Limited');
    expect(res.normalizedData?.symbol).toBe('JUNIPER');
    expect(res.normalizedData?.registrar).toBe('KFINTECH');
    expect(res.normalizedData?.backendIpoId).toBeNull();
  });

  it('B. Missing company name is rejected', () => {
    const res = validateAndNormalizeManualIpoForm({ ...validBaseInput, companyName: '   ' });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Company Name is required');
  });

  it('D. Missing symbol is rejected', () => {
    const res = validateAndNormalizeManualIpoForm({ ...validBaseInput, symbol: '' });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Symbol is required');
  });

  it('E. Missing exchange is rejected', () => {
    const res = validateAndNormalizeManualIpoForm({ ...validBaseInput, exchange: '' });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Exchange is required');
  });

  it('F. Missing registrar is rejected', () => {
    const res = validateAndNormalizeManualIpoForm({ ...validBaseInput, registrar: '' });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Registrar is required');
  });

  it('G. Missing issue type is rejected', () => {
    const res = validateAndNormalizeManualIpoForm({ ...validBaseInput, issueType: '' });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Issue type is required');
  });

  it('H. Missing lot size is rejected', () => {
    const res = validateAndNormalizeManualIpoForm({ ...validBaseInput, quantity: 0 });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Lot size must be greater than zero');
  });

  it('I. Missing open date is rejected', () => {
    const res = validateAndNormalizeManualIpoForm({ ...validBaseInput, openDate: '' });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Open date is required');
  });

  it('J. Missing close date is rejected', () => {
    const res = validateAndNormalizeManualIpoForm({ ...validBaseInput, closeDate: '' });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Close date is required');
  });

  it('K. Invalid date order (close date < open date) is rejected', () => {
    const res = validateAndNormalizeManualIpoForm({
      ...validBaseInput,
      openDate: '2024-02-25',
      closeDate: '2024-02-20',
    });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Close date cannot be earlier than open date');
  });

  it('L, M, N. Registrar, Exchange, Issue Type are stored as controlled codes', () => {
    const res = validateAndNormalizeManualIpoForm({
      ...validBaseInput,
      registrar: 'KFin Technologies Limited',
      exchange: 'NSE',
      issueType: 'Mainboard',
    });
    expect(res.isValid).toBe(true);
    expect(res.normalizedData?.registrar).toBe('KFINTECH');
    expect(res.normalizedData?.exchange).toBe('NSE');
    expect(res.normalizedData?.issueType).toBe('MAINBOARD');
  });

  it('O. backend_ipo_id remains NULL for unsynchronized local IPO', () => {
    const res = validateAndNormalizeManualIpoForm(validBaseInput);
    expect(res.normalizedData?.backendIpoId).toBeNull();
  });

  it('P. Existing backend_ipo_id is preserved when editing non-identity fields', () => {
    const res = validateAndNormalizeManualIpoForm(
      { ...validBaseInput, buyPrice: 400 },
      {
        companyName: 'Juniper Hotels Limited',
        symbol: 'JUNIPER',
        backendIpoId: 'backend-juniper-uuid-999',
      },
    );
    expect(res.isValid).toBe(true);
    expect(res.normalizedData?.backendIpoId).toBe('backend-juniper-uuid-999');
  });

  it('Q. Identity-changing edits reset backend_ipo_id to NULL', () => {
    const res = validateAndNormalizeManualIpoForm(
      { ...validBaseInput, companyName: 'Different Company Limited', symbol: 'DIFF' },
      {
        companyName: 'Juniper Hotels Limited',
        symbol: 'JUNIPER',
        backendIpoId: 'backend-juniper-uuid-999',
      },
    );
    expect(res.isValid).toBe(true);
    expect(res.normalizedData?.backendIpoId).toBeNull();
  });
});
