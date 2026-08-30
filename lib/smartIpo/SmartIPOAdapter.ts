/**
 * Smart IPO Adapter Layer
 * Bi-directional conversion utilities between SmartIPORecord (from ipo_master)
 * and legacy IPOListing (from ipo_listings/DBContext).
 *
 * Ensures 100% backward compatibility with existing SQLite foreign keys and user applications.
 */

import { SmartIPORecord } from './types/smartIpo';
import { IPOListing } from '@/context/DBContext';

export class SmartIPOAdapter {
  /**
   * Converts a SmartIPORecord (from ipo_master) into a legacy IPOListing format.
   * Used when populating legacy screens or inserting shadow rows into ipo_listings.
   */
  static toIPOListing(record: SmartIPORecord): IPOListing {
    return {
      id: record.id,
      ipo_name: record.ipo_name,
      buy_price: record.price_band_max || record.price_band_min || 0,
      quantity: record.lot_size || 1,
      open_date: record.open_date || '',
      close_date: record.close_date || '',
      listing_date: record.listing_date || '',
      archived: 0,
      is_favorite: record.is_favorite || 0,
      registrar: record.registrar || '',
      exchange: record.exchange || '',
      issue_type: record.issue_type || '',
      allotment_date: record.allotment_date || '',
    };
  }

  /**
   * Converts a legacy IPOListing into a partial SmartIPORecord fallback format.
   * Used when an older application references a legacy ipo_listings entry not yet in ipo_master.
   */
  static fromIPOListing(listing: IPOListing): Partial<SmartIPORecord> {
    return {
      id: listing.id,
      company_name: listing.ipo_name,
      ipo_name: listing.ipo_name,
      price_band_max: listing.buy_price,
      lot_size: listing.quantity,
      open_date: listing.open_date,
      close_date: listing.close_date,
      listing_date: listing.listing_date,
      allotment_date: listing.allotment_date,
      registrar: listing.registrar,
      exchange: listing.exchange,
      issue_type: listing.issue_type,
      source_type: 'LOCAL',
      is_favorite: listing.is_favorite || 0,
    };
  }
}
