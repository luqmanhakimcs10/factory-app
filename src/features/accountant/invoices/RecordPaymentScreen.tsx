import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, TopBar } from '../../../components';
import { colors } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import { remainingFor } from '../../../lib/ledgerMath';
import type { AccountantStackParamList } from '../../../navigation/AccountantStack';
import { getInvoice, recordInvoicePayment } from '../api';
import { PaymentEntryScreen } from '../PaymentEntryScreen';

type Props = NativeStackScreenProps<AccountantStackParamList, 'RecordPayment'>;

export function RecordPaymentScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(() => getInvoice(orderId), [orderId]);
  const { data: invoice, loading } = useQuery(fetcher);

  if (loading && !invoice) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar variant="bar" title="Record Payment" onPressBack={navigation.goBack} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!invoice || !factoryId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar variant="bar" title="Record Payment" onPressBack={navigation.goBack} />
        <EmptyState icon="alert-triangle" title="Could not load this invoice" />
      </View>
    );
  }

  return (
    <PaymentEntryScreen
      title="Record Payment"
      trailing={invoice.code}
      remainingLabel="Remaining Receivable"
      remaining={remainingFor(invoice)}
      amountLabel="Amount Received"
      onBack={navigation.goBack}
      onConfirm={async (amount, photoUri) => {
        await recordInvoicePayment({ factoryId, orderId, amount, photoUri });
        navigation.goBack();
      }}
    />
  );
}
