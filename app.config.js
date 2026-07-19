/** @param {import('expo/config').ConfigContext} context */
module.exports = ({ config }) => ({
  ...config,
  name: 'FitFlow',
  slug: 'fitflow-app',
  owner: 'mejtyas',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'fitflow',
  userInterfaceStyle: 'dark',
  icon: './assets/images/icon.png',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.mejtyas.fitflow',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.mejtyas.fitflow',
    adaptiveIcon: {
      backgroundColor: '#141315',
      foregroundImage: './assets/images/icon.png',
    },
    predictiveBackGestureEnabled: true,
    permissions: ['android.permission.POST_NOTIFICATIONS', 'android.permission.VIBRATE'],
  },
  web: {
    output: 'static',
    favicon: './assets/images/icon.png',
  },
  plugins: [
    'expo-router',
    ['expo-secure-store', { configureAndroidBackup: true }],
    ['expo-notifications', { defaultChannel: 'rest-timers' }],
    '@react-native-community/datetimepicker',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#141315',
        image: './assets/images/icon.png',
        imageWidth: 160,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    supabasePublishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? '',
    eas: {
      projectId: 'c945c55f-9cce-489a-9cc3-0e700d43b66d',
    },
  },
});
