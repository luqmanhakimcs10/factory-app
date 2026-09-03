import 'dotenv/config';
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'FactoryERP',
  slug: 'factory-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'factoryerp',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.alrehman.factoryerp',
    infoPlist: {
      NSCameraUsageDescription:
        'FactoryERP uses the camera to photograph clients, design sheets, proof samples and defects.',
      NSPhotoLibraryUsageDescription:
        'FactoryERP needs photo library access to attach existing photos to orders and inspections.',
    },
  },
  android: {
    package: 'com.alrehman.factoryerp',
    adaptiveIcon: {
      backgroundColor: '#EEF0EE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['CAMERA', 'READ_MEDIA_IMAGES'],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
    // Single-page output: there is no Expo Router here, so react-navigation
    // holds all routing in memory and never writes to the URL bar. One
    // `index.html` is the whole site, which is why the Vercel config rewrites
    // every unmatched path back to it.
    output: 'single',
  },
  plugins: [
    'expo-secure-store',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#EEF0EE',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'FactoryERP needs photo library access to attach existing photos to orders and inspections.',
        cameraPermission:
          'FactoryERP uses the camera to photograph clients, design sheets, proof samples and defects.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'FactoryERP uses the camera to photograph clients, design sheets, proof samples and defects.',
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  },
};

export default config;
