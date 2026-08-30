/**
 * Smart IPO Data Provider Interface & Filtering Options
 * Modular adapter interface for swapping local SQLite, dev mock, and remote API providers.
 */

import { SmartIPORecord, SmartIPOLifecycleStatus } from './smartIpo';

export interface IPOFilterOptions {
  lifecycleStatus?: SmartIPOLifecycleStatus[];
  exchange?: 'ALL' | 'MAINBOARD' | 'SME';
  searchQuery?: string;
  isFavoriteOnly?: boolean;
  sortBy?: 'gmp_desc' | 'open_date_asc' | 'listing_date_asc' | 'name_asc';
  limit?: number;
}

export interface IPODataProviderResult {
  success: boolean;
  data: SmartIPORecord[];
  totalCount: number;
  providerName: string;
  fetchedAt: string;
  error?: string;
}

export interface IPODataProvider {
  readonly id: string;
  readonly name: string;
  readonly isRemote: boolean;

  getIPOs(options?: IPOFilterOptions): Promise<IPODataProviderResult>;
  getIPOById(id: string): Promise<SmartIPORecord | null>;
  refreshIPOs(): Promise<IPODataProviderResult>;
}
