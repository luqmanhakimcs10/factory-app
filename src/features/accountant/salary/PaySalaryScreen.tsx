import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Button,
  Card,
  EmptyState,
  NoteCard,
  PhotoTile,
  StaticField,
  TopBar,
} from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import { formatRs, loanInstallmentFor, netPayFor } from '../../../lib/ledgerMath';
import type { AccountantStackParamList } from '../../../navigation/AccountantStack';
import { getSalaryRecord, listLoans, paySalary } from '../api';

type Props = NativeStackScreenProps<AccountantStackParamList, 'PaySalary'>;

/**
 * No amount keypad, deliberately.
 *
 * Net pay is computed from the record and the worker's loan — typing it by hand
 * would let a figure be paid that does not match what the breakdown says is
 * owed. Proof photo only.
 */
export function PaySalaryScreen({ navigation, route }: Props) {
  const { salaryRecordId } = route.params;
  const insets = useSafeAreaInsets();
  const factoryId = useSession((state) => state.profile?.factory_id);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    const [record, loans] = await Promise.all([
      getSalaryRecord(salaryRecordId),
      listLoans(factoryId as string),
    ]);
    return { record, loans };
  }, [salaryRecordId, factoryId]);

  const { data, loading } = useQuery(fetcher, Boolean(factoryId));
  const record = data?.record;
  const loans = data?.loans ?? [];
  const installment = record ? loanInstallmentFor(record.person_id, loans) : 0;

  const confirm = async () => {
    if (!photoUri || !factoryId) return;
    setWorking(true);
    setError(null);
    try {
      // One RPC: marks the salary paid and appends the loan installment in the
      // same transaction.
      await paySalary({ factoryId, salaryRecordId, photoUri });
      navigation.goBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title="Pay Salary"
        trailing={record?.period}
        onPressBack={navigation.goBack}
      />

      {loading && !record ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !record ? (
        <EmptyState icon="alert-triangle" title="Could not load this salary record" />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <StaticField
              icon="dollar-sign"
              label="Net Pay"
              value={formatRs(netPayFor(record, loans))}
            />
            <StaticField
              icon="user"
              label="Worker"
              value={record.person?.full_name ?? 'Unknown worker'}
            />

            {installment > 0 ? (
              <NoteCard
                text={`Paying this salary also records this period's loan installment of ${formatRs(installment)} against the worker's loan.`}
              />
            ) : null}

            <Card title="Payment proof">
              <PhotoTile
                shape="wide"
                height={180}
                photoUri={photoUri}
                label={photoUri ? 'Photo added' : 'Tap to photograph the payment'}
                onCapture={setPhotoUri}
              />
            </Card>

            {error ? (
              <Card tone="danger">
                <Text style={[type.bodyStrong, styles.errorTitle]}>
                  Could not pay this salary
                </Text>
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
              label="Confirm Payment"
              flex
              disabled={!photoUri}
              loading={working}
              onPress={confirm}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loader: {
    marginTop: spacing.content * 3,
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
