import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, TopBar } from '../../../components';
import { colors } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import { remainingPayableFor } from '../../../lib/ledgerMath';
import type { AccountantStackParamList } from '../../../navigation/AccountantStack';
import { getBill, payBill } from '../api';
import { PaymentEntryScreen } from '../PaymentEntryScreen';

type Props = NativeStackScreenProps<AccountantStackParamList, 'PayBill'>;

export function PayBillScreen({ navigation, route }: Props) {
  const { purchaseOrderId } = route.params;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(() => getBill(purchaseOrderId), [purchaseOrderId]);
  const { data: bill, loading } = useQuery(fetcher);

  if (loading && !bill) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar variant="bar" title="Pay Bill" onPressBack={navigation.goBack} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!bill || !factoryId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar variant="bar" title="Pay Bill" onPressBack={navigation.goBack} />
        <EmptyState icon="alert-triangle" title="Could not load this bill" />
      </View>
    );
  }

  return (
    <PaymentEntryScreen
      title="Pay Bill"
      trailing={bill.poNumber}
      remainingLabel="Remaining Payable"
      remaining={remainingPayableFor(bill)}
      amountLabel="Amount to Pay"
      onBack={navigation.goBack}
      onConfirm={async (amount, photoUri) => {
        await payBill({ factoryId, purchaseOrderId, amount, photoUri });
        navigation.goBack();
      }}
    />
  );
}
