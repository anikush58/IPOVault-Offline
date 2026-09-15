try {
  require('react-native-url-polyfill/auto');
} catch {}
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://vktjgihxfdvqkvpwnagp.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrdGpnaWh4ZmR2cWt2cHduYWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxMjM3MjYsImV4cCI6MjEwNDY5OTcyNn0.OfgXYtBwmY2VUHg7VDt92fJzLZabIkmqEA6SJcDHB5I';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeAsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
