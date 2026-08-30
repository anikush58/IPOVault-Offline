import { IPODataProvider, IPOFilterOptions, IPODataProviderResult } from '../types/provider';
import { SmartIPORecord } from '../types/smartIpo';
import { evaluateLifecycle } from '@/services/ipo/statusNormalizer';

export class MockSmartIPOProvider implements IPODataProvider {
  readonly id = 'mock_smart_ipo';
  readonly name = 'Mock Smart IPO Dev Provider';
  readonly isRemote = false;

  private mockSeedData: SmartIPORecord[] = [
    {
      id: 'hdb-financial-2025',
      company_name: 'HDB Financial Services Ltd',
      ipo_name: 'HDB Financial IPO',
      symbol: 'HDBFIN',
      exchange: 'NSE/BSE',
      issue_type: 'Mainboard',
      price_band_min: 700,
      price_band_max: 750,
      lot_size: 20,
      issue_size: 12500, // ₹ Cr
      open_date: '2025-11-10',
      close_date: '2025-11-12',
      allotment_date: '2025-11-13',
      refund_date: '2025-11-14',
      demat_credit_date: '2025-11-14',
      listing_date: '2025-11-17',
      registrar: 'KFin Technologies',
      lead_manager: 'Kotak Mahindra Capital',
      registrar_website: 'https://ris.kfintech.com/ipostatus/',
      allotment_link: 'https://ris.kfintech.com/ipostatus/',
      status: 'Open',
      lifecycle_status: 'OPEN',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Mock Seed',
      lifecycle_last_verified_at: new Date().toISOString(),
      gmp_amount: 145,
      gmp_percent: 19.33,
      profit_per_lot: 2900,
      gmp_updated_at: new Date().toISOString(),
      retail_sub: 14.8,
      qib_sub: 52.4,
      nii_sub: 28.6,
      employee_sub: 2.1,
      shareholder_sub: 0,
      anchor_sub: 1.0,
      total_sub: 31.2,
      subscription_timestamp: new Date().toISOString(),
      listing_price: null,
      listing_gain_percent: null,
      current_price: null,
      current_price_updated_at: null,
      logo_url: 'https://placeholder.co/100x100.png?text=HDB',
      sector: 'Financial Services',
      description: 'HDB Financial Services is a leading NBFC catering to retail & commercial clients across India.',
      website: 'https://www.hdbfs.com',
      prospectus_url: 'https://www.hdbfs.com/drhp',
      is_favorite: 1,
      source_type: 'MOCK',
      sync_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    },
    {
      id: 'advit-jewels-2025',
      company_name: 'Advit Jewels Ltd',
      ipo_name: 'Advit Jewels IPO',
      symbol: 'ADVIT',
      exchange: 'BSE SME',
      issue_type: 'SME',
      price_band_min: 110,
      price_band_max: 118,
      lot_size: 1200,
      issue_size: 42,
      open_date: '2025-11-08',
      close_date: '2025-11-11',
      allotment_date: '2025-11-13',
      refund_date: '2025-11-14',
      demat_credit_date: '2025-11-14',
      listing_date: '2025-11-18',
      registrar: 'Bigshare Services',
      lead_manager: 'Pantomath Capital',
      registrar_website: 'https://ipo.bigshareonline.com/',
      allotment_link: 'https://ipo.bigshareonline.com/',
      status: 'Awaiting Allotment',
      lifecycle_status: 'ALLOTTED_PENDING',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Mock Seed',
      lifecycle_last_verified_at: new Date().toISOString(),
      gmp_amount: 32,
      gmp_percent: 27.12,
      profit_per_lot: 38400,
      gmp_updated_at: new Date().toISOString(),
      retail_sub: 42.1,
      qib_sub: 12.5,
      nii_sub: 68.3,
      employee_sub: 0,
      shareholder_sub: 0,
      anchor_sub: 1.0,
      total_sub: 45.8,
      subscription_timestamp: new Date().toISOString(),
      listing_price: null,
      listing_gain_percent: null,
      current_price: null,
      current_price_updated_at: null,
      logo_url: 'https://placeholder.co/100x100.png?text=ADVIT',
      sector: 'Gems & Jewellery',
      description: 'Advit Jewels designs, manufactures, and retails handcrafted diamond & gold jewellery.',
      website: 'https://www.advitjewels.com',
      prospectus_url: 'https://www.advitjewels.com/prospectus',
      is_favorite: 0,
      source_type: 'MOCK',
      sync_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    },
    {
      id: 'ola-electric-2025',
      company_name: 'Ola Electric Mobility Ltd',
      ipo_name: 'Ola Electric IPO',
      symbol: 'OLAELEC',
      exchange: 'NSE/BSE',
      issue_type: 'Mainboard',
      price_band_min: 72,
      price_band_max: 76,
      lot_size: 195,
      issue_size: 6100,
      open_date: '2025-10-14',
      close_date: '2025-10-16',
      allotment_date: '2025-10-18',
      refund_date: '2025-10-19',
      demat_credit_date: '2025-10-19',
      listing_date: '2025-10-21',
      registrar: 'Link Intime India',
      lead_manager: 'Axis Capital',
      registrar_website: 'https://linkintime.co.in/initial_offer/public-issues.html',
      allotment_link: 'https://linkintime.co.in/initial_offer/public-issues.html',
      status: 'Listed',
      lifecycle_status: 'LISTED',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Mock Seed',
      lifecycle_last_verified_at: new Date().toISOString(),
      gmp_amount: 15,
      gmp_percent: 19.74,
      profit_per_lot: 2925,
      gmp_updated_at: new Date().toISOString(),
      retail_sub: 4.1,
      qib_sub: 5.3,
      nii_sub: 2.4,
      employee_sub: 12.0,
      shareholder_sub: 0,
      anchor_sub: 1.0,
      total_sub: 4.2,
      subscription_timestamp: new Date().toISOString(),
      listing_price: 91.2,
      listing_gain_percent: 20.0,
      current_price: 88.5,
      current_price_updated_at: new Date().toISOString(),
      logo_url: 'https://placeholder.co/100x100.png?text=OLA',
      sector: 'Automobile & EV',
      description: 'Ola Electric is a leading manufacturer of electric two-wheelers and EV components in India.',
      website: 'https://www.olaelectric.com',
      prospectus_url: 'https://www.olaelectric.com/rhp',
      is_favorite: 1,
      source_type: 'MOCK',
      sync_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    },
  ];

