// "By continuing you agree to the Terms of Service and Privacy Policy" with tappable links (open in the browser).
// Shown on the Login and Register screens; the sign-in request carries acceptTerms so acceptance is stored once per account.
import React from 'react';
import { Linking, Text, TextStyle } from 'react-native';
import { C } from '../theme';

const SITE = 'https://www.pixelatenest.com/legal';

export default function LegalLinks({
  prefix = 'By continuing you agree to the',
  style,
}: {
  prefix?: string;
  style?: TextStyle;
}) {
  const link: TextStyle = {
    color: C.primary,
    fontWeight: '400',
    textDecorationLine: 'underline',
  };
  return (
    <Text
      style={[
        {
          fontSize: 12,
          color: C.textMuted,
          textAlign: 'center',
          lineHeight: 18,
        },
        style,
      ]}
    >
      {prefix}{' '}
      <Text
        style={link}
        onPress={() => Linking.openURL(`${SITE}/terms-of-service.html`)}
      >
        Terms of Service
      </Text>{' '}
      and{' '}
      <Text
        style={link}
        onPress={() => Linking.openURL(`${SITE}/privacy-policy.html`)}
      >
        Privacy Policy
      </Text>
      .
    </Text>
  );
}
