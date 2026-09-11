try {
  require('react-native-url-polyfill/auto');
} catch {}
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://vktjgihxfdvqkvpwnagp.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_SfPSCRFkEiHvKV-FJYmxvw_s7DLQeLa';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeAsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
