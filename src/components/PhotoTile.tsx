import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';

import { colors, radius, spacing, type } from '../theme';
import { chooseOne, notify } from '../lib/alert';
import { isActiveVariant, isDisabledVariant, type InteractiveVariant } from './variants';

/**
 * `square` — grid cell (e.g. 3-up proof photos).
 * `wide`   — one full-width photo, 64–180px tall depending on context.
 * `inline` — small tile sitting in a row next to text.
 */
export type PhotoTileShape = 'square' | 'wide' | 'inline';

/** Where the photo comes from. Factory floor defaults to the camera. */
export type PhotoSource = 'camera' | 'library' | 'ask';

export interface PhotoTileProps {
  /** Local URI or remote URL of an already-captured photo. */
  photoUri?: string | null;
  shape?: PhotoTileShape;
  /**
   * State. `filled` is implied whenever `photoUri` is set — pass it explicitly
   * only to show the filled treatment before the URI has resolved.
   */
  variant?: InteractiveVariant;
  label?: string;
  source?: PhotoSource;
  /** Height override for `wide` (design uses 64–180 depending on the screen). */
  height?: number;
  /** Receives the local file URI of the captured/selected image. */
  onCapture: (uri: string) => void | Promise<void>;
  style?: ViewStyle;
}

async function pick(source: Exclude<PhotoSource, 'ask'>) {
  // Web deliberately skips the permission round-trip. The browser grants both
  // permissions unconditionally, and awaiting them first pushes the picker's
  // `<input type=file>` click out of the tap's user-activation window, which
  // Safari then blocks — the tap appears to do nothing at all.
  if (Platform.OS !== 'web') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      notify(
        source === 'camera' ? 'Camera access needed' : 'Photo access needed',
        'Enable it for FactoryERP in Settings to attach photos.',
      );
      return null;
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: false,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

export function PhotoTile({
  photoUri,
  shape = 'square',
  variant = 'default',
  label,
  source = 'camera',
  height,
  onCapture,
  style,
}: PhotoTileProps) {
  const [busy, setBusy] = useState(false);

  const filled = Boolean(photoUri) || isActiveVariant(variant);
  const disabled = isDisabledVariant(variant) || busy;

  const run = useCallback(
    async (from: Exclude<PhotoSource, 'ask'>) => {
      setBusy(true);
      try {
        const uri = await pick(from);
        if (uri) await onCapture(uri);
      } catch (caught) {
        // `onCapture` often uploads. Without this the rejection escaped as an
        // unhandled promise, the tile reset to empty, and the failure looked
        // exactly like the camera never having opened.
        notify(
          'Could not add the photo',
          caught instanceof Error ? caught.message : String(caught),
        );
      } finally {
        setBusy(false);
      }
    },
    [onCapture],
  );

  const capture = useCallback(async () => {
    if (source === 'ask') {
      const chosen = await chooseOne<Exclude<PhotoSource, 'ask'>>(
        'Add photo',
        { label: 'Take photo', value: 'camera' },
        { label: 'Choose from library', value: 'library' },
      );
      if (chosen) await run(chosen);
      return;
    }
    await run(source);
  }, [run, source]);

  const sizing: ViewStyle =
    shape === 'square'
      ? { aspectRatio: 1, flex: 1 }
      : shape === 'wide'
        ? { height: height ?? 120, alignSelf: 'stretch' }
        : { width: 56, height: 56 };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? 'Add photo'}
      accessibilityState={{ disabled, selected: filled }}
      disabled={disabled}
      onPress={capture}
      style={[
        styles.tile,
        sizing,
        filled ? styles.filled : styles.empty,
        isDisabledVariant(variant) && styles.disabled,
        style,
      ]}
    >
      {photoUri ? <Image source={{ uri: photoUri }} style={styles.image} /> : null}

      {busy ? (
        <ActivityIndicator color={filled ? colors.success : colors.textMuted} />
      ) : (
        <View style={styles.center}>
          <Feather
            name={filled ? 'check' : 'camera'}
            size={shape === 'inline' ? 18 : 22}
            color={filled ? colors.success : colors.textMuted}
          />
          {label && shape !== 'inline' ? (
            <Text style={[type.caption, filled && styles.filledLabel]} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: spacing.tight,
  },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filled: {
    borderWidth: 1.5,
    borderColor: colors.success,
    backgroundColor: colors.successBg,
  },
  filledLabel: {
    color: colors.success,
  },
  disabled: {
    opacity: 0.4,
  },
  center: {
    alignItems: 'center',
    gap: 4,
  },
  /** A captured photo fills the tile; the check badge sits on top of it. */
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    resizeMode: 'cover',
    opacity: 0.85,
  },
});
