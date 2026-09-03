import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

export interface BottomSheetModalProps {
  visible: boolean;
  /** Backdrop tap and the Android hardware back button both call this. */
  onClose: () => void;
  /** 0-1. Matches `react-native-modal`'s prop of the same name. */
  backdropOpacity?: number;
  /** Lift the sheet clear of the keyboard — for sheets with text inputs. */
  avoidKeyboard?: boolean;
  /** Extra style on the sheet container, not on the sheet body itself. */
  style?: ViewStyle;
  children: React.ReactNode;
}

const DURATION = 220;

/**
 * The app's one bottom sheet.
 *
 * Replaces `react-native-modal`, which every sheet in the app used to import
 * directly. That package's last release is `14.0.0-rc.1` from March 2025 and
 * its only dependency, `react-native-animatable@1.4.0`, still uses the legacy
 * element-ref pattern React 19 removed — which is where the
 * "Accessing element.ref was removed in React 19" warning came from, in as
 * many places as there were sheets. There is no React 19-compatible release to
 * upgrade to, so the fix is to stop depending on it: React Native's own
 * `Modal` covers everything these three sheets used (backdrop press, hardware
 * back, keyboard avoidance) in about eighty lines.
 *
 * Mount is held open past `visible` going false so the exit animation has
 * something to animate; that is the one piece `react-native-modal` was really
 * providing.
 */
export function BottomSheetModal({
  visible,
  onClose,
  backdropOpacity = 0.5,
  avoidKeyboard = false,
  style,
  children,
}: BottomSheetModalProps) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  // Falls back to half the window until the sheet has been laid out once, so
  // the very first open still slides in from off-screen rather than popping.
  const [sheetHeight, setSheetHeight] = useState(
    () => Dimensions.get('window').height / 2,
  );

  useEffect(() => {
    if (visible) setMounted(true);

    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: DURATION,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });

    return () => animation.stop();
  }, [visible, progress]);

  if (!mounted) return null;

  const onLayoutSheet = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) setSheetHeight(height);
  };

  const content = (
    <Animated.View
      onLayout={onLayoutSheet}
      style={[
        styles.sheet,
        style,
        {
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [sheetHeight, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );

  return (
    <Modal
      visible
      transparent
      // The slide and fade below are ours; letting RN animate as well would
      // run two transitions over the same frames.
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, backdropOpacity],
              }),
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>

        {avoidKeyboard ? (
          <KeyboardAvoidingView
            // Android resizes the window itself; adding padding on top of that
            // double-counts the keyboard and leaves a gap under the sheet.
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardView}
            pointerEvents="box-none"
          >
            {content}
          </KeyboardAvoidingView>
        ) : (
          content
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000000',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
  },
});
