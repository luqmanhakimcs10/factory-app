import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation/RootNavigator';
import { colors, fontAssets } from './src/theme';

// Hold the splash screen until the three IBM Plex families are in memory —
// otherwise the first frame renders in the system font and visibly reflows.
void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) setReady(true);
  }, [fontsLoaded, fontError]);

  const onLayout = useCallback(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }} onLayout={onLayout}>
        <StatusBar style="dark" />
        <RootNavigator />
      </View>
    </SafeAreaProvider>
  );
}
