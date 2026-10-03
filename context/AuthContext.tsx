import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  AuthUserProfile,
  subscribeToAuthState,
  loginWithEmailPassword,
  registerWithEmailPassword,
  signInWithGoogleNative,
  sendPasswordReset,
  signOutFirebaseUser,
} from '@/services/auth/firebaseAuthService';

export type AuthUser = AuthUserProfile;

export type AuthContextType = {
  user: AuthUser | null;
  session: { user: AuthUser } | null;
  isLoading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, pass: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_AUTH_VALUE: AuthContextType = {
  user: null,
  session: null,
  isLoading: false,
  signInWithEmail: async () => ({ error: 'Auth not initialized' }),
  signUpWithEmail: async () => ({ error: 'Auth not initialized' }),
  signInWithGoogle: async () => ({ error: 'Auth not initialized' }),
  resetPassword: async () => ({ error: 'Auth not initialized' }),
  signOut: async () => {},
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((authUser) => {
      setUser(authUser);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signInWithEmail = async (email: string, pass: string) => {
    const res = await loginWithEmailPassword(email, pass);
    if (res.user) setUser(res.user);
    return { error: res.error };
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    const res = await registerWithEmailPassword(email, pass);
    if (res.user) setUser(res.user);
    return { error: res.error };
  };

  const signInWithGoogle = async () => {
    const res = await signInWithGoogleNative();
    if (res.user) setUser(res.user);
    return { error: res.error };
  };

  const resetPassword = async (email: string) => {
    const res = await sendPasswordReset(email);
    return { error: res.error };
  };

  const signOut = async () => {
    await signOutFirebaseUser();
    setUser(null);
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
