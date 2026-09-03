import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';

import {
  Button,
  Card,
  NumericKeypadSheet,
  PhotoTile,
  StaticField,
  TopBar,
} from '../../components';
import { colors, layout, radius, spacing, type } from '../../theme';
import { capToRemaining, formatRs } from '../../lib/ledgerMath';

export interface PaymentEntryScreenProps {
  title: string;
  /** "Remaining Receivable" / "Remaining Payable". */
  remainingLabel: string;
  remaining: number;
  /** "Amount Received" / "Amount to Pay". */
  amountLabel: string;
  trailing?: string;
  onBack: () => void;
  onConfirm: (amount: number, photoUri: string) => Promise<void>;
}

/**
 * The shared shape of Record Payment and Pay Bill — identical but for their
 * labels and which RPC they call.
 *
 * The keypad clamps the entered amount to what is outstanding. That is a
 * convenience: both RPCs re-derive the remaining balance server-side and reject
 * an overpayment regardless of what the client sends.
 */
export function PaymentEntryScreen({
  title,
  remainingLabel,
  remaining,
  amountLabel,
  trailing,
  onBack,
  onConfirm,
}: PaymentEntryScreenProps) {
  const insets = useSafeAreaInsets();

  const [amount, setAmount] = useState(0);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = amount > 0 && Boolean(photoUri);

  const confirm = async () => {
    if (!photoUri) return;
    setWorking(true);
    setError(null);
    try {
      await onConfirm(amount, photoUri);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title={title} trailing={trailing} onPressBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <StaticField
          icon="credit-card"
          label={remainingLabel}
          value={formatRs(remaining)}
        />

        <Card title={amountLabel}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Enter ${amountLabel}`}
            onPress={() => setKeypadOpen(true)}
            style={styles.amountField}
          >
            <Text style={[type.numeric, amount === 0 && styles.amountEmpty]}>
              {amount === 0 ? 'Tap to enter' : formatRs(amount)}
            </Text>
            <Feather name="edit-2" size={16} color={colors.textMuted} />
          </Pressable>
          <Text style={type.caption}>
            Capped at the outstanding {formatRs(remaining)}.
          </Text>
        </Card>

        <Card title="Payment proof">
          <PhotoTile
            shape="wide"
            height={180}
            photoUri={photoUri}
            label={photoUri ? 'Photo added' : 'Tap to photograph the receipt'}
            onCapture={setPhotoUri}
          />
        </Card>

        {error ? (
          <Card tone="danger">
            <Text style={[type.bodyStrong, styles.errorTitle]}>
              Could not record the payment
            </Text>
            <Text style={type.body}>{error}</Text>
          </Card>
        ) : null}
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.content) }]}
      >
        <Button
          label="Confirm Payment"
          flex
          disabled={!canConfirm}
          loading={working}
          onPress={confirm}
        />
      </View>

      <NumericKeypadSheet
        visible={keypadOpen}
        title={amountLabel}
        initialValue={amount === 0 ? '' : String(amount)}
        placeholder="Enter amount"
        maxLength={9}
        minLength={1}
        format={(digits) => formatRs(Number(digits))}
        onSubmit={(digits) => {
          setAmount(capToRemaining(Number(digits), remaining));
          setKeypadOpen(false);
        }}
        onClose={() => setKeypadOpen(false)}
      />
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
  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.content - 2,
    paddingVertical: spacing.tight + 4,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  amountEmpty: {
    color: colors.textMuted,
    fontSize: 18,
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
