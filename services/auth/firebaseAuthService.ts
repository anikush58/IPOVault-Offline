import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  GoogleAuthProvider,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseAuth, firestore } from './firebaseConfig';

export interface AuthUserProfile {
  id: string;
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

export function formatAuthError(error: any): string {
  if (!error) return 'An unexpected authentication error occurred.';
  const code = error.code || '';
  const message = error.message || '';

  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Invalid email or password. Please verify your credentials.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Access to this account has been temporarily disabled due to many failed login attempts. Please reset your password or try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in window was closed.';
    default:
      if (message.includes('PLAY_SERVICES_NOT_AVAILABLE')) {
        return 'Google Play Services is unavailable on this device.';
      }
      if (message.includes('SIGN_IN_CANCELLED')) {
        return 'Google Sign-In was cancelled.';
      }
      return message || 'Authentication failed. Please try again.';
  }
}

export function mapFirebaseUser(user: FirebaseUser | null): AuthUserProfile | null {
  if (!user) return null;
  return {
    id: user.uid,
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

function isNativeGoogleSigninLinked(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    const Platform = rn?.Platform;
    const TurboModuleRegistry = rn?.TurboModuleRegistry;
    const NativeModules = rn?.NativeModules;

    if (Platform && Platform.OS !== 'android' && Platform.OS !== 'ios') return false;

    const turbo =
      typeof TurboModuleRegistry?.get === 'function'
        ? TurboModuleRegistry.get('RNGoogleSignin')
        : null;
    if (turbo) return true;

    if (
      NativeModules &&
      (NativeModules.RNGoogleSignin || NativeModules.RNGoogleSigninModule)
    ) {
      return true;
    }
  } catch {}
  return false;
}

let _googleSigninConfigured = false;
let _googleSigninModule: any = null;

function getNativeGoogleSignin(): any | null {
  if (!isNativeGoogleSigninLinked()) return null;
  if (_googleSigninModule) return _googleSigninModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-google-signin/google-signin');
    if (mod?.GoogleSignin) {
      if (!_googleSigninConfigured) {
        const webClientId =
          process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
          '649099972-hrmk5h725abna6a4o96ikcbqfl4ke2tn.apps.googleusercontent.com';

        mod.GoogleSignin.configure({
          webClientId,
          offlineAccess: false,
          scopes: ['profile', 'email'],
        });
        _googleSigninConfigured = true;
      }
      _googleSigninModule = mod;
      return mod;
    }
  } catch (err) {
    console.warn('[firebaseAuthService] Failed to initialize native GoogleSignin:', err);
  }
  return null;
}

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
};

async function signInWithGoogleAuthSession(): Promise<{
  user: AuthUserProfile | null;
  error: string | null;
}> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AuthSession = require('expo-auth-session');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WebBrowser = require('expo-web-browser');
    WebBrowser?.maybeCompleteAuthSession?.();

    const webClientId =
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      '649099972-hrmk5h725abna6a4o96ikcbqfl4ke2tn.apps.googleusercontent.com';

    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'ipovault',
      preferLocalhost: false,
    });

    const request = new AuthSession.AuthRequest({
      clientId: webClientId,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.IdToken,
      redirectUri,
    });

    const result = await request.promptAsync(GOOGLE_DISCOVERY);

    if (result.type === 'success') {
      const idToken = result.params?.id_token;
      if (!idToken) {
        throw new Error('No ID token returned from Google sign-in.');
      }
      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(firebaseAuth, credential);
      return { user: mapFirebaseUser(userCredential.user), error: null };
    }

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { user: null, error: 'Google Sign-In was cancelled.' };
    }

    return { user: null, error: 'Google Sign-In failed or was closed.' };
  } catch (err: any) {
    console.error('[firebaseAuthService] Google AuthSession fallback error:', err);
    return { user: null, error: formatAuthError(err) };
  }
}

export async function registerWithEmailPassword(
  email: string,
  pass: string,
  fullName?: string,
): Promise<{ user: AuthUserProfile | null; error: string | null }> {
  try {
    const cred = await createUserWithEmailAndPassword(
      firebaseAuth,
      email.trim(),
      pass,
    );
    if (fullName && fullName.trim()) {
      try {
        await updateProfile(cred.user, { displayName: fullName.trim() });
      } catch (e) {
        console.warn('[firebaseAuthService] Could not set displayName:', e);
      }
    }
    const profile = mapFirebaseUser(cred.user);
    if (profile && fullName && fullName.trim()) {
      profile.displayName = fullName.trim();
    }
    return { user: profile, error: null };
  } catch (err: any) {
    return { user: null, error: formatAuthError(err) };
  }
}

export async function loginWithEmailPassword(
  email: string,
  pass: string,
): Promise<{ user: AuthUserProfile | null; error: string | null }> {
  try {
    const cred = await signInWithEmailAndPassword(
      firebaseAuth,
      email.trim(),
      pass,
    );
    return { user: mapFirebaseUser(cred.user), error: null };
  } catch (err: any) {
    return { user: null, error: formatAuthError(err) };
  }
}

