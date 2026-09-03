import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBar } from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';

const STEPS = 4;

/** Four dots: Design Sheet, Details, Stages, Review. */
function Progress({ step }: { step: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: STEPS }, (_, index) => {
        const position = index + 1;
        return (
          <View
            key={position}
            style={[
              styles.dot,
              position === step && styles.dotCurrent,
              position < step && styles.dotDone,
            ]}
          />
        );
      })}
    </View>
  );
}

export interface JobCardLayoutProps {
  title: string;
  /** 1-based wizard step; omit on the screens after Review. */
  step?: number;
  trailing?: string;
  onBack?: () => void;
  heading?: string;
  subtext?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

export function JobCardLayout({
  title,
  step,
  trailing,
  onBack,
  heading,
  subtext,
  footer,
  children,
}: JobCardLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title={title} trailing={trailing} onPressBack={onBack} />
      {step ? <Progress step={step} /> : null}

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {heading ? <Text style={type.title}>{heading}</Text> : null}
        {subtext ? <Text style={type.label}>{subtext}</Text> : null}
        {children}
      </ScrollView>

      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, spacing.content) },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.tight - 2,
    paddingVertical: spacing.tight + 2,
    backgroundColor: colors.surface,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotDone: {
    backgroundColor: colors.primary,
    opacity: 0.45,
  },
  dotCurrent: {
    width: 22,
    backgroundColor: colors.primary,
  },
  content: {
    padding: spacing.content,
    gap: spacing.block,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.tight + 2,
    paddingHorizontal: spacing.content,
    paddingTop: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
});
