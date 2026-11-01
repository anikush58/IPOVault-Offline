import { safeAsyncStorage } from '../../utils/safeAsyncStorage';
import { ApiClient } from '../api/ApiClient';
import { ENDPOINTS } from '../api/Endpoints';
import { API_BASE_URL } from '@/constants/apiConfig';

export interface MobileProPlanBenefit {
  id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  displayOrder: number;
}

export interface MobileProPlan {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  duration: string;
  durationDays?: number | null;
  priceInr: number;
  comparisonPriceInr?: number | null;
  isPopular: boolean;
  badge?: string | null;
  displayOrder: number;
  features: string[];
  benefits: MobileProPlanBenefit[];
}

export interface ProPlanState {
  plans: MobileProPlan[];
  status: 'idle' | 'loading' | 'success' | 'error';
  source: 'network' | 'cache' | 'default';
  error?: string | null;
  updatedAt: number;
}

export const PRO_PLANS_CACHE_KEY = '@ipovault_cached_pro_plans_v1';

export const CANONICAL_DEFAULT_BENEFITS: MobileProPlanBenefit[] = [
  {
    id: 'default-ben-1',
    title: 'Record IPO Applications',
    description: 'Record IPO applications with family member linkages, lot sizes, and cut-off price tracking.',
    icon: 'layers',
    displayOrder: 1,
  },
  {
    id: 'default-ben-2',
    title: 'Bulk Application Management',
    description: 'Streamlined multi-profile workflow to record and organize IPO applications across family accounts.',
    icon: 'send',
    displayOrder: 2,
  },
  {
    id: 'default-ben-3',
    title: 'Manage Applications',
    description: 'Manage applications, view portfolio summaries, and track realized and unrealized investment outcomes.',
    icon: 'pie-chart',
    displayOrder: 3,
  },
  {
    id: 'default-ben-4',
    title: 'Track Application Status',
    description: 'Track application status, monitor allotment results, and view detailed portfolio insights.',
    icon: 'trending-up',
    displayOrder: 4,
  },
  {
    id: 'default-ben-5',
    title: 'Bank Account Management',
    description: 'Organize bank details, account limits, and linked UPI IDs for fast reference when recording applications.',
    icon: 'credit-card',
    displayOrder: 5,
  },
  {
    id: 'default-ben-6',
    title: 'Ad-Free Experience',
    description: 'Browse IPOVault without promotional advertisements.',
    icon: 'slash',
    displayOrder: 6,
  },
];

export const CANONICAL_DEFAULT_PLANS: MobileProPlan[] = [
  {
    id: 'default-plan-monthly',
    code: 'pro_monthly',
    name: 'Monthly Pro',
    description: 'Flexible month-to-month access to complete IPO recording, family management, and portfolio insights.',
    duration: 'Monthly',
    durationDays: 30,
    priceInr: 499,
    comparisonPriceInr: 699,
    isPopular: false,
    badge: null,
    displayOrder: 1,
    features: CANONICAL_DEFAULT_BENEFITS.map((b) => b.title),
    benefits: CANONICAL_DEFAULT_BENEFITS,
  },
  {
    id: 'default-plan-annual',
    code: 'pro_annual',
    name: 'Annual Pro',
    description: 'Best value for active investors. Full IPOVault Pro tools for a full year of upcoming IPOs.',
    duration: 'Annual',
    durationDays: 365,
    priceInr: 3999,
    comparisonPriceInr: 5999,
    isPopular: true,
    badge: 'Save 33%',
    displayOrder: 2,
    features: CANONICAL_DEFAULT_BENEFITS.map((b) => b.title),
    benefits: CANONICAL_DEFAULT_BENEFITS,
  },
];

export function arePlansEqual(a: MobileProPlan[], b: MobileProPlan[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i];
    const pb = b[i];
    if (
      pa.id !== pb.id ||
      pa.code !== pb.code ||
      pa.name !== pb.name ||
      pa.description !== pb.description ||
      pa.duration !== pb.duration ||
      pa.durationDays !== pb.durationDays ||
      pa.priceInr !== pb.priceInr ||
      pa.comparisonPriceInr !== pb.comparisonPriceInr ||
      pa.isPopular !== pb.isPopular ||
      pa.badge !== pb.badge ||
      pa.displayOrder !== pb.displayOrder
    ) {
      return false;
    }
    const ba = pa.benefits || [];
    const bb = pb.benefits || [];
    if (ba.length !== bb.length) return false;
    for (let j = 0; j < ba.length; j++) {
      if (
        ba[j].id !== bb[j].id ||
        ba[j].title !== bb[j].title ||
        ba[j].description !== bb[j].description ||
        ba[j].icon !== bb[j].icon ||
        ba[j].displayOrder !== bb[j].displayOrder
      ) {
        return false;
      }
    }
  }
  return true;
}

