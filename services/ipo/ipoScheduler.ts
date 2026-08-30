import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { IPOUpdater } from './ipoUpdater';

export class IPOScheduler {
  private updateIntervalId: ReturnType<typeof setInterval> | null = null;
  private cacheAgeIntervalId: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private netInfoSubscription: (() => void) | null = null;
  private currentAppState = AppState.currentState;

  constructor(private updater: IPOUpdater) {}

  start() {
    const syncUrl = process.env.EXPO_PUBLIC_IPO_SYNC_URL;
    const hasValidEndpoint = Boolean(syncUrl && syncUrl.trim().length > 0 && !syncUrl.includes('api.ipovault.app'));

    // Always run initial check once on app launch
    this.updater.runUpdate();

    // Start 10-minute web scraper scheduler for investorgain.com & chittorgarh.com
    import('./ipoScraper').then(({ ipoScraper }) => {
      ipoScraper.startScraperSchedule(async (scrapedData) => {
        if (scrapedData.length > 0) {
          console.log(`[IPOScheduler] Scraped ${scrapedData.length} live records from market web sources.`);
        }
      }, this.updater['repository']);
    });

    // Disable continuous background polling unless a valid production endpoint is configured
    if (!hasValidEndpoint) {
      console.log('[IPOScheduler] Continuous background IPO sync disabled (No production endpoint configured).');
      return;
    }

    console.log('[IPOScheduler] Starting continuous production IPO sync scheduler...');

    // 1. Trigger every 6 hours while app is active
    this.updateIntervalId = setInterval(() => {
      this.updater.runUpdate();
    }, 21600000);

    // 2. Minor interval for cache age telemetry
    this.cacheAgeIntervalId = setInterval(() => {
      this.updater.updateCacheAge();
    }, 60000);

    // 3. Trigger on App Resume
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (this.currentAppState.match(/inactive|background/) && nextAppState === 'active') {
        this.updater.runUpdate();
      }
      this.currentAppState = nextAppState;
    });

    // 4. Trigger on Network Reconnection
    this.netInfoSubscription = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        this.updater.runUpdate();
      }
    });
  }

  stop() {
    if (this.updateIntervalId) clearInterval(this.updateIntervalId);
    if (this.cacheAgeIntervalId) clearInterval(this.cacheAgeIntervalId);
    if (this.appStateSubscription) this.appStateSubscription.remove();
    if (this.netInfoSubscription) this.netInfoSubscription();
  }
}
