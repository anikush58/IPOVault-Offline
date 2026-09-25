import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';

WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_AUTH_SESSION_KEY = 'ipovault_google_drive_auth_session';
export const LAST_CLOUD_BACKUP_KEY = 'ipovault_last_cloud_backup_ts';

export interface GoogleAuthUser {
  id?: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface GoogleAuthSession {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  tokenType?: string;
  scope?: string;
  user: GoogleAuthUser;
}

export const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
};

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// Lazy-loaded native GoogleSignin reference
let _googleSigninModule: any = null;
let _googleSigninConfigured = false;

function isNativeGoogleSigninLinked(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    const turbo =
      typeof TurboModuleRegistry?.get === 'function'
        ? TurboModuleRegistry.get('RNGoogleSignin')
        : null;
    if (turbo) return true;
  } catch {}
  try {
    if (
      NativeModules &&
      (NativeModules.RNGoogleSignin || NativeModules.RNGoogleSigninModule)
    ) {
      return true;
    }
  } catch {}
  return false;
}

function getNativeGoogleSignin(): { GoogleSignin: any; statusCodes: any } | null {
  if (!isNativeGoogleSigninLinked()) return null;
  if (_googleSigninModule) return _googleSigninModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-google-signin/google-signin');
    if (mod?.GoogleSignin) {
      if (!_googleSigninConfigured) {
        const webClientId =
          process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
          '720793268491-rbuifpfkufpr0c56bbpj05qnebuprmv4.apps.googleusercontent.com';

        mod.GoogleSignin.configure({
          scopes: ['https://www.googleapis.com/auth/drive.appdata'],
          webClientId,
          offlineAccess: false,
        });
        _googleSigninConfigured = true;
      }
      _googleSigninModule = mod;
      return mod;
    }
  } catch (err) {
    console.warn(
      '[googleDriveAuthService] Failed to initialize native GoogleSignin:',
      err
    );
  }
  return null;
}

/**
 * Resolves platform-specific Google OAuth Client ID from env or Expo config
 */
export function getGoogleClientId(): string {
  const extra = (Constants.expoConfig?.extra || {}) as Record<string, any>;
  if (Platform.OS === 'android') {
    return (
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
      extra.googleAndroidClientId ||
      process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
      extra.googleClientId ||
      '720793268491-7qjb9tsfeqb3rhchaliooeaa92pk73ko.apps.googleusercontent.com'
    );
  }
  if (Platform.OS === 'ios') {
    return (
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
      extra.googleIosClientId ||
      process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
      extra.googleClientId ||
      ''
    );
  }
  return (
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    extra.googleWebClientId ||
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
    extra.googleClientId ||
    '720793268491-rbuifpfkufpr0c56bbpj05qnebuprmv4.apps.googleusercontent.com'
  );
}

/**
 * Retrieves the stored Google OAuth session from device storage
 */
