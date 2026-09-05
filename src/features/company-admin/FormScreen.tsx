import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, TopBar } from '../../components';
import { colors, layout, spacing, type } from '../../theme';

export interface FormScreenProps {
  title: string;
  onBack: () => void;
  /** "Save Employee". Grey and inert until `canSave`. */
  saveLabel: string;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  /** Whatever the last save attempt threw, rendered above the footer. */
  error: string | null;
  children: React.ReactNode;
}

/**
 * The frame every master-data form shares: header, scrolling fields, one
 * sticky Save.
 *
 * Save is disabled rather than hidden when the required fields are not set, and
 * `Button` renders a disabled action visibly lightened — the form has to *look*
 * blocked, not just refuse the tap, or the only feedback for a missing field is
 * a button that appears broken.
 *
 * Fields sit straight on the screen background with a small caption above each,
 * rather than inside `Card`s. That is what the source mockup does on these
 * screens, and it is why these forms do not reuse the Accountant module's
 * card-per-field layout.
 */
export function FormScreen({
  title,
  onBack,
  saveLabel,
  canSave,
  saving,
  onSave,
  error,
  children,
}: FormScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title={title} onPressBack={onBack} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {children}

        {error ? (
          <Card tone="danger">
            <Text style={[type.bodyStrong, styles.errorTitle]}>Could not save</Text>
            <Text style={type.body}>{error}</Text>
          </Card>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, spacing.content) },
        ]}
      >
        <Button
          label={saveLabel}
          icon="check"
          flex
          disabled={!canSave}
          loading={saving}
          onPress={onSave}
        />
      </View>
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
  errorTitle: {
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.content,
    paddingTop: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
});
