import React, { useState } from 'react';
import { ActionSheetIOS, Alert, Image, Platform, Text, View } from 'react-native';
import { launchCamera, launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import { uploadPhoto } from '../api/api';
import { C, FONT } from '../theme';
import { Btn, Field, notify } from './ui';

/**
 * Photo field: take a picture or choose one, it is uploaded to our server and the stored
 * server URL is handed back ('' = removed). There is deliberately no way to type a link.
 */
export function PhotoPicker({
  label = 'Photo',
  value,
  name,
  onChange,
}: {
  label?: string;
  value: string;
  name: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handle = async (res: ImagePickerResponse) => {
    if (res.didCancel) return;
    const a = res.assets?.[0];
    if (res.errorCode || !a?.uri) return notify.error('Could not get the photo', res.errorMessage);
    try {
      setBusy(true);
      onChange(await uploadPhoto(a.uri, a.fileName, a.type));
    } catch (e: any) {
      notify.error('Upload failed', e.message);
    } finally {
      setBusy(false);
    }
  };
  const opts = { mediaType: 'photo' as const, quality: 0.7 as const, maxWidth: 1280, maxHeight: 1280 };
  const camera = () => launchCamera({ ...opts, cameraType: 'front' }).then(handle);
  const gallery = () => launchImageLibrary({ ...opts, selectionLimit: 1 }).then(handle);
  const choose = () =>
    Platform.OS === 'ios'
      ? ActionSheetIOS.showActionSheetWithOptions({ options: ['Cancel', 'Take photo', 'Choose from gallery'], cancelButtonIndex: 0 }, i => (i === 1 ? camera() : i === 2 ? gallery() : undefined))
      : Alert.alert('Add photo', undefined, [{ text: 'Take photo', onPress: camera }, { text: 'Choose from gallery', onPress: gallery }, { text: 'Cancel', style: 'cancel' }]);

  return (
    <Field label={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 76, height: 76, borderWidth: 2, borderColor: C.black, borderRadius: 8, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {value ? <Image source={{ uri: value }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontFamily: FONT.bold, fontSize: 28, color: '#fff' }}>{(name[0] || '?').toUpperCase()}</Text>}
        </View>
        <View style={{ gap: 8 }}>
          <Btn small light label={value ? 'Change photo' : 'Add photo'} busy={busy} onPress={choose} />
          {!!value && <Btn small light label="Remove" onPress={() => onChange('')} />}
        </View>
      </View>
    </Field>
  );
}

/** Avatar for lists/profiles: the uploaded photo, else the initial. */
export function Avatar({ uri, name, size = 40 }: { uri?: string; name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderWidth: 2, borderColor: C.black, borderRadius: 8, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontFamily: FONT.bold, fontSize: size * 0.4, color: '#fff' }}>{(name?.[0] || '?').toUpperCase()}</Text>}
    </View>
  );
}
