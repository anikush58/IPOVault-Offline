import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  AuthUserProfile,
  subscribeToAuthState,
  loginWithEmailPassword,
  registerWithEmailPassword,
  signInWithGoogleNative,
  sendPasswordReset,
  signOutFirebaseUser,
  updateUserProfileCloud,
  fetchUserProfileCloud,
} from '@/services/auth/firebaseAuthService';
import { firebaseAuth } from '@/services/auth/firebaseConfig';
import { cancelDebouncedFirestoreSync } from '@/services/cloud/firestoreSyncService';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { ensureBase64DataUrl, saveBase64ToLocalImage } from '@/utils/imageUtils';

export type AuthUser = AuthUserProfile;

export type AuthContextType = {
  user: AuthUser | null;
  session: { user: AuthUser } | null;
  isLoading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<{ user?: AuthUser | null; error: string | null }>;
  signUpWithEmail: (email: string, pass: string, fullName?: string) => Promise<{ user?: AuthUser | null; error: string | null }>;
  signInWithGoogle: () => Promise<{ user?: AuthUser | null; error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (displayName?: string, avatarUri?: string | null) => Promise<{ success: boolean; error: string | null }>;
  syncProfileFromCloud: (targetUid?: string) => Promise<{ displayName?: string | null; avatarUri?: string | null } | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_AUTH_VALUE: AuthContextType = {
  user: null,
  session: null,
  isLoading: false,
  signInWithEmail: async () => ({ user: null, error: 'Auth not initialized' }),
  signUpWithEmail: async () => ({ user: null, error: 'Auth not initialized' }),
  signInWithGoogle: async () => ({ user: null, error: 'Auth not initialized' }),
  resetPassword: async () => ({ error: 'Auth not initialized' }),
  signOut: async () => {},
  updateProfile: async () => ({ success: true, error: null }),
  syncProfileFromCloud: async () => null,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const syncProfileFromCloud = async (
    targetUid?: string
  ): Promise<{ displayName?: string | null; avatarUri?: string | null } | null> => {
    const uid = targetUid || user?.uid || firebaseAuth.currentUser?.uid;
    if (!uid) return null;

    try {
      const [cloudProfile, localUsername, localAvatar] = await Promise.all([
        fetchUserProfileCloud(uid),
        safeAsyncStorage.getItem('@ipovault_username'),
        safeAsyncStorage.getItem('@ipovault_avatar_uri'),
      ]);

      let hydratedName: string | null = null;
      let hydratedAvatar: string | null = null;

      // 1. Reconcile Username / Display Name
      if (cloudProfile?.displayName && cloudProfile.displayName.trim()) {
        const cloudName = cloudProfile.displayName.trim();
        await safeAsyncStorage.setItem('@ipovault_username', cloudName);
        hydratedName = cloudName;
        setUser((prev) => (prev ? { ...prev, displayName: cloudName } : prev));
      } else if (localUsername && localUsername.trim()) {
        // Device has a local custom username that hasn't made it to the cloud yet -> sync it up!
        hydratedName = localUsername.trim();
        setUser((prev) => (prev ? { ...prev, displayName: hydratedName } : prev));
        updateUserProfileCloud({ displayName: hydratedName }).catch(() => {});
      } else if (firebaseAuth.currentUser?.displayName) {
        const authName = firebaseAuth.currentUser.displayName.trim();
        await safeAsyncStorage.setItem('@ipovault_username', authName);
        hydratedName = authName;
        setUser((prev) => (prev ? { ...prev, displayName: authName } : prev));
      }

      // 2. Reconcile Avatar
      if (cloudProfile?.avatarUrl && cloudProfile.avatarUrl.trim()) {
        const cloudAvatar = cloudProfile.avatarUrl.trim();
        if (!localAvatar || localAvatar !== cloudAvatar) {
          if (cloudAvatar.startsWith('data:')) {
            const savedLocalPath = await saveBase64ToLocalImage(cloudAvatar, 'avatar', uid);
            const pathUri = savedLocalPath || cloudAvatar;
            await safeAsyncStorage.setItem('@ipovault_avatar_uri', pathUri);
            hydratedAvatar = pathUri;
          } else {
            await safeAsyncStorage.setItem('@ipovault_avatar_uri', cloudAvatar);
            hydratedAvatar = cloudAvatar;
          }
        } else {
          hydratedAvatar = localAvatar;
        }
        setUser((prev) => (prev ? { ...prev, photoURL: hydratedAvatar || cloudAvatar } : prev));
      } else if (localAvatar && localAvatar.trim()) {
        // Device has a local avatar that hasn't made it to the cloud yet -> sync it up!
        hydratedAvatar = localAvatar.trim();
        ensureBase64DataUrl(hydratedAvatar).then((dataUrl) => {
          if (
            dataUrl &&
            (dataUrl.startsWith('data:') ||
              dataUrl.startsWith('http://') ||
              dataUrl.startsWith('https://'))
          ) {
            updateUserProfileCloud({ avatarDataUrl: dataUrl }).catch(() => {});
          }
        });
      }

      return { displayName: hydratedName, avatarUri: hydratedAvatar };
    } catch (err) {
      console.warn('[AuthContext] Error syncing profile from cloud:', err);
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((authUser) => {
      setUser(authUser);
      setIsLoading(false);
      if (authUser?.uid) {
        syncProfileFromCloud(authUser.uid).catch((e) =>
          console.warn('[AuthContext] syncProfileFromCloud error:', e)
        );
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signInWithEmail = async (email: string, pass: string) => {
    const res = await loginWithEmailPassword(email, pass);
    if (res.user) {
      setUser(res.user);
      try {
        const synced = await syncProfileFromCloud(res.user.uid);
        if (synced) {
          if (synced.displayName) {
            res.user.displayName = synced.displayName;
          }
          if (synced.avatarUri) {
            res.user.photoURL = synced.avatarUri;
          }
        }
      } catch (syncErr) {
        console.warn('[AuthContext] Error during sign-in profile sync:', syncErr);
      }
    }
    return { user: res.user, error: res.error };
  };

  const signUpWithEmail = async (email: string, pass: string, fullName?: string) => {
    const res = await registerWithEmailPassword(email, pass, fullName);
    if (res.user) {
      setUser(res.user);
      if (fullName && fullName.trim()) {
        const trimmed = fullName.trim();
        await safeAsyncStorage.setItem('@ipovault_username', trimmed);
        await updateUserProfileCloud({ displayName: trimmed }).catch(() => {});
      }
    }
    return { user: res.user, error: res.error };
  };

  const signInWithGoogle = async () => {
    const res = await signInWithGoogleNative();
    if (res.user) {
      setUser(res.user);
      try {
        const synced = await syncProfileFromCloud(res.user.uid);
        if (synced) {
          if (synced.displayName) {
            res.user.displayName = synced.displayName;
          }
          if (synced.avatarUri) {
            res.user.photoURL = synced.avatarUri;
          }
        }
      } catch (syncErr) {
        console.warn('[AuthContext] Error during Google sign-in profile sync:', syncErr);
      }
    }
    return { user: res.user, error: res.error };
  };

  const resetPassword = async (email: string) => {
    const res = await sendPasswordReset(email);
    return { error: res.error };
  };

  const signOut = async () => {
    cancelDebouncedFirestoreSync();
    await Promise.all([
      safeAsyncStorage.removeItem('@ipovault_username'),
      safeAsyncStorage.removeItem('@ipovault_avatar_uri'),
    ]).catch(() => {});
    await signOutFirebaseUser();
    setUser(null);
  };

  const updateProfile = async (
    displayName?: string,
    avatarUri?: string | null
  ): Promise<{ success: boolean; error: string | null }> => {
    try {
      const activeUid = user?.uid || firebaseAuth.currentUser?.uid;

      // 1. Handle Display Name locally
      if (displayName !== undefined) {
        const trimmed = displayName ? displayName.trim() : '';
        if (trimmed) {
          await safeAsyncStorage.setItem('@ipovault_username', trimmed);
          setUser((prev) => (prev ? { ...prev, displayName: trimmed } : prev));
        } else {
          await safeAsyncStorage.removeItem('@ipovault_username');
        }
      }

      // 2. Handle Avatar locally & ensure Base64 data URL for cloud
      let avatarDataUrl: string | null | undefined = undefined;
      if (avatarUri !== undefined) {
        if (avatarUri === null) {
          await safeAsyncStorage.removeItem('@ipovault_avatar_uri');
          avatarDataUrl = null;
          setUser((prev) => (prev ? { ...prev, photoURL: null } : prev));
        } else if (avatarUri.trim()) {
          const rawUri = avatarUri.trim();
          const convertedDataUrl = await ensureBase64DataUrl(rawUri);
          avatarDataUrl = convertedDataUrl || rawUri;

          if (rawUri.startsWith('file://') || rawUri.startsWith('content://')) {
            const uid = activeUid || 'user';
            const persistentLocal = await saveBase64ToLocalImage(avatarDataUrl, 'avatar', uid);
            const savedUri = persistentLocal || rawUri;
            await safeAsyncStorage.setItem('@ipovault_avatar_uri', savedUri);
            setUser((prev) => (prev ? { ...prev, photoURL: savedUri } : prev));
          } else {
            await safeAsyncStorage.setItem('@ipovault_avatar_uri', rawUri);
            setUser((prev) => (prev ? { ...prev, photoURL: rawUri } : prev));
          }
        }
      }

      // 3. Sync to Cloud (Firebase Auth + Firestore)
      if (activeUid) {
        const cloudRes = await updateUserProfileCloud({
          displayName,
          avatarDataUrl,
        });
        return cloudRes;
      }

      return { success: true, error: null };
    } catch (err: any) {
      console.error('[AuthContext] updateProfile error:', err);
      return { success: false, error: err?.message || 'Failed to update profile' };
    }
  };

  const session = user ? { user } : null;

  const value = {
    user,
    session,
    isLoading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    resetPassword,
    signOut,
    updateProfile,
    syncProfileFromCloud,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return DEFAULT_AUTH_VALUE;
  }
  return context;
}
