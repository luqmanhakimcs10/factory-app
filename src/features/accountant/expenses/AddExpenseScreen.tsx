import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import {
  Button,
  Card,
  NumericKeypadSheet,
  PhotoTile,
  TopBar,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import {
  EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  type ExpenseCategory,
} from '../../../data/expenseCategories';
import {
  RECURRING_TYPES,
  recurringLabel,
  type RecurringType,
} from '../../../data/recurringTypes';
import { useSession } from '../../../state/session';
import { formatRs } from '../../../lib/ledgerMath';
import type { AccountantStackParamList } from '../../../navigation/AccountantStack';
import { addExpense } from '../api';

type Props = NativeStackScreenProps<AccountantStackParamList, 'AddExpense'>;

export function AddExpenseScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const profile = useSession((state) => state.profile);

  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [otherName, setOtherName] = useState('');
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const [recurring, setRecurring] = useState<RecurringType>('none');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsName = category === 'other';
  const canSubmit =
    category !== null &&
    amount > 0 &&
    Boolean(photoUri) &&
    (!needsName || otherName.trim().length > 0);

  const submit = async () => {
    if (!category || !photoUri || !profile) return;

    setWorking(true);
    setError(null);
    try {
      await addExpense({
        factoryId: profile.factory_id,
        profileId: profile.id,
        category,
        otherName: needsName ? otherName.trim() : null,
        amount,
        description: description.trim() || null,
        recurringType: recurring,
        photoUri,
      });
      navigation.goBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Add Expense" onPressBack={navigation.goBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card title="Category">
          <View style={styles.chips}>
            {EXPENSE_CATEGORIES.map((entry) => {
              const selected = entry === category;
              return (
                <Pressable
                  key={entry}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setCategory(entry)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[type.pill, selected && styles.chipLabelSelected]}>
                    {expenseCategoryLabel(entry)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {needsName ? (
            <TextInput
              style={styles.input}
              placeholder="Expense name"
              placeholderTextColor={colors.textMuted}
              value={otherName}
              onChangeText={setOtherName}
            />
          ) : null}
        </Card>

        <Card title="Amount">
          {/* Uncapped: an expense has no outstanding balance to clamp against. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enter amount"
            onPress={() => setKeypadOpen(true)}
            style={styles.amountField}
          >
            <Text style={[type.numeric, amount === 0 && styles.amountEmpty]}>
              {amount === 0 ? 'Tap to enter' : formatRs(amount)}
            </Text>
            <Feather name="edit-2" size={16} color={colors.textMuted} />
          </Pressable>
        </Card>

        <Card title="Description">
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Optional"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
        </Card>

        <Card title="Proof photo">
          <PhotoTile
            shape="wide"
            height={180}
            photoUri={photoUri}
            label={photoUri ? 'Photo added' : 'Tap to photograph the receipt'}
            onCapture={setPhotoUri}
          />
        </Card>

        <Card title="Recurring">
          <View style={styles.chips}>
            {RECURRING_TYPES.map((entry) => {
              const selected = entry === recurring;
              return (
                <Pressable
                  key={entry}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setRecurring(entry)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[type.pill, selected && styles.chipLabelSelected]}>
                    {recurringLabel(entry)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {error ? (
          <Card tone="danger">
            <Text style={[type.bodyStrong, styles.errorTitle]}>
              Could not submit the expense
            </Text>
            <Text style={type.body}>{error}</Text>
          </Card>
        ) : null}
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.content) }]}
      >
        <Button
          label="Submit for Approval"
          flex
          disabled={!canSubmit}
          loading={working}
          onPress={submit}
        />
      </View>

      <NumericKeypadSheet
        visible={keypadOpen}
        title="Expense amount"
        initialValue={amount === 0 ? '' : String(amount)}
        placeholder="Enter amount"
        maxLength={9}
        minLength={1}
        format={(digits) => formatRs(Number(digits))}
        onSubmit={(digits) => {
          setAmount(Number(digits));
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight - 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.neutralAccent,
  },
  chipLabelSelected: {
    color: colors.primary,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: spacing.content - 4,
    paddingVertical: spacing.tight,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    fontFamily: type.body.fontFamily,
    fontSize: 15,
    color: colors.textPrimary,
  },
  textarea: {
    minHeight: 88,
    textAlignVertical: 'top',
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
