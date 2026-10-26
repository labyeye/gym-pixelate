import React from 'react';
import { Image } from 'react-native';

export default function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <Image
      source={require('../assets/images/whatsapp.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
