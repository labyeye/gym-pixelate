import React from 'react';
import { StatusBar, Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { ToastHost } from './src/components/ui';
import { FONT } from './src/theme';

// App-wide default so any Text/TextInput without an explicit style renders in DM Sans.
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = [{ fontFamily: FONT.regular }, (Text as any).defaultProps.style];
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.style = [{ fontFamily: FONT.regular }, (TextInput as any).defaultProps.style];

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <RootNavigator />
        <ToastHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
