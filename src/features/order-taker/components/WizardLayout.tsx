import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBar } from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { WizardProgress } from './WizardProgress';

export interface WizardLayoutProps {
  title: string;
  /** 1-based wizard step; omit on screens outside the dotted flow. */
  step?: number;
  /** TopBar right-hand indicator, e.g. "Sheet 2 of 4". */
  trailing?: string;
  onBack?: () => void;
  heading?: string;
  subtext?: string;
  /** Sticky footer — one or two `Button`s. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * The shared shape of every wizard screen: TopBar, dots, scrollable content,
 * sticky footer. Screens supply content and footer only, so spacing stays
 * identical across all ten of them.
 */
export function WizardLayout({
  title,
  step,
  trailing,
  onBack,
  heading,
  subtext,
  footer,
  children,
}: WizardLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title={title} trailing={trailing} onPressBack={onBack} />
      {step ? <WizardProgress step={step} /> : null}

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
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
