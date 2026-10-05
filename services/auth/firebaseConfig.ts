import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  // @ts-ignore - getReactNativePersistence is provided by React Native bundle of firebase/auth
  getReactNativePersistence,
  getAuth,
  Auth,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey:
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
    'AIzaSyCI_TIJyybMpBnywMDUeE56TQSyf5mgPWY',
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    'getipovault1.firebaseapp.com',
  projectId:
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'getipovault1',
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    'getipovault1.firebasestorage.app',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '649099972',
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
    '1:649099972:android:0dacd971a8c21982462791',
};

// Initialize Firebase App singleton
export const firebaseApp: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const firebaseAuth: Auth = (() => {
  let isWeb = false;
  try {
    const { Platform } = require('react-native');
    isWeb = Platform?.OS === 'web';
  } catch {
    isWeb = typeof window !== 'undefined' || typeof process !== 'undefined';
  }

  if (isWeb) {
    try {
      return getAuth(firebaseApp);
    } catch {
      // Fallback
    }
  }
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(firebaseApp);
  }
})();

export const firestore: Firestore = getFirestore(firebaseApp);
