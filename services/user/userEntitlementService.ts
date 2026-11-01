/**
 * User Entitlement Service
 *
 * Single client-side source of truth for backend-verified Pro vs. Non-Pro user entitlements.
 *
 * ARCHITECTURAL SPECIFICATION & SECURITY CONTRACT:
 * - Server-Verified Authority:
 *   Never trusts client-supplied user IDs or locally spoofed flags as proof of entitlement.
 *   Entitlements are persisted and authenticated server-side via Firebase ID tokens.
 * - Separation from App Experience:
 *   App experience mode (UI tabs) is separate from entitlement. Selecting Pro mode in Settings
 *   must NEVER grant Pro entitlement. Non-Pro users cannot enter Pro mode without Pro entitlement.
 * - Safe Revocation:
 *   Revoking Pro entitlement safely demotes the active experience mode to 'non_pro' without
 *   deleting any user SQLite records (applications, bids, bank accounts, saved PANs) and
 *   without disrupting any in-progress financial operations.
 * - Offline-First Persistence:
 *   Cached securely under `@ipovault_user_entitlement_v1` via safeAsyncStorage for instant
 *   cold-start availability. Refreshed reactively on login, account changes, app foreground,
 *   and manual sync.
 */

import { safeAsyncStorage } from '../../utils/safeAsyncStorage';
import { ApiClient } from '../api/ApiClient';
import { ENDPOINTS } from '../api/Endpoints';
import { API_BASE_URL } from '@/constants/apiConfig';
import { getAuthHeaders } from '../api/authHeaders';
import { appExperienceService } from '../experience/appExperienceService';
import { firebaseAuth } from '../auth/firebaseConfig';

export type UserEntitlementTier = 'NON_PRO' | 'PRO';
export type EntitlementLifecycleStatus = 'loading' | 'ready' | 'refreshing';

export interface UserEntitlementState {
  tier: UserEntitlementTier;
  isPro: boolean;
  status: EntitlementLifecycleStatus;
  userId?: string | null;
  grantedAt?: string | null;
  grantedBy?: string | null;
  revokedAt?: string | null;
  source: 'server' | 'cache' | 'default';
  updatedAt: number;
}

export const USER_ENTITLEMENT_STORAGE_KEY = '@ipovault_user_entitlement_v1';
export const getUserEntitlementStorageKey = (uid: string) => `@ipovault_user_entitlement_${uid}_v1`;
export const getEntitlementStorageKeyForEmail = (email: string) =>
  `@ipovault_entitlement_email_${email.trim().toLowerCase()}_v1`;
export const KNOWN_PRO_IDENTIFIERS_STORAGE_KEY = '@ipovault_known_pro_identifiers_v2';

export const DEFAULT_ENTITLEMENT_STATE: UserEntitlementState = {
  tier: 'NON_PRO',
  isPro: false,
  status: 'ready',
  userId: null,
  grantedAt: null,
  grantedBy: null,
  revokedAt: null,
  source: 'default',
  updatedAt: Date.now(),
};

export type UserEntitlementListener = (state: UserEntitlementState) => void;

export const DEFAULT_ENTITLEMENT_POLLING_INTERVAL_MS = 25000;

export interface EntitlementTransitionEvent {
  previousTier: UserEntitlementTier;
  newTier: UserEntitlementTier;
  timestamp: number;
}

class UserEntitlementService {
  private currentState: UserEntitlementState = { ...DEFAULT_ENTITLEMENT_STATE };
  private initialized = false;
  private listeners: Set<UserEntitlementListener> = new Set();
  private apiClient: ApiClient;
  private inFlightRefreshPromise: Promise<UserEntitlementState> | null = null;
  private currentRequestId = 0;
  private pollingTimer: any = null;
  private pollingIntervalMs = DEFAULT_ENTITLEMENT_POLLING_INTERVAL_MS;
  private isAppActive = true;
  private lastTransition: EntitlementTransitionEvent | null = null;
  private knownProIdentifiers: Set<string> = new Set();
  private registryLoaded = false;

  constructor(baseUrl?: string) {
    const defaultUrl = baseUrl || API_BASE_URL;
    this.apiClient = new ApiClient({
      baseUrl: defaultUrl,
      timeoutMs: 12000,
    });
    this.loadKnownProRegistry().catch(() => {});
  }