type PlanStateListener = (state: ProPlanState) => void;

class ProPlanService {
  private state: ProPlanState = {
    plans: CANONICAL_DEFAULT_PLANS,
    status: 'idle',
    source: 'default',
    error: null,
    updatedAt: 0,
  };

  private listeners: Set<PlanStateListener> = new Set();
  private apiClient: ApiClient;
  private inFlightPromise: Promise<MobileProPlan[]> | null = null;
  private initPromise: Promise<void>;

  constructor() {
    this.apiClient = new ApiClient({
      baseUrl: API_BASE_URL,
      timeoutMs: 10000,
    });
    this.initPromise = this.initFromCache();
  }

  private async initFromCache(): Promise<void> {
    try {
      const raw = await safeAsyncStorage.getItem(PRO_PLANS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validated = parsed.filter(
            (p) => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.priceInr === 'number'
          );
          if (validated.length > 0) {
            validated.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
            validated.forEach((p) => {
              if (Array.isArray(p.benefits)) {
                p.benefits.sort((a: MobileProPlanBenefit, b: MobileProPlanBenefit) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
              }
            });
            this.state = {
              plans: validated,
              status: 'success',
              source: 'cache',
              error: null,
              updatedAt: Date.now(),
            };
            this.notify();
          }
        }
      }
    } catch {
      // Fallback silently to canonical defaults
    }
  }

  public getCurrentState(): ProPlanState {
    return { ...this.state };
  }

  public subscribe(listener: PlanStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getCurrentState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const current = this.getCurrentState();
    this.listeners.forEach((l) => {
      try {
        l(current);
      } catch {
        // Listener safety
      }
    });
  }

  /**
   * Fetches published plans from the backend and updates local cache.
   * If offline or error occurs, preserves current cached plans and notifies.
   */
  public async fetchPublishedPlans(): Promise<MobileProPlan[]> {
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = (async () => {
      await this.initPromise;

      if (this.state.plans.length === 0) {
        this.state = { ...this.state, status: 'loading' };
        this.notify();
      }

      try {
        const res = await this.apiClient.get<MobileProPlan[] | { data: MobileProPlan[] }>(
          ENDPOINTS.PRO_PLANS
        );

        // Handle ApiResponse envelope or raw array
        let incomingPlans: MobileProPlan[] = [];
        if (Array.isArray(res)) {
          incomingPlans = res;
        } else if (res && Array.isArray((res as any).data)) {
          incomingPlans = (res as any).data;
        }

        // Validate structure and ensure unpublished/archived plans are excluded
        const validPublished: MobileProPlan[] = incomingPlans
          .filter((p: any) => {
            if (p?.status && p.status !== 'PUBLISHED') return false;
            return p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.priceInr === 'number';
          })
          .map((p) => {
            const benefits = Array.isArray(p.benefits) ? [...p.benefits] : [];
            benefits.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
            return {
              ...p,
              features: Array.isArray(p.features) ? p.features : benefits.map((b) => b.title),
              benefits,
            };
          });

        validPublished.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

        if (validPublished.length > 0) {
          const hasChanged = !arePlansEqual(this.state.plans, validPublished);

          if (hasChanged || this.state.source !== 'network') {
            this.state = {
              plans: validPublished,
              status: 'success',
              source: 'network',
              error: null,
              updatedAt: Date.now(),
            };
            await safeAsyncStorage.setItem(
              PRO_PLANS_CACHE_KEY,
              JSON.stringify(validPublished)
            );
            this.notify();
          } else {
            this.state = {
              ...this.state,
              status: 'success',
              error: null,
              updatedAt: Date.now(),
            };
          }
        } else if (incomingPlans.length === 0 && this.state.source === 'default') {
          // If fresh API call genuinely returns empty list, preserve defaults unless admin deleted all
          this.state = {
            ...this.state,
            status: 'success',
            error: null,
            updatedAt: Date.now(),
          };
        }

        return this.state.plans;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Preserve existing valid cached plans without replacing them with empty list
        this.state = {
          ...this.state,
          status: this.state.plans.length > 0 ? 'success' : 'error',
          error: msg,
        };
        this.notify();
        return this.state.plans;
      } finally {
        this.inFlightPromise = null;
      }
    })();

    return this.inFlightPromise;
  }

  /**
   * Primary entry point for UI screens:
   * Returns available plans immediately (from memory / cache) and refreshes in background.
   */
  public async getPublishedPlans(forceRefresh: boolean = false): Promise<MobileProPlan[]> {
    await this.initPromise;
    const isStale = Date.now() - this.state.updatedAt > 5 * 60 * 1000;
    if (forceRefresh || isStale || this.state.source === 'default') {
      this.fetchPublishedPlans().catch(() => {});
    }
    return this.state.plans;
  }
}

export const proPlanService = new ProPlanService();
