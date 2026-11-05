import React, { useState } from 'react';
import { StatusBar, Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { LockGate } from './src/security/appLock';
import RootNavigator from './src/navigation/RootNavigator';
import { ToastHost } from './src/components/ui';
import TermsGate from './src/components/TermsGate';
import AnimatedSplashScreen from './src/screens/AnimatedSplashScreen';
import { FONT } from './src/theme';

// App-wide default so any Text/TextInput without an explicit style renders in Inter.
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = [
  { fontFamily: FONT.regular },
  (Text as any).defaultProps.style,
];
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.style = [
  { fontFamily: FONT.regular },
  (TextInput as any).defaultProps.style,
];

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [rev, setRev] = useState(0);
  if (!splashDone) {
    return (
      <>
        <StatusBar barStyle="dark-content" />
        <AnimatedSplashScreen onDone={() => setSplashDone(true)} />
      </>
    );
  }
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <LockGate>
          <RootNavigator key={rev} />
        </LockGate>
        <TermsGate onAccepted={() => setRev((n) => n + 1)} />
        <ToastHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