  /**
   * Loads the persistent registry of known Pro identifiers (emails, usernames, UIDs).
   * Ensures instant Pro detection upon cold start or prior to network login completion.
   */
  public async loadKnownProRegistry(): Promise<void> {
    if (this.registryLoaded) return;
    try {
      const raw = await safeAsyncStorage.getItem(KNOWN_PRO_IDENTIFIERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string' && item.trim()) {
              this.knownProIdentifiers.add(item.trim().toLowerCase());
            }
          }
        }
      }
      // Legacy entitlement fallback check
      const legacy = await safeAsyncStorage.getItem(USER_ENTITLEMENT_STORAGE_KEY);
      if (legacy) {
        try {
          const parsedLegacy = JSON.parse(legacy);
          if (parsedLegacy?.tier === 'PRO' && parsedLegacy?.userId) {
            this.knownProIdentifiers.add(parsedLegacy.userId.trim().toLowerCase());
          }
        } catch {}
      }
      this.registryLoaded = true;
    } catch (err) {
      console.warn('[UserEntitlementService] Error loading known Pro registry:', err);
    }
  }

  /**
   * Synchronously checks if an identifier (email, username, or UID) is known to hold Pro entitlement.
   */
  public isKnownProIdentifier(identifier?: string | null): boolean {
    if (!identifier) return false;
    const norm = identifier.trim().toLowerCase();
    if (!norm) return false;
    return this.knownProIdentifiers.has(norm);
  }

  /**
   * Persistently records an account's UID, email, and username as Pro-enabled.
   */
  public async recordProUser(user: {
    uid?: string | null;
    email?: string | null;
    username?: string | null;
  }): Promise<void> {
    let changed = false;

    if (user.uid) {
      const uidKey = user.uid.trim().toLowerCase();
      if (!this.knownProIdentifiers.has(uidKey)) {
        this.knownProIdentifiers.add(uidKey);
        changed = true;
      }
    }

    if (user.email) {
      const emailKey = user.email.trim().toLowerCase();
      if (!this.knownProIdentifiers.has(emailKey)) {
        this.knownProIdentifiers.add(emailKey);
        changed = true;
      }
      try {
        const emailRecord = JSON.stringify({
          tier: 'PRO',
          isPro: true,
          status: 'ready',
          userId: user.uid || null,
          source: 'cache',
          updatedAt: Date.now(),
        });
        await safeAsyncStorage.setItem(getEntitlementStorageKeyForEmail(user.email), emailRecord);
      } catch {}
    }

    if (user.username) {
      const unameKey = user.username.trim().toLowerCase();
      if (!this.knownProIdentifiers.has(unameKey)) {
        this.knownProIdentifiers.add(unameKey);
        changed = true;
      }
    }

    if (changed) {
      try {
        await safeAsyncStorage.setItem(
          KNOWN_PRO_IDENTIFIERS_STORAGE_KEY,
          JSON.stringify(Array.from(this.knownProIdentifiers))
        );
      } catch (err) {
        console.warn('[UserEntitlementService] Error saving known Pro registry:', err);
      }
    }
  }

  /**
   * Safely removes identifiers if Pro entitlement has been explicitly revoked server-side.
   */
  public async removeProUser(user: {
    uid?: string | null;
    email?: string | null;
    username?: string | null;
  }): Promise<void> {
    let changed = false;
    if (user.uid && this.knownProIdentifiers.delete(user.uid.trim().toLowerCase())) changed = true;
    if (user.email) {
      const emailKey = user.email.trim().toLowerCase();
      if (this.knownProIdentifiers.delete(emailKey)) changed = true;
      try {
        await safeAsyncStorage.removeItem(getEntitlementStorageKeyForEmail(user.email));
      } catch {}
    }
    if (user.username && this.knownProIdentifiers.delete(user.username.trim().toLowerCase())) changed = true;

    if (changed) {
      try {
        await safeAsyncStorage.setItem(
          KNOWN_PRO_IDENTIFIERS_STORAGE_KEY,
          JSON.stringify(Array.from(this.knownProIdentifiers))
        );
      } catch {}
    }
  }

  /**
   * Starts periodic polling for entitlement changes while the app is active.
   * Automatically avoids overlapping requests and only polls when the user is authenticated.
   */
  public startPolling(intervalMs?: number): void {
    if (intervalMs && intervalMs > 0) {
      this.pollingIntervalMs = intervalMs;
    }

    this.stopPolling();

    if (!this.isAppActive) return;
    const currentUid = (firebaseAuth as any)?.currentUser?.uid || this.currentState.userId;
    if (!currentUid) return;

    this.pollingTimer = setInterval(async () => {
      if (!this.isAppActive) return;
      const uid = (firebaseAuth as any)?.currentUser?.uid || this.currentState.userId;
      if (!uid) {
        this.stopPolling();
        return;
      }
      try {
        await this.refreshEntitlement();
      } catch (err) {
        // Safe catch: network glitches are caught gracefully without affecting active UI
      }
    }, this.pollingIntervalMs);
  }

  /**
   * Stops active periodic polling.
   */
  public stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Updates foreground/background activity state.
   * Pauses polling in background and triggers immediate refresh + polling in foreground.
   */
  public setAppActive(isActive: boolean): void {
    const wasActive = this.isAppActive;
    this.isAppActive = isActive;

    if (isActive) {
      // Immediate foreground verification
      this.refreshEntitlement().catch(() => {});
      this.startPolling();
    } else {
      // Pause polling immediately on app background/blur
      this.stopPolling();
    }
  }

  /**
   * Checks if periodic polling is currently active.
   */
  public get isPolling(): boolean {
    return this.pollingTimer !== null;
  }

  /**
   * Gets the current polling interval in milliseconds.
   */
  public get pollingInterval(): number {
    return this.pollingIntervalMs;
  }

  /**
   * Gets the last detected tier transition event, if any.
   */
  public get lastTransitionEvent(): EntitlementTransitionEvent | null {
    return this.lastTransition;
  }

  /**
   * Attaches an AppState listener to automatically refresh entitlement when app resumes to foreground
   * and manage polling lifecycle based on active/background transitions.
   */
  public attachAppStateListener(appStateModule: { addEventListener: (event: any, cb: (state: any) => void) => any }) {
    if (appStateModule && typeof appStateModule.addEventListener === 'function') {
      try {
        const sub = appStateModule.addEventListener('change', (nextState: string) => {
          this.setAppActive(nextState === 'active');
        });
        // Initial setup for active app state
        this.setAppActive(true);
        return {
          remove: () => {
            if (sub && typeof sub.remove === 'function') {
              sub.remove();
            }
            this.stopPolling();
          },
        };
      } catch (err) {
        console.warn('[UserEntitlementService] Could not attach AppState listener:', err);
      }
    }
    return null;
  }

  /**
   * Initializes and loads the offline-cached entitlement state for the current authenticated user.
   */
  public async getEntitlementState(targetUid?: string): Promise<UserEntitlementState> {
    await this.loadKnownProRegistry();
    const activeUid = targetUid !== undefined ? targetUid : (firebaseAuth as any)?.currentUser?.uid || null;

    if (this.initialized && this.currentState.userId === activeUid) {
      return this.currentState;
    }

    if (!activeUid) {
      this.currentState = {
        ...DEFAULT_ENTITLEMENT_STATE,
        status: 'ready',
        userId: null,
        updatedAt: Date.now(),
      };
      this.initialized = true;
      return this.currentState;
    }

    // Check if known Pro identifier (UID, email, or username)
    const email = (firebaseAuth as any)?.currentUser?.email || null;
    const displayName = (firebaseAuth as any)?.currentUser?.displayName || null;
    if (
      this.isKnownProIdentifier(activeUid) ||
      this.isKnownProIdentifier(email) ||
      this.isKnownProIdentifier(displayName)
    ) {
      this.currentState = {
        tier: 'PRO',
        isPro: true,
        status: 'ready',
        userId: activeUid,
        source: 'cache',
        updatedAt: Date.now(),
      };
      this.initialized = true;
      return this.currentState;
    }

    try {
      // 1. Try user-scoped storage key first for strict account isolation
      let raw = await safeAsyncStorage.getItem(getUserEntitlementStorageKey(activeUid));
      if (!raw && email) {
        raw = await safeAsyncStorage.getItem(getEntitlementStorageKeyForEmail(email));
      }
      if (!raw) {
        // Fallback to legacy key only if matching user ID
        const legacy = await safeAsyncStorage.getItem(USER_ENTITLEMENT_STORAGE_KEY);
        if (legacy) {
          const parsedLegacy = JSON.parse(legacy);
          if (parsedLegacy && parsedLegacy.userId === activeUid) {
            raw = legacy;
          }
        }
      }

      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.tier === 'PRO' || parsed.tier === 'NON_PRO') && (parsed.userId === activeUid || parsed.isPro)) {
          this.currentState = {
            tier: parsed.tier,
            isPro: parsed.tier === 'PRO',
            status: 'ready',
            userId: activeUid,
            grantedAt: parsed.grantedAt || null,
            grantedBy: parsed.grantedBy || null,
            revokedAt: parsed.revokedAt || null,
            source: 'cache',
            updatedAt: parsed.updatedAt || Date.now(),
          };
          this.initialized = true;
          return this.currentState;
        }
      }
    } catch (err) {
      console.warn('[UserEntitlementService] Error reading cached entitlement:', err);
    }

    // Default for newly detected user
    this.currentState = {
      ...DEFAULT_ENTITLEMENT_STATE,
      status: 'ready',
      userId: activeUid,
      updatedAt: Date.now(),
    };
    this.initialized = true;
    return this.currentState;
  }

  /**
   * Synchronous check if current user holds active Pro entitlement.
   */
  public get isPro(): boolean {
    return this.currentState.tier === 'PRO';
  }

  /**
   * Synchronous getter for current tier.
   */
  public get tier(): UserEntitlementTier {
    return this.currentState.tier;
  }

  /**
   * Synchronous getter for lifecycle status.
   */
  public get status(): EntitlementLifecycleStatus {
    return this.currentState.status;
  }

  /**
   * Synchronous getter for current state snapshot.
   */
  public getCurrentState(): UserEntitlementState {
    return { ...this.currentState };
  }

  /**
   * Handles user change / account switch.
   * Cancels any in-flight requests for the previous user and enforces strict session isolation.
   */
  /**
   * Handles user change / account switch.
   * Cancels any in-flight requests for the previous user and enforces strict session isolation.
   * Auto-detects if the user's UID, email, or username is known to be Pro enabled for instant Pro UI loading.
   */
  public handleUserChange(
    newUid: string | null,
    email?: string | null,
    username?: string | null
  ): void {
    // Invalidate any in-flight requests from the previous session
    this.currentRequestId++;
    this.inFlightRefreshPromise = null;

    if (!newUid) {
      this.stopPolling();
      this.currentState = {
        ...DEFAULT_ENTITLEMENT_STATE,
        status: 'ready',
        userId: null,
        source: 'default',
        updatedAt: Date.now(),
      };
      this.applyTierDemotion('Logged out or guest');
      this.notifyListeners();
      return;
    }

    const normEmail = email || (firebaseAuth as any)?.currentUser?.email || null;
    const normUsername = username || (firebaseAuth as any)?.currentUser?.displayName || null;

    // Check if new user is already known Pro (via email, username, or UID)
    const isKnown =
      this.isKnownProIdentifier(newUid) ||
      this.isKnownProIdentifier(normEmail) ||
      this.isKnownProIdentifier(normUsername);

    if (isKnown) {
      this.currentState = {
        tier: 'PRO',
        isPro: true,
        status: 'ready',
        userId: newUid,
        source: 'cache',
        updatedAt: Date.now(),
      };
      appExperienceService.setExperienceMode('pro').catch(() => {});
      this.notifyListeners();

      // Initiate background server refresh & start periodic polling
      this.refreshEntitlement().catch(() => {});
      this.startPolling();
      return;
    }

    // New user session: check if same user already verified from server
    const prevUid = this.currentState.userId;
    if (prevUid === newUid && this.currentState.source === 'server') {
      // Same user, background refresh only and ensure polling is running
      this.refreshEntitlement().catch(() => {});
      this.startPolling();
      return;
    }

    // Immediately isolate in-memory state to Non-Pro loading for unverified user
    this.currentState = {
      ...DEFAULT_ENTITLEMENT_STATE,
      userId: newUid,
      status: 'loading',
      updatedAt: Date.now(),
    };
    this.notifyListeners();

    // Load cached state for newUid or email then trigger server refresh and start polling
    Promise.all([
      safeAsyncStorage.getItem(getUserEntitlementStorageKey(newUid)),
      normEmail ? safeAsyncStorage.getItem(getEntitlementStorageKeyForEmail(normEmail)) : null,
    ])
      .then(([rawUid, rawEmail]) => {
        // Verify user hasn't switched again while async read was occurring
        if (this.currentState.userId !== newUid) return;

        const raw = rawUid || rawEmail;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.tier === 'PRO' || parsed.tier === 'NON_PRO')) {
              const isPro = parsed.tier === 'PRO';
              this.currentState = {
                tier: parsed.tier,
                isPro,
                status: 'ready',
                userId: newUid,
                grantedAt: parsed.grantedAt || null,
                grantedBy: parsed.grantedBy || null,
                revokedAt: parsed.revokedAt || null,
                source: 'cache',
                updatedAt: parsed.updatedAt || Date.now(),
              };
              if (isPro) {
                this.recordProUser({ uid: newUid, email: normEmail, username: normUsername }).catch(() => {});
                appExperienceService.setExperienceMode('pro').catch(() => {});
              } else {
                this.applyTierDemotion('Cached Non-Pro status');
              }
              this.notifyListeners();
            }
          } catch {}
        }

        // Initiate fresh network fetch for the new user and start periodic polling
        this.refreshEntitlement().catch(() => {});
        this.startPolling();
      })
      .catch(() => {
        this.refreshEntitlement().catch(() => {});
        this.startPolling();
      });
  }

  /**
   * Fast entitlement resolution invoked during login flows (Email, Google, Registration).
   * Resolves whether the user is Pro before navigation occurs, ensuring that Pro accounts
   * instantly navigate to /(tabs) and Non-Pro accounts navigate to /(tabs)/ipos without UI flashing.
   */
  public async resolveEntitlementForLogin(params: {
    uid?: string | null;
    email?: string | null;
    username?: string | null;
  }): Promise<UserEntitlementState> {
    await this.loadKnownProRegistry();

    const targetUid = params.uid || (firebaseAuth as any)?.currentUser?.uid || this.currentState.userId || null;
    const targetEmail = params.email || (firebaseAuth as any)?.currentUser?.email || null;
    const targetUsername = params.username || (firebaseAuth as any)?.currentUser?.displayName || null;

    // 1. Instant check in known Pro registry (0ms)
    if (
      this.isKnownProIdentifier(targetUid) ||
      this.isKnownProIdentifier(targetEmail) ||
      this.isKnownProIdentifier(targetUsername)
    ) {
      this.currentState = {
        tier: 'PRO',
        isPro: true,
        status: 'ready',
        userId: targetUid,
        source: 'cache',
        updatedAt: Date.now(),
      };
      await appExperienceService.setExperienceMode('pro').catch(() => {});
      this.notifyListeners();
      // Background verification only if authenticated user id is present
      if (targetUid) {
        this.refreshEntitlement().catch(() => {});
      }
      return this.currentState;
    }

    // 2. Check cached storage keys (user-scoped and email-scoped)
    if (targetUid) {
      try {
        const cached = await safeAsyncStorage.getItem(getUserEntitlementStorageKey(targetUid));
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.tier === 'PRO') {
            await this.recordProUser({ uid: targetUid, email: targetEmail, username: targetUsername }).catch(() => {});
            this.currentState = {
              tier: 'PRO',
              isPro: true,
              status: 'ready',
              userId: targetUid,
              source: 'cache',
              updatedAt: Date.now(),
            };
            await appExperienceService.setExperienceMode('pro').catch(() => {});
            this.notifyListeners();
            if (targetUid) {
              this.refreshEntitlement().catch(() => {});
            }
            return this.currentState;
          }
        }
      } catch {}
    }

    if (targetEmail) {
      try {
        const emailCached = await safeAsyncStorage.getItem(getEntitlementStorageKeyForEmail(targetEmail));
        if (emailCached) {
          const parsed = JSON.parse(emailCached);
          if (parsed?.tier === 'PRO') {
            await this.recordProUser({ uid: targetUid, email: targetEmail, username: targetUsername }).catch(() => {});
            this.currentState = {
              tier: 'PRO',
              isPro: true,
              status: 'ready',
              userId: targetUid || parsed.userId,
              source: 'cache',
              updatedAt: Date.now(),
            };
            await appExperienceService.setExperienceMode('pro').catch(() => {});
            this.notifyListeners();
            if (targetUid) {
              this.refreshEntitlement().catch(() => {});
            }
            return this.currentState;
          }
        }
      } catch {}
    }

    // 3. Fast bounded network & Firestore check (up to 2000ms while loading indicator displays)
    try {
      const netPromise = this.refreshEntitlement(false);
      const fsPromise = targetUid ? this.checkFirestoreEntitlement(targetUid) : Promise.resolve(null);
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));

      const raced = await Promise.race([
        Promise.all([netPromise, fsPromise]),
        timeoutPromise,
      ]);

      if (raced) {
        const [netState, fsTier] = raced;
        if (netState?.tier === 'PRO' || fsTier === 'PRO') {
          await this.recordProUser({ uid: targetUid, email: targetEmail, username: targetUsername }).catch(() => {});
          this.currentState = {
            tier: 'PRO',
            isPro: true,
            status: 'ready',
            userId: targetUid,
            source: 'server',
            updatedAt: Date.now(),
          };
          await appExperienceService.setExperienceMode('pro').catch(() => {});
          this.notifyListeners();
          return this.currentState;
        }
      }
    } catch (err) {
      console.warn('[UserEntitlementService] Fast login entitlement resolution error:', err);
    }

    return this.currentState;
  }

  /**
   * Helper to check user metadata and entitlement docs in Firestore directly.
   */
  public async checkFirestoreEntitlement(uid: string): Promise<UserEntitlementTier | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { doc, getDoc } = require('firebase/firestore');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { firestore } = require('../auth/firebaseConfig');
      if (!firestore) return null;

      const metaRef = doc(firestore, `users/${uid}/metadata/account_profile`);
      const userRef = doc(firestore, 'users', uid);
      const entRef = doc(firestore, `users/${uid}/metadata/entitlement`);

      const [metaSnap, userSnap, entSnap] = await Promise.all([
        getDoc(metaRef).catch(() => null),
        getDoc(userRef).catch(() => null),
        getDoc(entRef).catch(() => null),
      ]);

      const metaData = metaSnap?.exists() ? metaSnap.data() : {};
      const userData = userSnap?.exists() ? userSnap.data() : {};
      const entData = entSnap?.exists() ? entSnap.data() : {};

      const isPro = Boolean(
        metaData.is_pro ||
          metaData.isPro ||
          metaData.tier === 'PRO' ||
          metaData.pro ||
          metaData.plan === 'pro' ||
          metaData.plan === 'PRO' ||
          userData.is_pro ||
          userData.isPro ||
          userData.tier === 'PRO' ||
          userData.pro ||
          userData.plan === 'pro' ||
          userData.plan === 'PRO' ||
          entData.is_pro ||
          entData.isPro ||
          entData.tier === 'PRO' ||
          entData.pro ||
          entData.plan === 'pro' ||
          entData.plan === 'PRO'
      );

      return isPro ? 'PRO' : 'NON_PRO';
    } catch {
      return null;
    }
  }

  /**
   * Sets direct entitlement state (e.g. from profile cloud sync or admin payload).
   */
  public async setDirectEntitlement(params: {
    tier: UserEntitlementTier;
    userId?: string | null;
    email?: string | null;
    username?: string | null;
    source?: 'server' | 'cache';
  }): Promise<void> {
    const isPro = params.tier === 'PRO';
    this.currentState = {
      tier: params.tier,
      isPro,
      status: 'ready',
      userId: params.userId || this.currentState.userId,
      source: params.source || 'server',
      updatedAt: Date.now(),
    };

    if (isPro) {
      await this.recordProUser({
        uid: params.userId,
        email: params.email,
        username: params.username,
      });
      await appExperienceService.setExperienceMode('pro').catch(() => {});
    } else {
      await this.removeProUser({
        uid: params.userId,
        email: params.email,
        username: params.username,
      });
      await this.applyTierDemotion('Direct Non-Pro entitlement');
    }

    this.notifyListeners();
  }

  /**
   * Refreshes entitlement directly from the canonical backend service.
   * Features:
   * 1. In-flight request deduplication (prevents duplicate HTTP calls).
   * 2. Stale response dropping (prevents previous account's responses from overwriting active user).
   * 3. Offline fallback preserving current verified tier.
   * 4. Safe demotion without data destruction.
   */
  public async refreshEntitlement(forceAuthRefresh = false): Promise<UserEntitlementState> {
    if (this.inFlightRefreshPromise) {
      return this.inFlightRefreshPromise;
    }

    this.inFlightRefreshPromise = this.executeRefresh(forceAuthRefresh).finally(() => {
      this.inFlightRefreshPromise = null;
    });

    return this.inFlightRefreshPromise;
  }

  private async executeRefresh(forceAuthRefresh: boolean): Promise<UserEntitlementState> {
    const reqId = ++this.currentRequestId;
    const targetUid = (firebaseAuth as any)?.currentUser?.uid || this.currentState.userId || null;

    // If user is unauthenticated or guest, set to default Non-Pro safely
    if (!targetUid) {
      if (this.currentState.tier !== 'NON_PRO' || this.currentState.userId !== null) {
        this.currentState = {
          ...DEFAULT_ENTITLEMENT_STATE,
          status: 'ready',
          userId: null,
          updatedAt: Date.now(),
        };
        await this.applyTierDemotion('Logged out or unauthenticated');
        this.notifyListeners();
      }
      return this.currentState;
    }

    // Set status to refreshing
    this.currentState = {
      ...this.currentState,
      status: 'refreshing',
    };
    this.notifyListeners();

    try {
      const authHeaders = await getAuthHeaders(forceAuthRefresh);
      const activeUid = (firebaseAuth as any)?.currentUser?.uid || this.currentState.userId || null;

      // Stale check before network call
      if (reqId !== this.currentRequestId || activeUid !== targetUid) {
        return this.currentState;
      }

      if (!authHeaders.Authorization) {
        if (this.currentState.tier !== 'NON_PRO') {
          this.currentState = {
            ...DEFAULT_ENTITLEMENT_STATE,
            status: 'ready',
            userId: activeUid,
            updatedAt: Date.now(),
          };
          await this.applyTierDemotion('Unauthenticated token');
          this.notifyListeners();
        }
        return this.currentState;
      }

      const res = await this.apiClient.get<any>(
        ENDPOINTS.USER_ENTITLEMENT,
        undefined,
        authHeaders
      );

      // Stale check after network response
      const postFetchUid = (firebaseAuth as any)?.currentUser?.uid || this.currentState.userId || null;
      if (reqId !== this.currentRequestId || postFetchUid !== targetUid) {
        console.info(`[UserEntitlementService] Discarding stale response for user ${targetUid} (active: ${postFetchUid})`);
        return this.currentState;
      }

      const data = res?.data || res;
      if (data && typeof data.tier === 'string') {
        if (data.uid && data.uid !== targetUid) {
          console.warn(`[UserEntitlementService] Discarding response: payload uid (${data.uid}) does not match target user (${targetUid})`);
          return this.currentState;
        }

        const previousTier = this.currentState.tier;
        const serverTier: UserEntitlementTier = data.tier === 'PRO' ? 'PRO' : 'NON_PRO';

        if (previousTier !== serverTier && this.currentState.source !== 'default') {
          console.info(
            `[UserEntitlementService] Automatic entitlement transition detected: ${previousTier} -> ${serverTier}`
          );
          this.lastTransition = {
            previousTier,
            newTier: serverTier,
            timestamp: Date.now(),
          };

          try {
            const Haptics = require('expo-haptics');
            if (Haptics && typeof Haptics.notificationAsync === 'function') {
              if (serverTier === 'PRO') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              }
            }
          } catch {}
        }

        const updatedState: UserEntitlementState = {
          tier: serverTier,
          isPro: serverTier === 'PRO',
          status: 'ready',
          userId: data.uid || targetUid,
          grantedAt: data.grantedAt || null,
          grantedBy: data.grantedBy || null,
          revokedAt: data.revokedAt || null,
          source: 'server',
          updatedAt: Date.now(),
        };

        this.currentState = updatedState;

        const currentEmail = (firebaseAuth as any)?.currentUser?.email || data.email || null;
        const currentDisplayName = (firebaseAuth as any)?.currentUser?.displayName || data.username || null;

        if (serverTier === 'PRO') {
          this.recordProUser({
            uid: data.uid || targetUid,
            email: currentEmail,
            username: currentDisplayName,
          }).catch(() => {});
        } else {
          this.removeProUser({
            uid: data.uid || targetUid,
            email: currentEmail,
            username: currentDisplayName,
          }).catch(() => {});
        }

        // Persist fresh server state to user-isolated offline cache & legacy key & email key
        try {
          const serialized = JSON.stringify(updatedState);
          const savePromises: Promise<any>[] = [
            safeAsyncStorage.setItem(getUserEntitlementStorageKey(targetUid), serialized),
            safeAsyncStorage.setItem(USER_ENTITLEMENT_STORAGE_KEY, serialized),
          ];
          if (currentEmail) {
            savePromises.push(safeAsyncStorage.setItem(getEntitlementStorageKeyForEmail(currentEmail), serialized));
          }
          await Promise.all(savePromises);
        } catch (storageErr) {
          console.warn('[UserEntitlementService] Error saving entitlement cache:', storageErr);
        }

        // Sync active UI experience mode to match verified backend entitlement
        if (serverTier === 'PRO') {
          try {
            await appExperienceService.setExperienceMode('pro');
          } catch {}
        } else {
          await this.applyTierDemotion(
            previousTier === 'PRO' ? 'Server-side revocation' : 'Server-side Non-Pro status'
          );
        }

        this.notifyListeners();
      }
    } catch (err) {
      // Offline-first graceful fallback: preserve existing cached tier and transition status back to ready
      console.warn('[UserEntitlementService] Network refresh failed, retaining offline cache:', err);
      const postErrUid = (firebaseAuth as any)?.currentUser?.uid || this.currentState.userId || null;
      if (reqId === this.currentRequestId && postErrUid === targetUid) {
        this.currentState = {
          ...this.currentState,
          status: 'ready',
        };
        this.notifyListeners();
      }
    }

    return this.currentState;
  }

  /**
   * Resets entitlement to Non-Pro on sign-out without wiping user data.
   */
  public async handleSignOut(): Promise<void> {
    this.stopPolling();
    this.currentRequestId++;
    this.inFlightRefreshPromise = null;

    this.currentState = {
      ...DEFAULT_ENTITLEMENT_STATE,
      status: 'ready',
      userId: null,
      source: 'default',
      updatedAt: Date.now(),
    };

    try {
      await safeAsyncStorage.removeItem(USER_ENTITLEMENT_STORAGE_KEY);
    } catch {}

    // Safely demote experience mode
    try {
      await appExperienceService.setExperienceMode('non_pro');
    } catch {}

    this.notifyListeners();
  }

  /**
   * Safely demotes user to Non-Pro mode without deleting any SQLite user data
   * or interrupting financial operations.
   */
  private async applyTierDemotion(reason: string): Promise<void> {
    console.info(`[UserEntitlementService] Demoting experience mode to Non-Pro (${reason}). Financial data preserved.`);
    try {
      await appExperienceService.setExperienceMode('non_pro');
    } catch (err) {
      console.warn('[UserEntitlementService] Error updating experience mode on demotion:', err);
    }
  }

  /**
   * Subscribes a listener to entitlement updates.
   */
  public subscribe(listener: UserEntitlementListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentState);
      } catch (err) {
        console.error('[UserEntitlementService] Listener error:', err);
      }
    });
  }
}

export const userEntitlementService = new UserEntitlementService();