  async getIPOs(options?: IPOFilterOptions): Promise<IPODataProviderResult> {
    if (!__DEV__) {
      return {
        success: false,
        data: [],
        totalCount: 0,
        providerName: this.name,
        fetchedAt: new Date().toISOString(),
        error: 'SECURITY: MockSmartIPOProvider is restricted to development mode.',
      };
    }

    let results = this.mockSeedData.map((rec) => {
      const evalRes = evaluateLifecycle(rec);
      return {
        ...rec,
        lifecycle_status: evalRes.lifecycle_status,
      };
    });

    if (options?.exchange && options.exchange !== 'ALL') {
      if (options.exchange === 'SME') {
        results = results.filter((r) => r.issue_type === 'SME' || r.exchange.includes('SME'));
      } else {
        results = results.filter((r) => r.issue_type === 'Mainboard');
      }
    }

    if (options?.lifecycleStatus && options.lifecycleStatus.length > 0) {
      const allowed = new Set(options.lifecycleStatus);
      results = results.filter((r) => allowed.has(r.lifecycle_status));
    }

    return {
      success: true,
      data: results,
      totalCount: results.length,
      providerName: this.name,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getIPOById(id: string): Promise<SmartIPORecord | null> {
    const found = this.mockSeedData.find((r) => r.id === id);
    if (!found) return null;
    const evalRes = evaluateLifecycle(found);
    return {
      ...found,
      lifecycle_status: evalRes.lifecycle_status,
    };
  }

  async refreshIPOs(): Promise<IPODataProviderResult> {
    return this.getIPOs();
  }
}
