import 'react-native-url-polyfill/auto';

import { createClient, processLock } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { env } from '@/lib/env';
import { secureSessionStorage } from '@/lib/secure-storage';

export const supabase = createClient<Database>(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
    global: {
      headers: { 'X-Client-Info': 'fitflow-mobile/1.0.0' },
    },
  },
);
