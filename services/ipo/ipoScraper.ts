import { IPOMasterRecord } from './types';
import { IPORepository } from './ipoRepository';

/**
 * Data Scraper Service for Live IPO Details, Subscription & GMP
 *
 * Scrapes live market data from investorgain.com & chittorgarh.com
 * every 10 minutes to populate live IPO details, subscription ratios, and GMP.
 */

export interface ScrapedIPODetails {
  id: string;
  company_name: string;
  ipo_name: string;
  price_band_min?: number;
  price_band_max?: number;
  lot_size?: number;
  issue_size?: number;
  gmp_amount?: number;
  gmp_percent?: number;
  total_sub?: number;
  retail_sub?: number;
  qib_sub?: number;
  nii_sub?: number;
  employee_sub?: number;
  open_date?: string;
  close_date?: string;
  allotment_date?: string;
  listing_date?: string;
  status?: string;
  exchange?: string;
  issue_type?: string;
  registrar?: string;
  lead_manager?: string;
}

export class IPOScraperService {
  private static instance: IPOScraperService;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastScrapedTime: number = 0;

  private constructor() {}

  public static getInstance(): IPOScraperService {
    if (!IPOScraperService.instance) {
      IPOScraperService.instance = new IPOScraperService();
    }
    return IPOScraperService.instance;
  }

  /**
   * Starts automatic 10-minute web scraper timer.
   */
  startScraperSchedule(onDataFetched?: (data: ScrapedIPODetails[]) => void, repo?: IPORepository) {
    if (this.intervalId) return;

    // Run immediately on launch
    this.scrapeAllSources(repo).then((records) => {
      if (onDataFetched && records.length > 0) onDataFetched(records);
    });

    // Schedule recurring run every 10 minutes (600,000 ms)
    this.intervalId = setInterval(async () => {
      console.log('[IPOScraperService] Running 10-minute scheduled web scrape...');
      const records = await this.scrapeAllSources(repo);
      if (onDataFetched && records.length > 0) onDataFetched(records);
    }, 600000);
  }

  stopScraperSchedule() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Scrapes live IPO market data from InvestorGain & Chittorgarh and saves to SQLite repository.
   */
  async scrapeAllSources(repo?: IPORepository): Promise<ScrapedIPODetails[]> {
    try {
      this.lastScrapedTime = Date.now();
      const [chittorgarhData, investorGainData] = await Promise.allSettled([
        this.scrapeChittorgarh(),
        this.scrapeInvestorGain(),
      ]);

      const results: ScrapedIPODetails[] = [];

      if (chittorgarhData.status === 'fulfilled') {
        results.push(...chittorgarhData.value);
      }
      if (investorGainData.status === 'fulfilled') {
        results.push(...investorGainData.value);
      }

      const deduplicated = this.deduplicateRecords(results);

      if (repo && deduplicated.length > 0) {
        const recordsToUpsert: Partial<IPOMasterRecord>[] = deduplicated.map((item) => ({
          id: item.id,
          company_name: item.company_name,
          ipo_name: item.ipo_name,
          price_band_min: item.price_band_min,
          price_band_max: item.price_band_max,
          lot_size: item.lot_size,
          issue_size: item.issue_size,
          gmp_amount: item.gmp_amount ?? null,
          gmp_percent: item.gmp_percent ?? null,
          total_sub: item.total_sub,
          retail_sub: item.retail_sub,
          qib_sub: item.qib_sub,
          nii_sub: item.nii_sub,
          open_date: item.open_date,
          close_date: item.close_date,
          allotment_date: item.allotment_date,
          listing_date: item.listing_date,
          status: item.status || 'Active',
          exchange: item.exchange || 'NSE, BSE',
          issue_type: item.issue_type || 'Mainboard',
          registrar: item.registrar,
          lead_manager: item.lead_manager,
          source_type: 'LOCAL',
        }));
        await repo.upsertBatch(recordsToUpsert, false);
      }

      return deduplicated;
    } catch (err) {
      if (__DEV__) console.warn('[IPOScraperService] Error running live web scraper', err);
      return [];
    }
  }

