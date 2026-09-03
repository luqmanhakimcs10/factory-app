import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import {
  platformColors,
  platformLayout,
  platformRadius,
  platformSpacing,
  platformType,
} from '../../../theme-platform';
import { BottomSheetModal } from '../../../components/BottomSheetModal';
import { InlineError, PlatformButton } from '../components';

export interface GenerateInvoiceModalProps {
  visible: boolean;
  factoryName: string;
  /** Pre-fills Amount with the factory's monthly fee, the usual case. */
  suggestedAmount: number | null;
  onClose: () => void;
  onSubmit: (args: { amount: number; description: string; dueDate: string }) => Promise<void>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GenerateInvoiceModal({
  visible,
  factoryName,
  suggestedAmount,
  onClose,
  onSubmit,
}: GenerateInvoiceModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmount(suggestedAmount ? String(suggestedAmount) : '');
    setDescription('');
    setDueDate(today());
    setError(null);
  }, [visible, suggestedAmount]);

  const submit = async () => {
    const value = Number(amount);
    if (!amount.trim() || Number.isNaN(value) || value <= 0) {
      setError('Amount is required and must be more than zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setError('Due date must look like YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Description falls back to "Invoice" server-side too, but doing it here
      // as well keeps the row's text honest about what the operator saw.
      await onSubmit({
        amount: value,
        description: description.trim() || 'Invoice',
        dueDate,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} avoidKeyboard>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={platformType.heading}>Generate Invoice</Text>
            <Text style={platformType.caption} numberOfLines={1}>
              {factoryName}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            onPress={onClose}
          >
            <Feather name="x" size={20} color={platformColors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.field}>
            <Text style={platformType.label}>Amount</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={platformColors.textSecondary}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={platformType.label}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Invoice"
              placeholderTextColor={platformColors.textSecondary}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={platformType.label}>Due Date</Text>
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={platformColors.textSecondary}
              style={styles.input}
            />
            <Text style={platformType.caption}>
              Stamped once and never moved. A payment&apos;s paid date is recorded
              separately, when it is marked paid.
            </Text>
          </View>

          <InlineError message={error} />
        </View>

        <View style={styles.footer}>
          <PlatformButton label="Cancel" tone="quiet" onPress={onClose} style={styles.flex} />
          <PlatformButton
            label="Generate Invoice"
            tone="secondary"
            onPress={submit}
            loading={saving}
            style={styles.flex}
          />
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: platformColors.bgApp,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: platformSpacing.tight,
    padding: platformSpacing.content,
    borderBottomWidth: platformLayout.hairline,
    borderBottomColor: platformColors.border,
  },
  headerText: { flex: 1 },
  body: { padding: platformSpacing.content, gap: platformSpacing.block },
  field: { gap: platformSpacing.hair + 2 },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: platformRadius.card,
    borderWidth: platformLayout.hairline,
    borderColor: platformColors.border,
    backgroundColor: platformColors.bgSurface,
    color: platformColors.textPrimary,
    fontSize: 15,
  },
  footer: {
    flexDirection: 'row',
    gap: platformSpacing.tight,
    padding: platformSpacing.content,
    borderTopWidth: platformLayout.hairline,
    borderTopColor: platformColors.border,
    backgroundColor: platformColors.bgSurface,
  },
  flex: { flex: 1 },
});