export async function signInWithGoogleNative(): Promise<{
  user: AuthUserProfile | null;
  error: string | null;
}> {
  try {
    const nativeMod = getNativeGoogleSignin();

    if (!nativeMod) {
      // Running in Expo Go or Web where native module is not compiled into binary
      return await signInWithGoogleAuthSession();
    }

    const { GoogleSignin } = nativeMod;

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    if (response?.type === 'cancelled') {
      return { user: null, error: 'Google Sign-In was cancelled.' };
    }

    let idToken = response?.data?.idToken;
    if (!idToken) {
      const tokens = await GoogleSignin.getTokens();
      idToken = tokens?.idToken;
    }

    if (!idToken) {
      throw new Error('Could not obtain Google ID Token from native sign-in.');
    }

    // Exchange ID Token for Firebase Credential
    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(firebaseAuth, credential);

    return { user: mapFirebaseUser(userCredential.user), error: null };
  } catch (err: any) {
    console.error('[firebaseAuthService] Google Sign-In error:', err);
    return { user: null, error: formatAuthError(err) };
  }
}

export async function sendPasswordReset(
  email: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    await sendPasswordResetEmail(firebaseAuth, email.trim());
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: formatAuthError(err) };
  }
}

export async function signOutFirebaseUser(): Promise<void> {
  try {
    const nativeMod = getNativeGoogleSignin();
    if (nativeMod) {
      try {
        await nativeMod.GoogleSignin.signOut();
      } catch {}
    }
    await signOut(firebaseAuth);
  } catch (err) {
    console.warn('[firebaseAuthService] Sign out error:', err);
  }
}

export function subscribeToAuthState(
  callback: (user: AuthUserProfile | null) => void,
): () => void {
  return onAuthStateChanged(firebaseAuth, (user) => {
    callback(mapFirebaseUser(user));
  });
}

/**
 * Retrieves cryptographically signed Firebase ID token for the active session.
 * Used for Bearer authorization in backend API requests.
 */
export async function getFirebaseAuthToken(forceRefresh = false): Promise<string | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.warn('[firebaseAuthService] Failed to get ID token:', err);
    return null;
  }
}

export interface CloudUserProfile {
  displayName: string | null;
  username?: string | null;
  avatarUrl: string | null;
  photoURL?: string | null;
  email?: string | null;
  updatedAt?: string | null;
}

/**
 * Updates the user's username/displayName and profile avatar in Firebase Auth and Firestore cloud.
 * Offline-first: returns success gracefully if no active Firebase session exists.
 * Supports chunking for large avatar data URLs to stay within Firestore document limits.
 */
export async function updateUserProfileCloud(params: {
  displayName?: string | null;
  avatarDataUrl?: string | null;
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = firebaseAuth.currentUser;
    if (!user) {
      // Offline / guest session: local storage acts as source of truth
      return { success: true, error: null };
    }

    const { displayName, avatarDataUrl } = params;
    const uid = user.uid;

    // 1. Update Firebase Auth user profile (displayName & photoURL if applicable)
    const authProfileUpdate: { displayName?: string; photoURL?: string } = {};
    if (displayName !== undefined && displayName !== null) {
      const trimmedName = displayName.trim();
      if (trimmedName) authProfileUpdate.displayName = trimmedName;
    }

    if (avatarDataUrl) {
      // Firebase Auth photoURL limit is 2,048 chars (suitable for remote HTTP URLs)
      if (avatarDataUrl.startsWith('http://') || avatarDataUrl.startsWith('https://')) {
        authProfileUpdate.photoURL = avatarDataUrl;
      }
    } else if (avatarDataUrl === null) {
      authProfileUpdate.photoURL = '';
    }

    if (Object.keys(authProfileUpdate).length > 0) {
      try {
        await updateProfile(user, authProfileUpdate);
      } catch (authErr) {
        console.warn('[firebaseAuthService] Auth updateProfile warning:', authErr);
      }
    }

    // 2. Base Firestore Document Structure
    const firestoreData: Record<string, any> = {
      updatedAt: serverTimestamp(),
      updated_at: new Date().toISOString(),
      email: user.email || null,
    };

    if (displayName !== undefined) {
      const trimmedName = displayName ? displayName.trim() : null;
      firestoreData.displayName = trimmedName;
      firestoreData.username = trimmedName;
    }

    const userDocRef = doc(firestore, 'users', uid);
    const metaProfileDocRef = doc(firestore, `users/${uid}/metadata/account_profile`);

    // 3. Handle Avatar Data & Chunking
    if (avatarDataUrl !== undefined) {
      if (avatarDataUrl === null) {
        firestoreData.avatar_url = null;
        firestoreData.photoURL = null;
        firestoreData.has_avatar_chunks = false;
        firestoreData.total_avatar_chunks = 0;
      } else if (avatarDataUrl.trim()) {
        const rawAvatar = avatarDataUrl.trim();
        // Do not persist device-local file paths to the cloud
        if (!rawAvatar.startsWith('file://') && !rawAvatar.startsWith('content://')) {
          if (rawAvatar.length < 800000) {
            firestoreData.avatar_url = rawAvatar;
            firestoreData.photoURL = rawAvatar;
            firestoreData.has_avatar_chunks = false;
            firestoreData.total_avatar_chunks = 0;
          } else {
            // Chunk large Data URL into ~400KB chunks across dedicated sub-documents
            try {
              const CHUNK_SIZE = 400000;
              const totalChunks = Math.ceil(rawAvatar.length / CHUNK_SIZE);
              const chunkPromises = [];

              for (let i = 0; i < totalChunks; i++) {
                const chunkSlice = rawAvatar.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                const chunkDocRef = doc(firestore, `users/${uid}/avatar_chunks/chunk_${i}`);
                chunkPromises.push(
                  setDoc(chunkDocRef, {
                    index: i,
                    chunk: chunkSlice,
                    totalChunks,
                    updated_at: new Date().toISOString(),
                  }, { merge: true })
                );
              }

              await Promise.all(chunkPromises);
              firestoreData.avatar_url = '__chunked__';
              firestoreData.photoURL = '__chunked__';
              firestoreData.has_avatar_chunks = true;
              firestoreData.total_avatar_chunks = totalChunks;
            } catch (chunkErr) {
              console.warn('[firebaseAuthService] Avatar chunking warning:', chunkErr);
            }
          }
        }
      }
    }

    // 4. Save to Firestore (both doc roots for compatibility with all security rules and restore points)
    await Promise.all([
      setDoc(userDocRef, firestoreData, { merge: true }),
      setDoc(metaProfileDocRef, firestoreData, { merge: true }),
    ]);

    return { success: true, error: null };
  } catch (err: any) {
    console.error('[firebaseAuthService] updateUserProfileCloud error:', err);
    return { success: false, error: formatAuthError(err) };
  }
}

