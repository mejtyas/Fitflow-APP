/** @param {import('expo/config').ConfigContext} context */
module.exports = ({ config }) => ({
  ...config,
  name: 'Lixo',
  // Must stay `fitflow-app`: it is the slug of the EAS project referenced by extra.eas.projectId.
  slug: 'fitflow-app',
  owner: 'mejtyas',
  version: '1.1.0',
  orientation: 'portrait',
  scheme: 'lixo',
  userInterfaceStyle: 'dark',
  icon: './assets/images/icon.png',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.fitflow.lixo',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.mejtyas.lixo',
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
    eas: {
      projectId: 'c945c55f-9cce-489a-9cc3-0e700d43b66d',
    },
  },
});