export async function getGoogleAuthSession(): Promise<GoogleAuthSession | null> {
  try {
    const raw = await safeAsyncStorage.getItem(GOOGLE_AUTH_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GoogleAuthSession;
  } catch (err) {
    console.warn('[googleDriveAuthService] Error reading stored session:', err);
    return null;
  }
}

/**
 * Returns a valid Google OAuth access token, automatically refreshing if expired
 */
export async function getValidAccessToken(): Promise<string | null> {
  const nativeAuth = getNativeGoogleSignin();
  if (nativeAuth) {
    try {
      const tokens = await nativeAuth.GoogleSignin.getTokens();
      if (tokens?.accessToken) {
        const session = await getGoogleAuthSession();
        if (session && session.accessToken !== tokens.accessToken) {
          session.accessToken = tokens.accessToken;
          await safeAsyncStorage.setItem(
            GOOGLE_AUTH_SESSION_KEY,
            JSON.stringify(session)
          );
        }
        return tokens.accessToken;
      }
    } catch {
      try {
        await nativeAuth.GoogleSignin.signInSilently();
        const freshTokens = await nativeAuth.GoogleSignin.getTokens();
        if (freshTokens?.accessToken) {
          const session = await getGoogleAuthSession();
          if (session) {
            session.accessToken = freshTokens.accessToken;
            await safeAsyncStorage.setItem(
              GOOGLE_AUTH_SESSION_KEY,
              JSON.stringify(session)
            );
          }
          return freshTokens.accessToken;
        }
      } catch (silentErr) {
        console.warn(
          '[googleDriveAuthService] Silent sign-in failed on Android:',
          silentErr
        );
      }
    }
  }

  // Web / Fallback flow
  const session = await getGoogleAuthSession();
  if (!session || !session.accessToken) return null;

  const isExpiring = session.expiresAt && Date.now() > session.expiresAt - 60000;
  if (!isExpiring) {
    return session.accessToken;
  }

  // Refresh token if refresh_token is available (Web fallback)
  if (session.refreshToken) {
    const clientId = getGoogleClientId();
    if (clientId) {
      try {
        const refreshRes = await AuthSession.refreshAsync(
          {
            clientId,
            refreshToken: session.refreshToken,
          },
          GOOGLE_DISCOVERY
        );

        if (refreshRes.accessToken) {
          const updatedSession: GoogleAuthSession = {
            ...session,
            accessToken: refreshRes.accessToken,
            refreshToken: refreshRes.refreshToken || session.refreshToken,
            expiresAt: refreshRes.expiresIn
              ? Date.now() + refreshRes.expiresIn * 1000
              : null,
          };
          await safeAsyncStorage.setItem(
            GOOGLE_AUTH_SESSION_KEY,
            JSON.stringify(updatedSession)
          );
          return refreshRes.accessToken;
        }
      } catch (refErr: any) {
        console.warn('[googleDriveAuthService] Token refresh failed:', refErr);
        if (
          refErr?.message?.includes('invalid_grant') ||
          refErr?.message?.includes('revoked')
        ) {
          await disconnectGoogleDrive();
          return null;
        }
      }
    }
  }

  return session.accessToken;
}

/**
 * Initiates Google OAuth consent flow for Google Drive AppData access
 */
export async function signInWithGoogleDrive(): Promise<{
  success: boolean;
  session?: GoogleAuthSession;
  error?: string;
}> {
  const nativeAuth = getNativeGoogleSignin();

  // Native Google Sign-In for Android builds with RNGoogleSignin
  if (nativeAuth) {
    try {
      await nativeAuth.GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const response = await nativeAuth.GoogleSignin.signIn();

      if (response?.type === 'cancelled') {
        return { success: false, error: 'Sign in was cancelled.' };
      }

      const userData = response?.data?.user;
      const tokens = await nativeAuth.GoogleSignin.getTokens();

      if (!tokens?.accessToken) {
        throw new Error('Failed to obtain Google Drive access token.');
      }

      const session: GoogleAuthSession = {
        accessToken: tokens.accessToken,
        refreshToken: null,
        expiresAt: null,
        tokenType: 'Bearer',
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        user: {
          id: userData?.id,
          email: userData?.email || 'Google Account',
          name: userData?.name || undefined,
          picture: userData?.photo || undefined,
        },
      };

      await safeAsyncStorage.setItem(
        GOOGLE_AUTH_SESSION_KEY,
        JSON.stringify(session)
      );

      return { success: true, session };
    } catch (err: any) {
      if (err?.code === nativeAuth.statusCodes?.SIGN_IN_CANCELLED) {
        return { success: false, error: 'Sign in was cancelled.' };
      }
      if (err?.code === nativeAuth.statusCodes?.IN_PROGRESS) {
        return { success: false, error: 'Sign in is already in progress.' };
      }
      if (err?.code === nativeAuth.statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
        return {
          success: false,
          error:
            'Google Play Services is not available or outdated on this device.',
        };
      }
      console.error('[googleDriveAuthService] Native GoogleSignin error:', err);
      return {
        success: false,
        error: err?.message || 'Failed to authenticate with Google.',
      };
    }
  }

  // Fallback for Web and environments without native binary linked
  const clientId = getGoogleClientId();
  if (!clientId) {
    return {
      success: false,
      error:
        'Google OAuth Client ID is not configured. Please set EXPO_PUBLIC_GOOGLE_CLIENT_ID in your environment.',
    };
  }

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'ipovault',
    path: 'google-auth-callback',
  });

  try {
    const request = new AuthSession.AuthRequest({
      clientId,
      scopes: GOOGLE_DRIVE_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      prompt: AuthSession.Prompt.Consent,
      extraParams: {
        access_type: 'offline',
      },
    });

    const result = await request.promptAsync(GOOGLE_DISCOVERY);

    if (result.type === 'success' && result.params?.code) {
      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId,
          code: result.params.code,
          redirectUri,
          extraParams: {
            code_verifier: request.codeVerifier || '',
          },
        },
        GOOGLE_DISCOVERY
      );

      const accessToken = tokenResponse.accessToken;
      const refreshToken = tokenResponse.refreshToken || null;
      const expiresIn = tokenResponse.expiresIn;
      const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;

      let user: GoogleAuthUser = { email: 'Google Account' };
      try {
        const userInfoRes = await fetch(GOOGLE_DISCOVERY.userInfoEndpoint!, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json();
          user = {
            id: userInfo.sub || userInfo.id,
            email: userInfo.email || 'Google Account',
            name: userInfo.name || userInfo.given_name,
            picture: userInfo.picture,
          };
        }
      } catch (uiErr) {
        console.warn(
          '[googleDriveAuthService] Failed to fetch user profile:',
          uiErr
        );
      }

      const session: GoogleAuthSession = {
        accessToken,
        refreshToken,
        expiresAt,
        tokenType: tokenResponse.tokenType,
        scope: tokenResponse.scope,
        user,
      };

      await safeAsyncStorage.setItem(
        GOOGLE_AUTH_SESSION_KEY,
        JSON.stringify(session)
      );

      return { success: true, session };
    } else if (result.type === 'cancel' || result.type === 'dismiss') {
      return { success: false, error: 'Sign in was cancelled.' };
    } else {
      const errMsg =
        (result as any).error?.message ||
        (result as any).params?.error_description ||
        'Google authentication was not completed.';
      return { success: false, error: errMsg };
    }
  } catch (err: any) {
    console.error('[googleDriveAuthService] signInWithGoogleDrive exception:', err);
    return {
      success: false,
      error: err?.message || 'Failed to authenticate with Google.',
    };
  }
}

/**
 * Revokes active Google token and removes stored session from device
 */
export async function disconnectGoogleDrive(): Promise<void> {
  const nativeAuth = getNativeGoogleSignin();
  if (nativeAuth) {
    try {
      await nativeAuth.GoogleSignin.signOut();
    } catch {}
  }

  try {
    const session = await getGoogleAuthSession();
    if (session?.accessToken) {
      fetch(
        `${GOOGLE_DISCOVERY.revocationEndpoint}?token=${encodeURIComponent(
          session.accessToken
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      ).catch(() => {});
    }
  } catch {}

  await safeAsyncStorage.removeItem(GOOGLE_AUTH_SESSION_KEY);
  await safeAsyncStorage.removeItem(LAST_CLOUD_BACKUP_KEY);
}

/**
 * Checks if a valid Google Drive session exists
 */
export async function isGoogleDriveConnected(): Promise<boolean> {
  const session = await getGoogleAuthSession();
  return Boolean(session && session.accessToken);
}