/**
 * Fetches user profile from Firestore cloud (displayName, avatar_url, etc.)
 * Safely falls back to Firebase Auth currentUser details if Firestore doc has missing fields.
 */
export async function fetchUserProfileCloud(
  targetUid?: string
): Promise<CloudUserProfile | null> {
  try {
    const uid = targetUid || firebaseAuth.currentUser?.uid;
    if (!uid) return null;

    const metaProfileDocRef = doc(firestore, `users/${uid}/metadata/account_profile`);
    const userDocRef = doc(firestore, 'users', uid);

    const [metaSnap, userSnap] = await Promise.all([
      getDoc(metaProfileDocRef).catch(() => null),
      getDoc(userDocRef).catch(() => null),
    ]);

    const metaData = metaSnap && metaSnap.exists() ? metaSnap.data() : {};
    const userData = userSnap && userSnap.exists() ? userSnap.data() : {};
    const mergedData = { ...userData, ...metaData };

    const currentUser = firebaseAuth.currentUser;
    const isTargetCurrentUser = currentUser && currentUser.uid === uid;

    // Resolve Display Name
    let displayName = mergedData.displayName || mergedData.username || null;
    if (!displayName && isTargetCurrentUser && currentUser.displayName) {
      displayName = currentUser.displayName.trim();
    }

    // Resolve Avatar URL (including chunked avatars)
    let avatarUrl = mergedData.avatar_url || mergedData.photoURL || null;

    if (mergedData.has_avatar_chunks && mergedData.total_avatar_chunks > 0) {
      try {
        const total = Number(mergedData.total_avatar_chunks);
        const chunkPromises = [];
        for (let i = 0; i < total; i++) {
          const chunkRef = doc(firestore, `users/${uid}/avatar_chunks/chunk_${i}`);
          chunkPromises.push(getDoc(chunkRef));
        }
        const chunkSnaps = await Promise.all(chunkPromises);
        let reconstructed = '';
        for (const snap of chunkSnaps) {
          if (snap.exists() && snap.data()?.chunk) {
            reconstructed += snap.data().chunk;
          }
        }
        if (reconstructed.startsWith('data:')) {
          avatarUrl = reconstructed;
        }
      } catch (chunkReadErr) {
        console.warn('[firebaseAuthService] Failed to read avatar chunks:', chunkReadErr);
      }
    }

    if ((!avatarUrl || avatarUrl === '__chunked__') && isTargetCurrentUser && currentUser.photoURL) {
      avatarUrl = currentUser.photoURL;
    }

    if (avatarUrl === '__chunked__') {
      avatarUrl = null;
    }

    const email = mergedData.email || (isTargetCurrentUser ? currentUser.email : null);
    const updatedAt = mergedData.updated_at || null;

    return {
      displayName,
      username: displayName,
      avatarUrl,
      photoURL: avatarUrl,
      email,
      updatedAt,
    };
  } catch (err) {
    console.warn('[firebaseAuthService] fetchUserProfileCloud error:', err);
    return null;
  }
}

