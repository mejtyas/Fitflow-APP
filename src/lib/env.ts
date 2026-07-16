import Constants from 'expo-constants';

type AppExtra = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as AppExtra;
const supabaseUrl = extra.supabaseUrl?.trim() ?? '';
const supabasePublishableKey = extra.supabasePublishableKey?.trim() ?? '';

export const env = {
  supabaseUrl: supabaseUrl || 'https://unconfigured.supabase.co',
  supabasePublishableKey: supabasePublishableKey || 'sb_publishable_unconfigured',
  isConfigured: Boolean(supabaseUrl && supabasePublishableKey),
} as const;

export const configurationError = env.isConfigured
  ? null
  : 'Supabase is not configured. Add the same NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY values used by FitFlow.';