  /**
   * Scrapes live IPO dashboard from Chittorgarh (https://www.chittorgarh.com/ipo/ipo_dashboard.asp)
   */
  private async scrapeChittorgarh(): Promise<ScrapedIPODetails[]> {
    try {
      const res = await fetch('https://www.chittorgarh.com/ipo/ipo_dashboard.asp', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!res.ok) return [];
      const html = await res.text();
      return this.parseChittorgarhHTML(html);
    } catch (err) {
      if (__DEV__) console.warn('[IPOScraperService] Chittorgarh fetch error', err);
      return [];
    }
  }

  /**
   * Scrapes live GMP & Subscription data from InvestorGain (investorgain.com)
   */
  private async scrapeInvestorGain(): Promise<ScrapedIPODetails[]> {
    try {
      const res = await fetch('https://www.investorgain.com/report/live-ipo-gmp/331/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!res.ok) return [];
      const html = await res.text();
      return this.parseInvestorGainHTML(html);
    } catch (err) {
      if (__DEV__) console.warn('[IPOScraperService] InvestorGain fetch error', err);
      return [];
    }
  }

  /**
   * Parses HTML table content from Chittorgarh Dashboard into structured objects.
   */
  private parseChittorgarhHTML(html: string): ScrapedIPODetails[] {
    const records: ScrapedIPODetails[] = [];
    try {
      // Regex row extractors for HTML table elements
      const trRegex = /<tr[^>]*>([\s+S]*?)<\/tr>/gi;
      let match: RegExpExecArray | null;

      while ((match = trRegex.exec(html)) !== null) {
        const rowHtml = match[1];
        if (rowHtml.includes('href="/ipo/') || rowHtml.includes('td')) {
          const nameMatch = /<a[^>]*>([^<]+)<\/a>/i.exec(rowHtml);
          if (nameMatch) {
            const rawName = nameMatch[1].trim();
            if (rawName && !rawName.toLowerCase().includes('company name')) {
              const id = rawName.toLowerCase().replace(/[^a-z0-9]/g, '-');
              records.push({
                id,
                company_name: rawName,
                ipo_name: rawName,
                status: 'Open',
                exchange: 'NSE, BSE',
                issue_type: 'Mainboard',
              });
            }
          }
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[IPOScraperService] HTML parse error', e);
    }
    return records;
  }

  /**
   * Parses HTML table content from InvestorGain live GMP report.
   */
  private parseInvestorGainHTML(html: string): ScrapedIPODetails[] {
    const records: ScrapedIPODetails[] = [];
    try {
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let match: RegExpExecArray | null;

      while ((match = trRegex.exec(html)) !== null) {
        const rowHtml = match[1];
        if (rowHtml.includes('₹') || rowHtml.includes('%')) {
          const tds = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
          if (tds && tds.length >= 4) {
            const cleanText = (str: string) => str.replace(/<[^>]+>/g, '').trim();
            const name = cleanText(tds[0]);
            const gmpStr = cleanText(tds[1] || tds[2]);
            const gmpVal = parseFloat(gmpStr.replace(/[^0-9.]/g, ''));

            if (name && name.length > 2) {
              const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
              records.push({
                id,
                company_name: name,
                ipo_name: name,
                gmp_amount: isNaN(gmpVal) ? undefined : gmpVal,
                status: 'Open',
              });
            }
          }
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[IPOScraperService] InvestorGain parse error', e);
    }
    return records;
  }

  private deduplicateRecords(items: ScrapedIPODetails[]): ScrapedIPODetails[] {
    const map = new Map<string, ScrapedIPODetails>();
    items.forEach((item) => {
      if (map.has(item.id)) {
        const existing = map.get(item.id)!;
        map.set(item.id, { ...existing, ...item });
      } else {
        map.set(item.id, item);
      }
    });
    return Array.from(map.values());
  }

  getLastScrapedTime(): number {
    return this.lastScrapedTime;
  }
}

export const ipoScraper = IPOScraperService.getInstance();
